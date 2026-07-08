# Rib vs Bit — Project Status Doc

**Last active:** July 8, 2026

---

## What It Is

A 1v1 web-based Frogger-style PvP game. Two frogs (Rib = red, Bit = blue) compete to capture the opponent's three lily pads. Built with Phaser 3.60.0 + Vite on the frontend and a Node.js WebSocket server on the backend. Server-authoritative multiplayer.

---

## Stack

| Layer | Tech | Host |
|---|---|---|
| Frontend | Phaser 3.60.0 (pinned, not `^`) + Vite | Netlify |
| Backend | Node.js + `ws` (raw WebSockets) | Railway |
| Repo | github.com/ClanNorris/rib-vs-bit | GitHub |

**Dev launch (two terminals):**
- Vite: `npm run dev` in project root → `localhost:5173` (PC), `10.0.0.11:5173` (iOS, same WiFi)
- Server: `npm run dev` in `server/` → `node --watch index.js`, port 3001
- Vite proxies `/ws` → `ws://localhost:3001`

**Testing setup:** two Chrome windows (normal + device-emulation) cover both client perspectives with full console access. Physical iPhone 13 (Safari Private Tab, `10.0.0.11:5173`) reserved for final verification — anything iOS-audio-, touch-, or canvas-sizing-specific, which cannot be reproduced in Chrome emulation.

---

## Session Start Checklist (mandatory)

1. Read `CLAUDE.md` and this file before doing anything else.
2. Code edits go through Claude Code as **targeted before/after snippets** — never full-file rewrites.
3. Claude (technical lead) drafts Code prompts and reviews Code's plans before Eric approves execution. Verify the **mechanism**, not the plausible story. Instrument first when the mechanism is unclear.
4. **Verify applied blocks, not diff summaries.** Most reliable check: Eric uploads/pastes the post-edit file so Claude verifies against raw source. This is the established protocol when verification matters.
5. ClickUp status flow (main list `901415825223`): `backlog → in progress → testing/qa → deployed` (exact strings). Board-redesign list (`901417761431`) uses a different flow: `to do → planning → in progress → at risk → update required → on hold → complete → cancelled`. Confirm task ID before every comment/update.

---

## Current State — Board Redesign Session (July 8, 2026)

**Status: grid, lane content, and full visual reshape all applied, verified against raw source at every step, and tested on two-Chrome-window setup + physical iPhone. Not yet deployed to Netlify/Railway — that's the explicit next step, in a clean chat.**

### Phase 1 — Grid renumbering (ClickUp `86barch6b`, complete)

Board grew from 15×13 to 15×15: added a 4th river lane (row 5) and widened the safe zone from 1 row to 2 (rows 6–7), pushing all 4 road lanes and the bottom spawn/pad rows down by 2.

New `ROW` map: `TOP_PADS:0, TOP_START:1, RIVER_1-4:2-5, SAFE_1:6, SAFE_2:7 (SAFE alias:6), ROAD_1-4:8-11, BOTTOM_START:12, BOTTOM_PADS:13, HUD:14`.

Files touched: `server/constants.js`, `src/config/constants.js`, `src/config/gameTuning.js`, `src/config/lanes.js`, `main.js`, `src/style.css` (found mid-session: stale `#app { height: 624px }` would've letterboxed the taller canvas — fixed as a 6th edit).

Mid-session correction: the original plan mis-located `chooseBounds()`'s `def.row === 8` speed-variance override in `server/constants.js` — it actually lives in `server/GameRoom.js`. Code caught the mismatch (the planned edit would have thrown, targeting a string that doesn't exist in that file), self-corrected, and renamed it to `row10` in the right place.

`GAME_HEIGHT`/`GAME_WIDTH` are **derived** (`ROWS * TILE_SIZE`), not literal, in both constants files — renumbering `ROWS` cascades automatically, no manual edit needed there.

Mobile canvas height changed 935→1031 (inferred: preserving the existing 311px fixed touch-UI offset, `720 + 311`). **Confirmed correct on physical iPhone this session.**

### Lane content pass (river rows, complete)

- Row 2: turtle (relocated from old row 4, unchanged otherwise)
- Row 3: log, length bumped 3→4 (relocated from old row 2)
- Row 4: shortLog (see visual pass — was `logCircle`; relocated from old row 3)
- Row 5: turtle, length 3→2 ("purposely harder near the neutral zone," by design)
- Directions alternate row-by-row, anchored at row 5 (`dir: -1`): row 5 = -1, row 4 = +1, row 3 = -1, row 2 = +1.

