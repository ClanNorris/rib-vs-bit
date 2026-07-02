# Rib vs Bit — Project Status Doc

**Last active:** July 2, 2026

---

## Session Update — July 2, 2026

**Deployed:**
- **Tongue visual fix chain (`86bahhmzc`)** — three layered root causes, all in client code:
  1. Shared `tongueGraphics` clear-race → split into `tongueGfxRed`/`tongueGfxBlue` at depth 10 (`actionEffects.js`)
  2. Touch fire path sent network input with no local visual (echo guard at MainScene:297 intentionally blocks local backfill) → extracted `_fireTongueLocal()` in `MainScene.js`, wired to keyboard + touch paths
  3. `drawTongue` grid-center endpoint diverged from `playTongueAnimation`'s sprite-relative 144px rect on platform-drifted sprites → endpoint unified: tiles derived from attacker grid pos → targetTile, endpoint sprite-anchored
- **Countdown input gating (`86bahhmyu`)** — server-side `_inputsOpen` flag in `server/GameRoom.js`: closed at countdown start (with queue drain), opened immediately before `phase = 'live'` at GO, `queueInput()` discards while closed. Mash test proved the leak was **touch-path-only** (keyboard client gate holds). Resets correctly on rematch.

**New backlog (with diagnostic context in each task):**
- `86baq929r` — Polish: tongue visuals don't track sprite during platform drift (fire-time snapshot; pre-existing)
- `86baq92cz` — Enhancement: network-mode tongue doesn't truncate at hit (client draws full range at input time, before server hit confirm)
- `86baqav3v` — Client: touch path sends inputs during countdown (server discards; also CLAUDE.md's "D-pad injected after GO" claim contradicted by evidence — doc drift)

**Notable facts learned:**
- Local mode appears unreachable — bare `localhost:5173` auto-creates a room. `tryTongue`'s draw paths in `abilities.js` are vestigial (both call sites guarded to local mode). Flag if `abilities.js` is touched.
- Player ids are literally `'red'`/`'blue'` (MainScene ~466/476); `onTongueFired` resolves the same player objects via `this.players[attackerId]`.
- Two-Chrome-windows setup (normal + device-emulation) covers both perspectives with full console access; phone only needed for final passes.

**Next target:** iOS audio silent until first input (`86bahhn0z`). Housekeeping: temp discard log strip from `queueInput()` was in flight at session end — verify it's gone.

---

## What It Is

A 1v1 web-based Frogger-style PvP game. Two frogs (Rib and Bit) compete to capture the opponent's three lily pads. Built with Phaser 3 + Vite on the frontend and a Node.js WebSocket server on the backend.

---

## Stack

| Layer | Tech | Host |
|---|---|---|
| Frontend | Phaser 3 + Vite | Netlify |
| Backend | Node.js + `ws` (raw WebSockets) | Railway |
| Repo | github.com/ClanNorris/rib-vs-bit | GitHub |

---

## Architecture

**Server-authoritative multiplayer.** Clients send inputs; server owns all game state and broadcasts at ~20 ticks/sec. Room joining via `?room=abc123` query param.

### Server Files
- `server/index.js` — WebSocket server + room management
- `server/GameRoom.js` — tick loop, hazard movement, collision, scoring
- `server/constants.js` — shared values

### Client Files
- `src/scenes/MainScene.js`
- `src/systems/network.js` — WebSocket client wrapper
- `src/systems/laneSystem.js`
- `src/systems/movement.js`
- `src/systems/collision.js`
- `src/systems/scoring.js`
- `src/config/constants.js`
- `src/config/gameTuning.js`

### Client-Only (no server involvement)
All audio, visual effects, HUD, and touch controls rendering code.

---

## What Was Working as of Last Session

- Online multiplayer framework built and deployed (server + client WebSocket integration)
- Server-authoritative game loop running
- Tongue attack implemented and sync bug fixed — server now broadcasts `pullCol`, `pullRow`, and `attackerFacing` at the moment of hit confirmation in `server/index.js`, with corresponding `applyTongueHit` fix in `MainScene.js`
- Web Audio API sound system functional including mobile unlock fix — uses Phaser's own `scene.sys.game.sound.context` rather than a separate AudioContext
- 8-bit sound effects: round start "RIB! BIT! GO!" sequence, splash, and others

---

## Known Issues / Regression Risks

These were resolved but worth testing when picking back up:

- **Hazard position drift** — was caused by double-updating (both client `laneSystem.update()` and server running simultaneously); server should be the only authority
- **Lily pad capture** — was not applying correctly to client sprites; confirm captures visually reflect server state
- **Round intro timing** — was not triggering correctly; verify the "RIB! BIT! GO!" sequence fires at the right moment
- **Audio on window focus** — audio was firing on focus event rather than round start; confirm this is resolved

---

## Deferred / Not Yet Done

- **Touch controls** — single-device mode had both players on one screen with two D-pads. This was intentionally left to resolve itself through the online architecture (each player on their own device gets one D-pad naturally). Verify this works correctly in deployed online play.
- **Audio dynamics compressor** — discussed but may not have been implemented. The `playTone` function had a `Math.min(volume * masterVolume, 0.18)` hard cap that was flattening dynamic range on the "RIB! BIT! GO!" sequence. The fix was to add a `DynamicsCompressorNode` and remove the cap (or raise it to `0.3` as a simpler alternative). Confirm whether this made it into a commit.

---

## Dev Commands

```bash
npm run dev        # Start local dev (Vite on :5173, server on :3001)
npm run build      # Production build
```

**Port conflict cleanup (Windows PowerShell):**
```powershell
for /f "tokens=5" %a in ('netstat -ano ^| findstr :[PORT]') do taskkill /PID %a /F
```

---

## First Steps When Picking Back Up

1. Pull latest from GitHub and confirm clean working state
2. Check commit history for tongue attack fix and audio compressor work
3. Run locally and do a full regression pass on the items above
4. Review CLAUDE.md for any conventions that need updating
