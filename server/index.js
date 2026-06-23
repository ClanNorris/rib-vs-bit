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
// room instances. Instead, give the room a 10s grace window before deleting
// it, broadcasting a countdown so anyone already back can see the room
// hasn't been abandoned.
const EMPTY_ROOM_GRACE_MS = 10_000;

function cancelEmptyRoomGrace(room) {
  if (room._emptyRoomGraceTimer) {
    clearInterval(room._emptyRoomGraceTimer);
    room._emptyRoomGraceTimer = null;
  }
}

function startEmptyRoomGrace(roomId, room) {
  cancelEmptyRoomGrace(room);
  let secondsLeft = EMPTY_ROOM_GRACE_MS / 1000;

  room._emptyRoomGraceTimer = setInterval(() => {
    // Both clients reconnected — room is alive again, nothing left to do.
    if (room.clients.red && room.clients.blue) {
      cancelEmptyRoomGrace(room);
      return;
    }

    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      cancelEmptyRoomGrace(room);
      if (!room.clients.red && !room.clients.blue && rooms.get(roomId) === room) {
        rooms.delete(roomId);
        console.log(`[server] Room removed: ${roomId}`);
      }
      return;
    }

    room.broadcast({ type: 'reconnectCountdown', secondsLeft });
  }, 1000);
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
  let room = rooms.get(roomId);
  if (!room) {
    room = new GameRoom(roomId);
    rooms.set(roomId, room);
    console.log(`[server] Room created: ${roomId}`);
  } else {
    // A client is (re)connecting to this room — it's no longer at risk of
    // being removed for being empty.
    cancelEmptyRoomGrace(room);
  }

  // ── Assign player slot (first = red, second = blue) ───────────────────────
  let playerId;
  if (!room.clients.red) {
    playerId = 'red';
  } else if (!room.clients.blue) {
    playerId = 'blue';
  } else {
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
