// test/server.integration.test.js — real-WebSocket integration coverage for the
// P3 connection-level hardening in server/index.js. Spins the actual server on
// an ephemeral port (start(0)) and drives it with real `ws` clients, so the
// origin gate, room-ID gate, maxPayload close, rate-limit terminate, raw-restart
// rejection, heartbeat close path, and /health endpoint are exercised end-to-end
// rather than asserted against stubs.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import http from 'node:http';
import { start, rooms, sweepDeadSockets } from '../server/index.js';

let server, port;
const DEV_ORIGIN = 'http://localhost:5173';

beforeAll(async () => {
  server = start(0); // 0 → OS-assigned free port
  await new Promise((resolve) => {
    if (server.httpServer.listening) return resolve();
    server.httpServer.once('listening', resolve);
  });
  port = server.httpServer.address().port;
});

afterAll(async () => {
  await server.close();
});

afterEach(() => {
  // Rooms are a module-global Map; clear + tear down between tests so leftover
  // grace-window intervals don't dangle (they live in index.js, not GameRoom).
  for (const room of rooms.values()) {
    if (room._emptyRoomGraceTimer) clearInterval(room._emptyRoomGraceTimer);
    room.destroy?.();
  }
  rooms.clear();
});

// ── helpers ────────────────────────────────────────────────────────────────
function connect({ room = 'testrm', origin = DEV_ORIGIN, prefer } = {}) {
  let url = `ws://127.0.0.1:${port}/?room=${encodeURIComponent(room)}`;
  if (prefer) url += `&prefer=${prefer}`;
  const ws = new WebSocket(url, origin ? { headers: { origin } } : {});
  const messages = [];
  ws.on('message', (data) => { try { messages.push(JSON.parse(data)); } catch { /* ignore */ } });
  return { ws, messages };
}

const waitOpen  = (ws) => new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
const waitClose = (ws) => new Promise((res) => ws.once('close', (code, reason) => res({ code, reason: reason.toString() })));
const delay     = (ms) => new Promise((res) => setTimeout(res, ms));

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

// ── origin gate ──────────────────────────────────────────────────────────────
describe('origin gate', () => {
  it('closes a foreign Origin with 1008 bad origin', async () => {
    const { ws } = connect({ room: 'origin1', origin: 'https://evil.example' });
    const { code, reason } = await waitClose(ws);
    expect(code).toBe(1008);
    expect(reason).toBe('bad origin');
  });

  it('accepts a localhost dev Origin', async () => {
    const { ws, messages } = connect({ room: 'origin2', origin: DEV_ORIGIN });
    await waitOpen(ws);
    await delay(50);
    // First client into a fresh room is told to wait for an opponent.
    expect(messages.some((m) => m.type === 'joined')).toBe(true);
    ws.close();
  });
});

// ── room-ID gate ─────────────────────────────────────────────────────────────
describe('room-ID gate', () => {
  it('closes an invalid room shape with 1008 bad room', async () => {
    const { ws } = connect({ room: 'bad!room' });
    const { code, reason } = await waitClose(ws);
    expect(code).toBe(1008);
    expect(reason).toBe('bad room');
  });
});

// ── payload cap ──────────────────────────────────────────────────────────────
describe('payload cap', () => {
  it('closes the socket when a message exceeds maxPayload (1024)', async () => {
    const { ws } = connect({ room: 'payload' });
    await waitOpen(ws);
    ws.send('x'.repeat(2048));
    const { code } = await waitClose(ws);
    expect(code).toBe(1009); // "message too big"
  });
});

// ── rate limit ───────────────────────────────────────────────────────────────
describe('rate limit', () => {
  it('terminates a socket that floods past the token bucket', async () => {
    const { ws } = connect({ room: 'flood' });
    await waitOpen(ws);
    for (let i = 0; i < 80; i++) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', dir: 'up' }));
    }
    await waitClose(ws);
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});

// ── raw restart rejection ────────────────────────────────────────────────────
describe('raw restart rejection', () => {
  it('ignores a raw {type:"restart"} — no restart is broadcast to either client', async () => {
    const a = connect({ room: 'restrt' });
    await waitOpen(a.ws);
    const b = connect({ room: 'restrt' });
    await waitOpen(b.ws);
    await delay(80); // let joined / gameStart settle

    b.ws.send(JSON.stringify({ type: 'restart' }));
    await delay(150);

    expect(a.messages.some((m) => m.type === 'restart')).toBe(false);
    expect(b.messages.some((m) => m.type === 'restart')).toBe(false);

    a.ws.close();
    b.ws.close();
  });
});

// ── heartbeat close path ─────────────────────────────────────────────────────
describe('heartbeat', () => {
  it('terminates a zombie (no-pong) socket and fires the client close path', async () => {
    const { ws } = connect({ room: 'zombie' });
    await waitOpen(ws);
    await delay(30); // ensure the server-side socket is registered in wss.clients

    // Simulate a socket that never answered the last ping.
    for (const client of server.wss.clients) client.isAlive = false;
    sweepDeadSockets(server.wss.clients); // the heartbeat interval's body

    await waitClose(ws);
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});

// ── health endpoint ──────────────────────────────────────────────────────────
describe('health endpoint', () => {
  it('answers GET /health with JSON room/connection counts', async () => {
    const { status, body } = await httpGet('/health');
    expect(status).toBe(200);
    const json = JSON.parse(body);
    expect(json.status).toBe('ok');
    expect(typeof json.rooms).toBe('number');
    expect(typeof json.connections).toBe('number');
  });

  it('404s any other path', async () => {
    const { status } = await httpGet('/nope');
    expect(status).toBe(404);
  });
});
