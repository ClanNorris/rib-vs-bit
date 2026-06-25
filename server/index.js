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

// ── Post-match "Continue?" grace period ───────────────────────────────────
// Every match end (GameRoom._endGame()) arms this window, regardless of
// connection state — players get a 20s "Continue?" grace period to rematch
// before the room is torn down, with an arcade-style countdown (9..0, one
// tick every 2s) broadcast the whole time. It's also (re)armed from
// handleRestart() and removeClient() so an in-flight reconnect/rematch
// always gets a fresh window — deleting the room the instant a rematch's
// disconnect+reconnect races would otherwise risk the two players landing
// in different room instances. The countdown only stops early once the
// match actually restarts (room.phase leaves 'gameOver' — checked per-tick
// below); GameRoom won't start a match until both slots are filled
// regardless of what this timer is doing.
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
    // Match actually restarted (both back, _initGame() ran and moved the
    // phase on) — room is alive again, nothing left to do. Checking phase
    // instead of socket liveness matters because this timer now also runs
    // for matches that ended with both players still connected (nobody
    // disconnected at all), where clients.red/blue are truthy from tick one.
    if (room.phase !== 'gameOver') {
      cancelEmptyRoomGrace(room);
      return;
    }

    secondsLeft -= 1;
    if (secondsLeft < 0) {
      // "0" was already broadcast and shown for its full 2s — give up now.
      cancelEmptyRoomGrace(room);
      if (rooms.get(roomId) === room) {
        // Lowercase 'gameover' is deliberately distinct from the camelCase
        // 'gameOver' win-condition message — this is "nobody came back",
        // not a real match result.
        room.broadcast({ type: 'gameover', reason: 'abandoned' });
        rooms.delete(roomId);
        // Tear the room down for real — without this, a socket that's still
        // attached to this now-unreachable room object (e.g. the OTHER
        // player, who hasn't navigated away yet) can have a later close
        // event call removeClient() on it, which would see phase ===
        // 'gameOver' and re-arm a fresh "Continue?" countdown on a room
        // that's already gone.
        room.destroy();
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
      // Called from _endGame() (the primary trigger — every match end),
      // handleRestart() (synchronously, before either client could possibly
      // have reconnected, so an in-flight rematch gets a fresh window), and
      // removeClient() (when one player leaves during the gameOver phase
      // with no rematch in progress).
      onRequestContinueGrace: () => startEmptyRoomGrace(roomId, room),
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
      room.destroy();
    }
  }
}, 60_000);
