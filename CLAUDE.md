# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Rib vs Bit** — a 1v1 browser Frogger game built with [Phaser 3.60.0](https://phaser.io/) and Vite. Two frog characters (Rib = red side, Bit = blue side) race across a shared board of river and road lanes to capture lily pads and score points. First to 3 wins.

## Commands

```bash
npm run dev       # start Vite dev server (hot reload)
npm run build     # production build → dist/
npm run preview   # serve the production build locally
```

No test runner is configured (`npm test` exits with error).

## Architecture

### Entry point and single scene

`src/main.js` bootstraps Phaser with one scene: `MainScene`. Canvas is 720×624 (desktop) or 720×935 (mobile). Everything lives in `MainScene` — there is no scene switching, only `scene.restart()` for rematches.

### Board layout (`src/config/constants.js`)

A 15×13 tile grid (48px tiles). Rows are named constants in `ROW`:

| Row | Name |
|-----|------|
| 0 | TOP_PADS (Bit's scoring pads) |
| 1 | TOP_START (Bit spawn) |
| 2–4 | River lanes |
| 5 | Safe zone |
| 6–9 | Road lanes |
| 10 | BOTTOM_START (Rib spawn) |
| 11 | BOTTOM_PADS (Rib's scoring pads) |
| 12 | HUD row |

### Config files (`src/config/`)

- **`constants.js`** — tile size, grid dimensions, ROW map
- **`gameTuning.js`** — all gameplay numbers (speeds, cooldowns, scoring thresholds, FX params). Edit this to tune balance.
- **`lanes.js`** — lane definitions (river: log/shortLog/turtle; road: car/sportsCar/truck/cyberTruck) with spawn templates and speed variance logic. `createMatchLanePlan()` is called once per match.
- **`theme.js`** — all colors/hex values for board, objects, and text.

### Systems pattern

Every system is a factory function `createXxxSystem(scene, options)` returning a plain object with methods (no classes). All systems are created in `MainScene.create()` and destroyed in `handleSceneShutdown()`. Systems call each other through callbacks passed at construction time — they don't import each other directly.

Key systems:

| System | File | Role |
|--------|------|------|
| `roundGate` | `systems/roundGate.js` | Phase state machine: `menu → countdown → live → scorePause → gameOver`. Controls which subsystems are active each frame. |
| `laneSystem` | `systems/laneSystem.js` | Moves platforms and vehicles each frame; handles wrap-around and turtle bob animation. |
| `platformSupport` | `systems/platformSupport.js` | Determines if a player is standing on a platform (river only). |
| `collision` | `systems/collision.js` | Checks traffic hits (road) and water falls (river). Calls `playerDeath` on hit. |
| `movement` | `systems/movement.js` | Tile-based player moves + platform carry drift. |
| `abilities` | `systems/abilities.js` | Tongue attack — pulls a hit opponent 1 tile toward the attacker (range up to 3 tiles). `applyTongueHit` handles the networked hit reaction (pop/tint + 150ms pull tween). |
| `actionEffects` | `systems/actionEffects.js` | Tongue *visuals*. Owns the depth-10 tongue line (`drawTongue`) and the depth-20 mouth-flick (`playTongueAnimation`). Exposes `update()` (called every frame from `MainScene.update()`) which drift-tracks both visuals to the live frog position. See "Tongue attack visuals" below. |
| `scoring` | `systems/scoring.js` | Detects lily pad captures, fires `onScore`/`onRegularPoint`/`onWin`. |
| `roundFlow` | `systems/roundFlow.js` | Orchestrates the pause-zoom-banner sequence after a point. |
| `playerState` / `playerDeath` / `playerLifecycle` | `systems/player*.js` | State machine (ALIVE → DYING → RESPAWNING → INVULNERABLE → ALIVE) + respawn logic. |
| `audio` | `systems/audio.js` | Web Audio API tones synthesized in code (no audio files). Uses Phaser's own `scene.sys.game.sound.context` (via `getCtx()`), which survives `scene.restart()`. Never create a separate `AudioContext` — see the mobile-unlock note below. |
| `announcer` | `systems/announcer.js` | Score banners and center-screen callouts. |
| `hud` | `systems/hud.js` | Score display, messages in the HUD row. |
| `touchControls` | `systems/touchControls.js` | On-screen D-pad on mobile. Injected at the first `GO!`; not present during the first countdown. **Note:** it is NOT torn down on round reset — it persists visibly (but inert, inputs gated) through the inter-round countdown until the next `GO!` re-enables input. This lingering-inert-D-pad behavior is a known minor cosmetic issue, consciously not fixed (see canceled task `86baqav3v`). |
| `debugOverlay` | `systems/debugOverlay.js` | Toggle with F3 — shows lane plan, player state, phase info. |

### Entities

- `src/entities/frogFactory.js` — `createPlayer()` builds a Phaser Container with circles/rectangles (no sprite sheets). Returns a plain object with `{ sprite, body, shadow, col, row, state, controls, ... }`.
- `src/entities/platformFactory.js` — `createLilyPad()`, `createTurtleDecoration()`.
- `src/builders/worldBuilder.js` — `buildWorld()` draws the board background and populates `platforms`, `vehicles`, `platformDecorations`, `bluePads`, `redPads` arrays. Called once per round start.

### Tongue attack visuals

The tongue attack has **three distinct visuals** — keep them separate when debugging (conflating them caused significant confusion):

1. **Tongue line** — `drawTongue` in `actionEffects.js`, `tongueGfxRed`/`tongueGfxBlue` graphics at **depth 10**. The primary reach/length indicator (line + tip/pulse circles at the endpoint).
2. **Mouth-flick** — `playTongueAnimation` in `actionEffects.js`, `mouthGfx` (teeth) + accent `tongueRect` at **depth ~19-20**. A short 250ms shoot-out/retract. `TONGUE_LENGTH` is a **20px accent** — deliberately short so the depth-10 line carries all reach/length information. (It was previously a full 144px/3-tile rect that rendered over the line and masked truncation.)
3. **Hit reaction** — `applyTongueHit` in `abilities.js`: defender pop/tint + 150ms pull tween. Not a tongue visual per se.

**Drift-tracking:** both the line and the mouth follow the frog during platform drift, via `actionEffects.update()` (called each frame from `MainScene.update()`):
- The line uses per-color `activeTongues` state; `renderTongueLine` re-samples `attacker.sprite.x/y` each frame and redraws.
- The mouth uses a **separate** `activeMouths` state slot (separate because the mouth lives 250ms vs. the line's 120ms — they cannot share a slot); `syncMouth` writes live `player.sprite.x/y` to both mouth objects each frame.
- Retrack is **position-only** — orientation is set once at fire time and not re-synced. A fire-then-turn keeps the original orientation for ~250ms (acceptable; orientation-retrack is a deferred follow-up).

**Truncate-at-hit (network):** the tongue draws to the *actual* target, not full range. `_fireTongueLocal` computes the hit tile at fire time from the client's known defender position (avoids a full-length overshoot on frame 1). The server's `onTongueHit` then truncates authoritatively via `truncateTongue`, locking length as `|hit − pull| + 1` (drift-proof — derived from server values, not the live attacker col). This requires `hitCol`/`hitRow` in the `tongueHit` broadcast (see Multiplayer).

### Player controls

- **Rib (red, bottom):** WASD + F (tongue)
- **Bit (blue, top):** Arrow keys + Enter (tongue); Right Ctrl also fires tongue (consumed via `consumeBlueRightCtrl()`)

### Round gate phases

The `update()` loop in `MainScene` gates all subsystems through `roundGate`:
- `isWorldRunning()` — lanes move
- `isInputEnabled()` — keyboard/touch accepted
- `isCarryEnabled()` — platform drift applied to players
- `areHazardsEnabled(now)` — collision checked (delayed by `goHazardGraceMs` after GO)
- `isScoringEnabled()` — lily pad capture checked

### Lane randomization

Each match, `createMatchLanePlan()` picks one of three spawn templates per lane (A/B/C) and applies a speed multiplier within configured variance bounds. The debug summary string (visible with F3) encodes the full plan as `R2:A@1.02(49) R3:B@0.98(93) ... | D6:A@1.01(121) ...`.

## Multiplayer

Online play uses a server-authoritative WebSocket architecture.

- **Backend:** `server/index.js` (room management), `server/GameRoom.js` (20 tick/sec game loop — hazard movement, collision, scoring), `server/constants.js` (shared values)
- **Client:** `src/systems/network.js` — WebSocket wrapper; clients send inputs, receive and apply authoritative state
- **Room joining:** `?room=abc123` query param
- **Deployment:** Backend on Railway, frontend on Netlify
- **Do not run laneSystem or collision client-side during online play** — server is the only authority for hazard positions and game state

### Server tick model

- **20 ticks/sec = 50ms per tick** (`server/constants.js`). Player sprite positions are **snapped on each tick, never interpolated** — for both local and opponent players (`_applyServerTick` does direct assignment `player.sprite.x = data.x`). There is no client-side smoothing; `applyPlatformCarry` is gated off in network mode. (This is why per-frame tongue retracking looks fine — it matches the body's own 50ms motion granularity.)
- **Player IDs are literally `'red'` / `'blue'`.**
- **Opponent-triggered effects (audio + visual) need direct local calls, not gating behind `localPlayerId`.** The server-echo guard (`attacker.id !== localPlayerId`) blocks backfill, so opponent handlers and touch paths must invoke local audio/visual directly.

### tongueHit broadcast

On a confirmed tongue hit, `server/GameRoom.js` `_tryTongue` broadcasts `tongueHit` with:
- `pullCol` / `pullRow` — the pull destination (always exactly 1 tile from the attacker). Drives the defender pull in `applyTongueHit`.
- `hitCol` / `hitRow` — the **actual snag tile** where the tongue connected (1–3 tiles out). Captured from the defender's position *before* the pull overwrites it. Used to truncate the tongue *visual* to the real hit distance. `network.js` forwards these to `onTongueHit`.
- `attackerFacing` — applied to the attacker on the receiving client.

> Note: the `hitCol`/`hitRow` addition required a **conscious server-rule waiver** (server files aren't normally touched for client-visual work) because the actual hit distance only exists server-side. Additive, low-risk.

### Known audio quirk
Web Audio API mobile unlock uses Phaser's own `scene.sys.game.sound.context` — do not create a separate `AudioContext` singleton or mobile unlock will break. iOS Safari does not resume the AudioContext without a user gesture (proven on-device).