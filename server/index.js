// server/index.js — WebSocket server + room management

'use strict';

const http                = require('http');
const { WebSocketServer } = require('ws');
const { URL }             = require('url');
const { GameRoom }        = require('./GameRoom');

const PORT = Number(process.env.PORT) || 3001;

// ── Resource / abuse limits ────────────────────────────────────────────────
const MAX_ROOMS    = 500;               // reject new-room creation beyond this
const MAX_PAYLOAD  = 1024;              // bytes — no legit message is close (ws auto-closes 1009)
const RATE_PER_SEC = 30;                // per-socket token-bucket refill rate
const RATE_BURST   = 30;                // per-socket token-bucket capacity
const ROOM_ID_RE   = /^[a-z0-9]{1,12}$/i; // client mints 6-char lowercase alnum (generateRoomId)
const MAX_QUEUE    = 8;                 // (mirrors GameRoom.queueInput's own cap; kept here for docs)
const HEARTBEAT_MS = 30_000;

// ── Origin allowlist ───────────────────────────────────────────────────────
// Browsers don't enforce same-origin on WebSockets, so the server is the only
// place an allowlist can live. Production origins come from the ALLOWED_ORIGINS
// env var (comma-separated) — NOT hardcoded, so the Netlify domain isn't baked
// into source. localhost/127.0.0.1 is ALWAYS allowed (any scheme/port) so dev
// needs no config and the Vite dev proxy (rewriteWsOrigin:true, which rewrites
// the handshake Origin to the proxy target localhost:3001) passes regardless of
// the scheme http-proxy emits. This stops casual browsers, NOT forged headers —
// the per-socket rate limit below is the real backstop for scripted abuse.
//
// ⚠️ DEPLOY: set ALLOWED_ORIGINS=https://<netlify-domain> in Railway before the
// next deploy, or production browser clients will be rejected with 'bad origin'.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return false;                 // no Origin header → non-browser client, reject
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function isValidRoomId(roomId) {
  return typeof roomId === 'string' && ROOM_ID_RE.test(roomId);
}

// roomId (string) → GameRoom
const rooms = new Map();

// A reconnecting client can race its own old socket's close: the old socket
// may still be registered in room.clients even though it's already
// CLOSING/CLOSED, indistinguishable from "genuinely occupied" if only
// checked for truthiness. Treat a non-OPEN occupant as stale/evictable.
function isStaleSocket(existingWs) {
  return Boolean(existingWs) && existingWs.readyState !== 1 /* OPEN */;
}

// ── Heartbeat sweep ────────────────────────────────────────────────────────
// Runs every HEARTBEAT_MS over all sockets. A socket that didn't answer the
// previous ping (isAlive still false) is a half-open zombie — a phone that
// lost signal, a closed laptop lid, a NAT timeout — whose readyState is still
// OPEN so every other liveness check equates it with alive. terminate() fires
// the existing 'close' handler, so the 30s forfeit window, slot clearing, and
// orphan sweep all begin working for half-open sockets for free.
function sweepDeadSockets(clients) {
  for (const ws of clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}

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
        console.log(`[server] Room removed (abandoned): ${roomId} (rooms=${rooms.size})`);
      }
      return;
    }

    room.broadcast({ type: 'reconnectCountdown', secondsLeft });
  }, RECONNECT_TICK_MS);
}

