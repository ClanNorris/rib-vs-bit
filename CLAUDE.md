# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Rib vs Bit** — a 1v1 browser Frogger game built with [Phaser 4](https://phaser.io/) and Vite. Two frog characters (Rib = red side, Bit = blue side) race across a shared board of river and road lanes to capture lily pads and score points. First to 3 wins.

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
- **`lanes.js`** — lane definitions (river: log/logCircle/turtle; road: car/truck) with spawn templates and speed variance logic. `createMatchLanePlan()` is called once per match.
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
| `abilities` | `systems/abilities.js` | Tongue attack — can stun the opponent across up to 3 tiles. |
| `scoring` | `systems/scoring.js` | Detects lily pad captures, fires `onScore`/`onRegularPoint`/`onWin`. |
| `roundFlow` | `systems/roundFlow.js` | Orchestrates the pause-zoom-banner sequence after a point. |
| `playerState` / `playerDeath` / `playerLifecycle` | `systems/player*.js` | State machine (ALIVE → DYING → RESPAWNING → INVULNERABLE → ALIVE) + respawn logic. |
| `audio` | `systems/audio.js` | Web Audio API tones synthesized in code (no audio files). Uses a page-level `AudioContext` singleton that survives `scene.restart()`. |
| `announcer` | `systems/announcer.js` | Score banners and center-screen callouts. |
| `hud` | `systems/hud.js` | Score display, messages in the HUD row. |
| `touchControls` | `systems/touchControls.js` | On-screen D-pad injected per-player on mobile after each `GO!`. |
| `debugOverlay` | `systems/debugOverlay.js` | Toggle with F3 — shows lane plan, player state, phase info. |

### Entities

- `src/entities/frogFactory.js` — `createPlayer()` builds a Phaser Container with circles/rectangles (no sprite sheets). Returns a plain object with `{ sprite, body, shadow, col, row, state, controls, ... }`.
- `src/entities/platformFactory.js` — `createLilyPad()`, `createTurtleDecoration()`.
- `src/builders/worldBuilder.js` — `buildWorld()` draws the board background and populates `platforms`, `vehicles`, `platformDecorations`, `bluePads`, `redPads` arrays. Called once per round start.

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