### Visual reshape pass (ClickUp `86barch9n`, complete)

- **Logs / shortLogs** — `logCircle` renamed `shortLog`; the old bundled-circle-raft concept was dropped, it's now just a 2-tile version of the same log shape. Rounded capsule (rect body + circle end caps), horizontal grain lines, **front cap only** gets a 3-ring tree-cut detail (dark ring / body-color ring / bright core) so direction is readable at a glance — back cap stays plain. Built facing right by default, `container.scaleX = dir` flips for leftward lanes (same convention used for every vehicle).
- **Vehicles** — corrected mid-session from an initial side-view mockup to **top-down** (the whole game is top-down — confirmed by `frogFactory`'s head-on-top construction). Four types: car, sportsCar, truck, cyberTruck — same footprint/hitbox as their base type, only decorative skin differs.
- **Vehicle skin alternation** — row 8 (car, alt sportsCar), row 9 (truck, alt cyberTruck), row 10 (sportsCar, alt car), row 11 (cyberTruck, alt truck). 25% chance per spawn, hard-capped at 2 alt-skin vehicles per lane. Resolved **server-side** in `GameRoom.js materializeLane()` via `rollVehicleSkins()`, shipped as a `vehicleSkins` array riding inside the existing synced lane-plan broadcast — deliberately *not* rolled independently per-client, to guarantee both players see the identical skin on the identical vehicle.
- **Architecture pattern extended** — all hazard types (log/shortLog, car, sportsCar, truck, cyberTruck) now follow the turtle-decoration pattern: an invisible hitbox rectangle (`GAME_THEME.objects.turtleHitbox`/`turtleHitboxAlpha`, physics/collision fully unchanged) plus a separate decorative Container synced via `laneSystem.js`'s existing host/offsetX generic sync mechanism. No new sync path was invented — turtles were already the template.
- **Real bug found and fixed** — `Phaser.GameObjects.Polygon`'s default origin centering is broken for point sets defined symmetrically around `(0,0)`: `GetAABB` tracks the true `minX`/`minY`, but `updateDisplayOrigin()` only uses `width`/`height`, discarding where the box starts, so the rendered shape lands offset by `-0.5*width, -0.5*height`. Confirmed against actual Phaser 3.60.0 source (`Origin.js`, `GetAABB.js`, `FillPathWebGL.js`), not guessed. Affected `sportsCar`/`cyberTruck` (both use `scene.add.polygon`) — plain `rectangle`/`circle` objects don't have this quirk. Fixed by defining polygon points in `0..width, 0..height` space instead of symmetric `-half..+half` space.
- **Row 11 speed-variance side effect, caught and fixed** — renaming row 11's base `type` to `'cyberTruck'` broke `chooseBounds()`'s `def.type === 'truck'` fallback (predates this session, written for a two-type car/truck world), silently dropping row 11 to the wider `.road.default` bounds. Fixed: `if (def.type === 'truck' || def.type === 'cyberTruck')`.

### Lily pads + neutral zone (complete)

- Lily pads rebuilt from `scene.add.ellipse` to a **`Graphics`-based notched pad** (Pac-Man-style wedge, ~50° notch, facing up on all 6 pads) — chosen specifically to avoid the Polygon origin bug above (`Graphics.arc()` draws in true local coordinates, no AABB/displayOrigin step involved). Capture-hiding behavior (`pad.x = -9999`) confirmed unaffected by the swap — grepped all consumers; `Graphics` exposes the same `.x`/`.y`/`.setDepth()` interface the old `Ellipse` did.
- Neutral zone (rows 6–7): removed the old single-row grey `centerStripe` decoration entirely — this also retroactively resolves the `SAFE: 6` alias question deferred since Phase 1 (no more stripe concept to extend across 2 rows). Added 3 dense bush clusters (13 overlapping circles each, 3 tonal shades: highlight/base/shadow — first attempt at 5 circles read as a flower, not a bush; rebuilt denser after a reference image) centered on the row 6/7 seam at 3 column positions, offset from the pad columns. Bush clusters are **static, one-time board decorations** — no `.host`/`.offsetX`, not wired into the per-frame lane-decoration sync (unlike every hazard decoration this session, these never move).
- `centerStripe` theme key removed outright — grep confirmed zero other consumers.

### Grid lines removed (complete)

The always-on thin per-tile grid outline in `drawBoard()` (a testing/dev aid) removed now that the board is considered deployable. F3 debug overlay (a separate toggleable dev tool) intentionally left untouched. `colors.grid` theme key removed after grep confirmed no other consumer.

### Testing status

- Two-Chrome-window functional testing: passed at every stage of this session (grid, lane content, visual reshape, lily pad/bush, grid-line removal).
- **Physical iPhone testing: completed this session** — confirms the full board redesign plays correctly on-device, including the inferred mobile canvas height change.
- **Not yet deployed to Netlify (frontend) or Railway (backend).** Both services need redeploying, since this session touched both `src/` and `server/` extensively. This is the explicit focus of the next session.

---

## Known Doc-Drift Fixed This Session

- `CLAUDE.md`'s "Board layout" section (the `ROW` table) was stale — still described the pre-redesign 15×13 grid. Corrected as part of this session.
- `CLAUDE.md`'s lanes.js table row and `laneSystem.js`'s inline comment (both referenced `logCircle`) were updated during the visual-reshape Code prompt, alongside the code changes that made them stale.

**Not yet fixed, flagged for later:** `CLAUDE.md`'s "Systems pattern" table and "Multiplayer" section don't yet mention the new hazard-decoration factories or the `vehicleSkins` field added to the tick/lane-plan broadcast. Minor, non-blocking — the code itself is fully documented via this file and inline comments.

---

## Backlog — Prioritized

### Recently closed (July 8, 2026)

Full board redesign — grid renumbering, lane content pass, visual reshape (logs/vehicles/alternation), lily pads + neutral-zone bushes, grid-line removal. See **Current State** above for full detail.

### Recently closed (July 4, 2026) — tongue-visual session

- Tongue line drift-tracking (`86baq929r`), truncate-at-hit (`86baq92cz`), mouth/teeth drift-retrack — all deployed and device-verified.
- `86bajan4j` (opponent lily-pad capture notification) → deployed, device-confirmed.
- `86baqav3v` (touch D-pad during countdown) → canceled, re-scoped as a known minor cosmetic non-issue.

### Low priority / research

- `86baqubwh` — PC sounds queue while the Chrome window is unfocused, flush on refocus. Almost certainly browser-level Web Audio throttling, not our bug. Only open ticket carried from before this session.

### Un-ticketed (quota cap — re-check status)

- Tongue mouth/teeth drift-retrack — implemented + verified July 4, was still blocked from formal ticket creation by the ClickUp quota cap as of the last check. Create manually when the cap frees; it's done, so it'd go straight to `testing/qa`/`deployed`.

### Queued, not started

- **Deployment (next session, clean chat)** — Netlify (frontend) + Railway (backend). Both services need a fresh deploy since this session's changes span `src/` and `server/` extensively. Also owed: a final live-environment device check, since local dev-server testing and a deployed build aren't guaranteed identical (CORS, WS URL resolution, build-time env vars, etc. — nothing specific is known to be wrong, just unverified).
- **Sound-design tuning** — including the two-phase whoosh-snap tongue sound (deployed but marked not-final) and the still-unwritten `playTongue()` in `audio.js` (clean feature add, flagged since the audio session, never picked up). Deferred until backlog clears — still true.
- **Minor cleanup** — the `SAFE: 6` alias in the `ROW` map has no remaining consumer now that `centerStripe` is gone. Safe to remove in a future pass; not urgent, not blocking anything.
- **Architectural gap, still unresolved** — lane/pad-column data still exists as independently hand-typed literal copies in `server/constants.js`, `src/config/lanes.js`, and `src/config/gameTuning.js`, with no shared import enforcing consistency. Every lane-def change this session required manually mirroring at least two of these files. Flagged repeatedly across sessions; still not fixed.

---

## Key Architectural Facts

- **Board grid is 15 cols × 15 rows** (was 15×13 before July 8, 2026). `GAME_WIDTH`/`GAME_HEIGHT` are derived (`COLS`/`ROWS * TILE_SIZE`), not literal, in both `server/constants.js` and `src/config/constants.js`.
- **`Phaser.GameObjects.Polygon`'s default origin does not correctly center point sets defined symmetrically around (0,0)** — verified against Phaser 3.60.0 source this session. Any future polygon-based decoration must define points in `0..width, 0..height` space, not `-half..+half`. Plain `rectangle`/`circle` objects don't have this quirk — only `add.polygon`.
- **`chooseBounds()` in `server/GameRoom.js` keys speed-variance overrides partly on `def.type`** (the `'truck'`/`'car'` string checks), not purely on `def.row` — renaming a lane's base `type` (as happened with rows 10/11 this session) can silently change its speed bounds unless type-based branches are updated too.
- **Vehicle cosmetic skin choice is resolved server-side and broadcast, not rolled independently per client** — same principle as `templateId`/`speedMultiplier`. Any future "pick one of several visual variants" feature should follow this pattern to avoid the two players seeing different things on the same object.
- **Player IDs are literally `'red'` / `'blue'`.**
- **Server tick rate is 20/sec = 50ms.** Player sprite positions are snapped on each tick, never interpolated, for both local and opponent players. No client-side smoothing; `applyPlatformCarry` is gated off in network mode.
- **`_pendingRoom`** (set unconditionally in `create()`), NOT `localPlayerId`, is the correct signal to distinguish network vs. local mode at `startRoundIntro()` call sites.
- **Local mode (server-less, both frogs one keyboard) is confirmed unreachable** in the current two-terminal setup.
- **Opponent-triggered effects (audio + visual) need direct local calls, not gated behind `localPlayerId`** — the server-echo guard blocks backfill. Recurred for: tongue visual, hop sound, crash sound, tongue sound.
- **`movedThisTick`** is a per-tick server signal, self-clearing at the end of `_broadcastTick`.
- **Audio uses Phaser's own `scene.sys.game.sound.context`**, which survives `scene.restart()`. Never create a separate `AudioContext`.
- **The board camera never scrolls** — no follow target, no scroll assignment.
- **`tryTongue` draw paths in `abilities.js`** are vestigial (local-mode only, unreachable).
- **`playStart()` in `audio.js`** is unused — dead code, left in place.

---

## Key Principles / Learnings

- **Verify against library source when a visual bug's cause isn't obvious from your own code.** The Polygon origin bug this session was found by installing Phaser locally and reading `Origin.js`/`GetAABB.js`/`FillPathWebGL.js` directly, not by guessing at Phaser's behavior from memory. Confirmed root cause beats plausible root cause — same standard applied to Code's output all session, applied here to a third-party library too.
- **A rename can have hidden downstream effects beyond its stated scope.** Renaming row 11's base type to `'cyberTruck'` silently changed its speed-variance bounds via an unrelated `chooseBounds()` type-check that predated the rename. Any rename should prompt a check for other places matching on the old string/type, not just the obviously-related ones.
- **Mockup before code, for visual/design decisions.** This session used inline SVG mockups (built and shown before any Code prompt) for shape/color/direction sign-off on hazards, catching two real design corrections (side-view→top-down, log rounding proportions) before any implementation time was spent. Worth repeating for future visual passes.
- **Verify mechanism, not plausibility.** Demand device readings, file evidence, or (this session) library-source evidence before approving a fix.
- **Instrument → confirm → fix → strip.** Add caller-tagged temp logs when a draw path or timing is unclear; confirm the trace matches the hypothesis; fix; remove all instrumentation before closing.
- **When multiple visuals overlap, isolate which one you're actually debugging.**
- **Live references drift.** Reading a value "now" against one captured "then" produces garbage when state moved in between.
- **Per-tick vs. one-shot:** effects driven by per-tick state comparison can machine-gun if the gating state persists; one-shot event triggers can't.
- **Constraint waivers are explicit.** Standing constraints can be waived but must be consciously acknowledged and recorded, never silently bypassed.
- **Test the full matrix** for any networked audio/visual: local keyboard, local touch, opponent-fires-both-directions.

---

## Dev Commands

```bash
npm run dev        # Vite (:5173) — project root
# separate terminal, in server/:
npm run dev        # node --watch index.js — WS server (:3001)
npm run build       # production build
```

**Port conflict cleanup (Windows PowerShell):**
```powershell
for /f "tokens=5" %a in ('netstat -ano ^| findstr :[PORT]') do taskkill /PID %a /F
```

---

## ClickUp

- **Main list:** `901415825223` (folder `90148891360`, space `90145027732`). Status flow: `backlog → in progress → testing/qa → deployed`. Task type: `Project`. Also has `planning`/`review` statuses not in the documented flow — worth reconciling or using intentionally.
- **Board Redesign list:** `901417761431` (space "Rib vs Bit Board Updates", workspace `90141122252`). Different status flow: `to do → planning → in progress → at risk → update required → on hold → complete → cancelled`. Tasks `86barch6b` (Phase 1, grid) and `86barch9n` (Phase 2, visual) — both fully complete as of this session.
- Confirm task ID before every comment/status update. Check `expand_statuses: true` on `clickup_get_task` before status updates.
- Known quota: "Max usage for custom task types reached" blocks task **creation** only (status updates unaffected); create manually in the ClickUp UI when hit.
- **Knowledge Base doc:** "Rib vs Bit — Knowledge Base" (`2kyd8qpc-854`) in the project's Docs section.
