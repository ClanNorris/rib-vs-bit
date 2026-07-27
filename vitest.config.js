// vitest.config.js — server-core unit tests (P1 seed suite).
//
// Deliberately separate from vite.config.js so the game build config stays
// untouched. These tests are pure-logic + stub-socket unit tests over the
// authoritative server (server/GameRoom.js) plus a client/server constant
// parity guard. No Phaser, no jsdom, no canvas — the review scoped scene
// testing out as poor ROI.
//
// The tests are ESM (import) and pull in BOTH server CommonJS
// (server/*.js — require/module.exports) and client ESM (src/config/*.js —
// export). Vite's interop bridges the two; environment 'node' matches the
// server's runtime.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
