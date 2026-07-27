// test/server.hardening.test.js — pure-unit coverage of the P3 hardening
// helpers exported from server/index.js, plus the GameRoom input-queue cap.
// No port is bound here; the wired end-to-end behavior is in
// server.integration.test.js.
import { describe, it, expect, vi } from 'vitest';
import { isAllowedOrigin, isValidRoomId, sweepDeadSockets } from '../server/index.js';
import { GameRoom } from '../server/GameRoom.js';
import { makeSocket } from './helpers.js';

describe('origin allowlist (isAllowedOrigin)', () => {
  it('allows localhost / 127.0.0.1 on any scheme or port (dev + rewritten proxy origin)', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);  // browser → Vite dev
    expect(isAllowedOrigin('http://localhost:3001')).toBe(true);  // proxy-rewritten (http)
    expect(isAllowedOrigin('ws://localhost:3001')).toBe(true);    // proxy-rewritten (ws)
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
  });

  it('rejects a missing Origin header (non-browser client)', () => {
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });

  it('rejects a foreign origin when ALLOWED_ORIGINS is unset (test env)', () => {
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('http://attacker.localhost.evil.com')).toBe(false); // host is not literally localhost
    expect(isAllowedOrigin('not-a-url')).toBe(false);
  });
});

describe('room-ID shape (isValidRoomId)', () => {
  it('accepts 1–12 char alphanumerics (client mints 6-char lowercase alnum)', () => {
    expect(isValidRoomId('abc123')).toBe(true);
    expect(isValidRoomId('A')).toBe(true);
    expect(isValidRoomId('abcdefghijkl')).toBe(true);  // 12 chars
    expect(isValidRoomId('ABC123def')).toBe(true);     // case-insensitive
  });

  it('rejects empty, over-length, symbol, and non-string room IDs', () => {
    expect(isValidRoomId('')).toBe(false);
    expect(isValidRoomId('abcdefghijklm')).toBe(false); // 13 chars
    expect(isValidRoomId('bad!room')).toBe(false);
    expect(isValidRoomId('../../etc')).toBe(false);
    expect(isValidRoomId('a b')).toBe(false);
    expect(isValidRoomId(null)).toBe(false);
    expect(isValidRoomId(123)).toBe(false);
  });
});

describe('heartbeat sweep (sweepDeadSockets)', () => {
  it('terminates a socket that missed the previous ping; re-pings a live one', () => {
    const dead = { isAlive: false, terminate: vi.fn(), ping: vi.fn() };
    const live = { isAlive: true,  terminate: vi.fn(), ping: vi.fn() };

    sweepDeadSockets([dead, live]);

    // Zombie (no pong since last sweep) → terminated, never re-pinged.
    expect(dead.terminate).toHaveBeenCalledOnce();
    expect(dead.ping).not.toHaveBeenCalled();

    // Live socket → marked pending-until-next-pong and re-pinged, not killed.
    expect(live.terminate).not.toHaveBeenCalled();
    expect(live.ping).toHaveBeenCalledOnce();
    expect(live.isAlive).toBe(false);
  });
});

describe('input queue cap (GameRoom.queueInput)', () => {
  it('drops the 9th queued input between ticks (cap holds at 8)', () => {
    const room = new GameRoom('cap', { onRequestContinueGrace: () => {} });
    room.addClient(makeSocket(), 'red');
    room.addClient(makeSocket(), 'blue'); // _initGame builds the input queues + starts the tick
    room._stopTick();                     // freeze time so nothing drains the queue

    room._inputsOpen = true;
    room._inputQueues.red.length = 0;     // start from a known-empty queue

    for (let i = 0; i < 12; i++) {
      room.queueInput('red', { type: 'input', dir: 'up', n: i });
    }

    // Only the first 8 are retained; the 9th onward are dropped.
    expect(room._inputQueues.red.length).toBe(8);
    expect(room._inputQueues.red.map((m) => m.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    room.destroy?.();
  });
});