// ── Connection handler ─────────────────────────────────────────────────────
function handleConnection(ws, req) {
  // 1. Origin allowlist — reject before touching any room state.
  if (!isAllowedOrigin(req.headers.origin)) {
    ws.close(1008, 'bad origin');
    return;
  }

  // 2. Parse room + preferred color from the query-string.
  //    `prefer` is set by the client's auto-reconnect (network.js) so a
  //    returning player keeps their original color when that slot is free;
  //    it's only honored for an available slot, a fresh join omits it.
  let roomId, prefer;
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    roomId = url.searchParams.get('room');
    prefer = url.searchParams.get('prefer');
  } catch {
    roomId = null;
    prefer = null;
  }

  // 3. Room-ID shape validation — rejects arbitrarily long / arbitrary-charset
  //    room strings that would each mint a full GameRoom. The client's
  //    generateRoomId (6-char lowercase alnum) passes; nothing legit is lost.
  if (!isValidRoomId(roomId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room code' }));
    ws.close(1008, 'bad room');
    return;
  }

  // 4. Heartbeat + rate-limit state. A pong (client auto-responds to our ping)
  //    re-marks the socket alive; the token bucket throttles inbound messages.
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws._tokens = RATE_BURST;
  ws._lastRefill = Date.now();

  // 5. Get or create room — enforce the total-room cap only when minting a new
  //    one (existing rooms are always joinable up to their 2 slots).
  //    Note: a lone reconnect does NOT cancel a pending empty-room grace timer
  //    here — the countdown keeps broadcasting until BOTH clients are back
  //    (checked inside the timer itself) or it expires, per the visible
  //    "Continue?" countdown UX.
  let room = rooms.get(roomId);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) {
      console.log(`[server] Room cap (${MAX_ROOMS}) reached, rejecting ${roomId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Server at capacity, try again later' }));
      ws.close(1013, 'server at capacity');
      return;
    }
    room = new GameRoom(roomId, {
      // Called from _endGame() (the primary trigger — every match end),
      // handleRestart() (synchronously, before either client could possibly
      // have reconnected, so an in-flight rematch gets a fresh window), and
      // removeClient() (when one player leaves during the gameOver phase
      // with no rematch in progress).
      onRequestContinueGrace: () => startEmptyRoomGrace(roomId, room),
    });
    rooms.set(roomId, room);
    console.log(`[server] Room created: ${roomId} (rooms=${rooms.size})`);
  }

  // 6. Assign player slot (first = red, second = blue).
  //    A stale occupant (its close hasn't been processed yet) is evicted via
  //    the normal removeClient() path before handing its slot to the new
  //    connection, so removeClient's own bookkeeping (nulling the slot,
  //    broadcasting opponentLeft, entering the empty-room grace window if both
  //    end up empty) stays consistent.
  const slotFree = (id) => !room.clients[id] || isStaleSocket(room.clients[id]);
  const claim = (id) => {
    if (room.clients[id]) room.removeClient(room.clients[id]);
    return id;
  };

  let playerId;
  if ((prefer === 'red' || prefer === 'blue') && slotFree(prefer)) {
    // Honor the reconnecting player's requested color when it's available.
    playerId = claim(prefer);
  } else if (slotFree('red')) {
    playerId = claim('red');
  } else if (slotFree('blue')) {
    playerId = claim('blue');
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
    // Per-socket token bucket: refill by elapsed time, spend 1 per message.
    // A socket that drains it (30 msg/sec sustained) is misbehaving far beyond
    // any human input rate — terminate it. Runs BEFORE JSON.parse so a flood of
    // junk can't burn CPU parsing.
    const now = Date.now();
    ws._tokens = Math.min(RATE_BURST, ws._tokens + ((now - ws._lastRefill) / 1000) * RATE_PER_SEC);
    ws._lastRefill = now;
    if (ws._tokens < 1) {
      console.log(`[server] Rate limit exceeded (room=${roomId}, player=${playerId}), terminating`);
      ws.terminate();
      return;
    }
    ws._tokens -= 1;

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // NOTE: the raw {type:'restart'} branch was deliberately removed — a rematch
    // is a mutual ready-check (handleReady requires both flags). Accepting a raw
    // restart let one client yank the opponent into scene.restart() unilaterally.
    if (msg.type === 'input') {
      room.queueInput(playerId, msg);
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
}

// ── Server lifecycle ───────────────────────────────────────────────────────
// Wrapped in start() so tests can spin the real server on an ephemeral port,
// exercise it over real WebSockets, and shut it down cleanly. Auto-starts only
// when run directly (require.main === module), so `require`-ing this from a
// test does not bind a port.
function start(port = PORT) {
  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        rooms: rooms.size,
        connections: wss.clients.size,
        uptime: Math.round(process.uptime()),
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD });
  wss.on('connection', handleConnection);

  const heartbeat = setInterval(() => sweepDeadSockets(wss.clients), HEARTBEAT_MS);

  // Periodic cleanup of orphaned rooms (belt-and-suspenders).
  const orphanSweep = setInterval(() => {
    for (const [id, room] of rooms) {
      if (!room.clients.red && !room.clients.blue) {
        rooms.delete(id);
        room.destroy();
      }
    }
  }, 60_000);

  wss.on('close', () => { clearInterval(heartbeat); clearInterval(orphanSweep); });

  httpServer.listen(port, () => {
    const bound = httpServer.address();
    const p = bound && typeof bound === 'object' ? bound.port : port;
    console.log(`[server] WebSocket + HTTP listening on port ${p}`);
  });

  function close() {
    clearInterval(heartbeat);
    clearInterval(orphanSweep);
    return new Promise((resolve) => {
      wss.close(() => httpServer.close(() => resolve()));
    });
  }

  return { httpServer, wss, close };
}

if (require.main === module) {
  // ── Crash observability ──────────────────────────────────────────────────
  // Log the fault before the process dies, so a Railway crash leaves a trace
  // in stdout instead of vanishing. exit(1) lets Railway restart cleanly.
  // Armed only when run as the entry point, so importing this module (tests)
  // never hijacks the host process's exit behavior.
  process.on('uncaughtException', (e) => { console.error('[fatal] uncaughtException', e); process.exit(1); });
  process.on('unhandledRejection', (e) => { console.error('[fatal] unhandledRejection', e); process.exit(1); });
  start();
}

module.exports = { start, rooms, isAllowedOrigin, isValidRoomId, sweepDeadSockets };
