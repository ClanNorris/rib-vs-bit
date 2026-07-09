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

`src/main.js` bootstraps Phaser with one scene: `MainScene`. Canvas is 720×720 (desktop) or 720×1031 (mobile) — `GAME_WIDTH`/`GAME_HEIGHT` are derived (`COLS`/`ROWS * TILE_SIZE`) in `src/config/constants.js`, but the canvas dimensions in `main.js` are separate literals and do **not** auto-update if `ROWS`/`COLS` change again; confirm they still match after any future grid resize. Everything lives in `MainScene` — there is no scene switching, only `scene.restart()` for rematches.

### Board layout (`src/config/constants.js`)

A 15×15 tile grid (48px tiles). Rows are named constants in `ROW`:

| Row | Name |
|-----|------|
| 0 | TOP_PADS (Bit's scoring pads) |
| 1 | TOP_START (Bit spawn) |
| 2–5 | River lanes (4 lanes: log, log, shortLog, turtle — see `lanes.js` for the current per-row assignment) |
| 6–7 | Safe zone (`SAFE_1`, `SAFE_2`) |
| 8–11 | Road lanes (car/sportsCar/truck/cyberTruck — see "Vehicle skin alternation" under Multiplayer below) |
| 12 | BOTTOM_START (Rib spawn) |
| 13 | BOTTOM_PADS (Rib's scoring pads) |
| 14 | HUD row |

`ROW.SAFE` (aliased to 6) is dead code left over from before the safe zone was widened to two rows — zero consumers, safe to delete whenever, not urgent.

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
| `laneSystem` | `systems/laneSystem.js` | Moves platforms and vehicles each frame; handles wrap-around and turtle bob animation. Also drives the generic host/offsetX sync for every hazard decoration (logs, cars, trucks, etc.) — turtle was the original template, all other hazard types now follow the same sync mechanism. |
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
- `src/entities/platformFactory.js` — `createLilyPad()`, `createTurtleDecoration()`, `createBushCluster()`, `createLogDecoration()`, `createCarDecoration()`, `createSportsCarDecoration()`, `createTruckDecoration()`, `createCyberTruckDecoration()`. All hazard decoration factories (log/shortLog/car/sportsCar/truck/cyberTruck) follow the turtle-decoration pattern: an invisible hitbox rectangle (physics/collision unchanged) plus a separate decorative Container synced by `laneSystem.js`. Lily pads are built via `scene.add.graphics()`-based notched shapes rather than `scene.add.ellipse()` — deliberately, to avoid the Polygon origin bug below.
- `src/builders/worldBuilder.js` — `buildWorld()` draws the board background and populates `platforms`, `vehicles`, `platformDecorations`, `bluePads`, `redPads` arrays. Called once per round start.

**Gotcha:** `Phaser.GameObjects.Polygon`'s default origin does not correctly center point sets defined symmetrically around `(0,0)` — `GetAABB` tracks the true `minX`/`minY`, but `updateDisplayOrigin()` only uses `width`/`height`, discarding where the box starts, so the rendered shape lands offset by `-0.5*width, -0.5*height`. This affects `sportsCar`/`cyberTruck` (both use `scene.add.polygon`). Plain `rectangle`/`circle` objects don't have this quirk. Any future polygon-based decoration must define points in `0..width, 0..height` space, not `-half..+half`.

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

Controls are **not color-locked** in actual network play — this is easy to assume incorrectly from the key-binding setup code, so verify against `handlePlayerInput()` in `MainScene.js` if in doubt. In the network branch (the only reachable mode in current deployment):

- **Move:** WASD *or* Arrow keys — either works, regardless of which color (`red`/`blue`) the server assigned you.
- **Fire tongue:** F *or* Enter *or* Right Ctrl — any of the three works, regardless of assigned color. The Right-Ctrl check is `consumeRightCtrl()` (not color-scoped despite the similarly-named function in older references).

`player.controls` (`wasdControls` assigned to `red`, `arrowControls` assigned to `blue`) IS color-locked, but that assignment is only actually read in the **local same-keyboard multiplayer** code branch, which is confirmed unreachable in the current two-terminal/deployed setup. Don't use that assignment as a description of live-game behavior.

### Round gate phases

The `update()` loop in `MainScene` gates all subsystems through `roundGate`:
- `isWorldRunning()` — lanes move
- `isInputEnabled()` — keyboard/touch accepted
- `isCarryEnabled()` — platform drift applied to players
- `areHazardsEnabled(now)` — collision checked (delayed by `goHazardGraceMs` after GO)
- `isScoringEnabled()` — lily pad capture checked

### Lane randomization

Each match, `createMatchLanePlan()` picks one of three spawn templates per lane (A/B/C) and applies a speed multiplier within configured variance bounds. The debug summary string (visible with F3) encodes the full plan using each lane's actual row number, e.g. `R2:A@1.02(49) R3:B@0.98(93) R4:C@1.00(87) R5:A@0.95(61) | D8:A@1.01(121) D9:B@1.03(118) D10:C@0.97(109) D11:A@1.00(115)` — river rows 2–5, road rows 8–11 post board-redesign.

## Multiplayer

Online play uses a server-authoritative WebSocket architecture.

- **Backend:** `server/index.js` (room management), `server/GameRoom.js` (20 tick/sec game loop — hazard movement, collision, scoring), `server/constants.js` (shared values)
- **Client:** `src/systems/network.js` — WebSocket wrapper; clients send inputs, receive and apply authoritative state
- **Room joining:** `?room=abc123` query param
- **Deployment:** Backend on Railway (root directory set to `server` in Railway's service settings — this is a monorepo, Railway won't auto-detect the right folder otherwise), frontend on Netlify (base directory repo root, build command `npm run build`, publish directory `dist`).
- **`_connectNetwork()` in `MainScene.js`** reads `import.meta.env.VITE_WS_URL` first, falling back to `${wsProtocol}//${window.location.host}/ws` (which only resolves correctly via the local Vite dev proxy). Production requires `VITE_WS_URL` set as a Netlify build-time env var pointing at the Railway `wss://` domain — **must not be marked "secret"** in Netlify, since Vite inlines it into the public JS bundle and Netlify's Secrets Controller fails the build if a flagged-secret value shows up in build output.
- **Do not run laneSystem or collision client-side during online play** — server is the only authority for hazard positions and game state

### Server tick model

- **20 ticks/sec = 50ms per tick** (`server/constants.js`). Player sprite positions are **snapped on each tick, never interpolated** — for both local and opponent players (`_applyServerTick` does direct assignment `player.sprite.x = data.x`). There is no client-side smoothing; `applyPlatformCarry` is gated off in network mode. (This is why per-frame tongue retracking looks fine — it matches the body's own 50ms motion granularity.)
- **Player IDs are literally `'red'` / `'blue'`.**
- **Opponent-triggered effects (audio + visual) need direct local calls, not gating behind `localPlayerId`.** The server-echo guard (`attacker.id !== localPlayerId`) blocks backfill, so opponent handlers and touch paths must invoke local audio/visual directly.

### Lane-plan broadcast (`vehicleSkins`)

The synced lane-plan broadcast (sent on `gameStart` / round rebuild) carries a `vehicleSkins` array alongside the existing `templateId`/`speedMultiplier` fields. Road lanes each have a primary vehicle type plus an occasional alt skin (25% chance per spawn, capped at 2 alt-skin vehicles per lane), resolved server-side in `GameRoom.js`'s `materializeLane()`/`rollVehicleSkins()` — deliberately not rolled independently per client, so both players always see the identical skin on the identical vehicle. Any future "pick one of several visual variants" feature should follow this same server-resolves-and-broadcasts pattern.

### tongueHit broadcast

On a confirmed tongue hit, `server/GameRoom.js` `_tryTongue` broadcasts `tongueHit` with:
- `pullCol` / `pullRow` — the pull destination (always exactly 1 tile from the attacker). Drives the defender pull in `applyTongueHit`.
- `hitCol` / `hitRow` — the **actual snag tile** where the tongue connected (1–3 tiles out). Captured from the defender's position *before* the pull overwrites it. Used to truncate the tongue *visual* to the real hit distance. `network.js` forwards these to `onTongueHit`.
- `attackerFacing` — applied to the attacker on the receiving client.

> Note: the `hitCol`/`hitRow` addition required a **conscious server-rule waiver** (server files aren't normally touched for client-visual work) because the actual hit distance only exists server-side. Additive, low-risk.

### Known audio quirk
Web Audio API mobile unlock uses Phaser's own `scene.sys.game.sound.context` — do not create a separate `AudioContext` singleton or mobile unlock will break. iOS Safari does not resume the AudioContext without a user gesture (proven on-device).
