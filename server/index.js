// server/index.js — WebSocket server + room management

'use strict';

const { WebSocketServer } = require('ws');
const { URL }             = require('url');
const { GameRoom }        = require('./GameRoom');

const PORT = Number(process.env.PORT) || 3001;

// roomId (string) → GameRoom
const rooms = new Map();

const wss = new WebSocketServer({ port: PORT });
console.log(`[server] WebSocket listening on port ${PORT}`);

// ── Empty-room removal grace period ───────────────────────────────────────
// A rematch makes both clients disconnect and reconnect in quick succession
// (scene.restart() on each side). Deleting the room the instant it goes
// empty races whichever client reconnects first against whichever client's
// close event is still in flight, so the two players can land in different
// room instances. Instead, give the room a 20s "Continue?" grace window
// before deleting it, broadcasting an arcade-style countdown (9..0, one
// tick every 2s) so anyone already back can see the room hasn't been
// abandoned. The countdown keeps running even once a single player
// reconnects — it only stops early once BOTH clients are back (handled by
// the per-tick check below) — and is purely visual otherwise: GameRoom
// won't start a match until both slots are filled regardless.
const RECONNECT_TICK_MS = 2000;
const RECONNECT_START_SECONDS = 9;

// A reconnecting client can race its own old socket's close: the old socket
// may still be registered in room.clients even though it's already
// CLOSING/CLOSED, indistinguishable from "genuinely occupied" if only
// checked for truthiness. Treat a non-OPEN occupant as stale/evictable.
function isStaleSocket(existingWs) {
  return Boolean(existingWs) && existingWs.readyState !== 1 /* OPEN */;
}

function cancelEmptyRoomGrace(room) {
  if (room._emptyRoomGraceTimer) {
    clearInterval(room._emptyRoomGraceTimer);
    room._emptyRoomGraceTimer = null;
  }
}

function startEmptyRoomGrace(roomId, room) {
  cancelEmptyRoomGrace(room);
  let secondsLeft = RECONNECT_START_SECONDS;
  room.broadcast({ type: 'reconnectCountdown', secondsLeft }); // "9" immediately

  room._emptyRoomGraceTimer = setInterval(() => {
    // Both clients reconnected — room is alive again, nothing left to do.
    if (room.clients.red && room.clients.blue) {
      cancelEmptyRoomGrace(room);
      return;
    }

    secondsLeft -= 1;
    if (secondsLeft < 0) {
      // "0" was already broadcast and shown for its full 2s — give up now.
      cancelEmptyRoomGrace(room);
      if (!(room.clients.red && room.clients.blue) && rooms.get(roomId) === room) {
        // Lowercase 'gameover' is deliberately distinct from the camelCase
        // 'gameOver' win-condition message — this is "nobody came back",
        // not a real match result.
        room.broadcast({ type: 'gameover', reason: 'abandoned' });
        rooms.delete(roomId);
        console.log(`[server] Room removed (abandoned): ${roomId}`);
      }
      return;
    }

    room.broadcast({ type: 'reconnectCountdown', secondsLeft });
  }, RECONNECT_TICK_MS);
}

wss.on('connection', (ws, req) => {
  // ── Parse room from query-string ──────────────────────────────────────────
  let roomId;
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    roomId = url.searchParams.get('room');
  } catch {
    roomId = null;
  }

  if (!roomId || roomId.trim() === '') {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing ?room= parameter' }));
    ws.close(1008, 'missing room');
    return;
  }

  // ── Get or create room ────────────────────────────────────────────────────
  // Note: a lone reconnect does NOT cancel a pending empty-room grace timer
  // here — the countdown keeps broadcasting until BOTH clients are back
  // (checked inside the timer itself) or it expires, per the visible
  // "Continue?" countdown UX.
  let room = rooms.get(roomId);
  if (!room) {
    room = new GameRoom(roomId, {
      // Called from handleRestart() (synchronously, before either client
      // could possibly have reconnected, so the grace/countdown timer
      // starts on every restart attempt) and from removeClient() (when one
      // player leaves during the gameOver phase with no rematch in
      // progress) — both cases where waiting for "both sockets confirmed
      // closed" would miss the window or never happen at all.
      onRequestEmptyRoomGrace: () => startEmptyRoomGrace(roomId, room),
    });
    rooms.set(roomId, room);
    console.log(`[server] Room created: ${roomId}`);
  }

  // ── Assign player slot (first = red, second = blue) ───────────────────────
  // A stale occupant (its close hasn't been processed yet) is evicted via
  // the normal removeClient() path before handing its slot to the new
  // connection, so removeClient's own bookkeeping (nulling the slot,
  // broadcasting opponentLeft, entering the empty-room grace window if both
  // end up empty) stays consistent.
  let playerId;
  if (!room.clients.red || isStaleSocket(room.clients.red)) {
    if (room.clients.red) room.removeClient(room.clients.red);
    playerId = 'red';
  } else if (!room.clients.blue || isStaleSocket(room.clients.blue)) {
    if (room.clients.blue) room.removeClient(room.clients.blue);
    playerId = 'blue';
  } else {
    console.log(`[server] Room full, rejecting connection to ${roomId}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    ws.close(1008, 'room full');
    return;
  }

  console.log(`[server] ${playerId} joined room ${roomId}`);
  room.addClient(ws, playerId);

  // ── Incoming messages ─────────────────────────────────────────────────────
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'input') {
      room.queueInput(playerId, msg);
    } else if (msg.type === 'restart') {
      room.handleRestart();
    } else if (msg.type === 'ready') {
      room.handleReady(playerId);
    }
  });

  // ── Disconnection ─────────────────────────────────────────────────────────
  ws.on('close', () => {
    console.log(`[server] ${playerId} left room ${roomId}`);
    room.removeClient(ws);

    if (!room.clients.red && !room.clients.blue) {
      startEmptyRoomGrace(roomId, room);
    }
  });

  ws.on('error', (err) => {
    console.error(`[server] WS error (room=${roomId}, player=${playerId}):`, err.message);
  });
});

// Periodic cleanup of orphaned rooms (belt-and-suspenders)
setInterval(() => {
  for (const [id, room] of rooms) {
    if (!room.clients.red && !room.clients.blue) {
      rooms.delete(id);
    }
  }
}, 60_000);
