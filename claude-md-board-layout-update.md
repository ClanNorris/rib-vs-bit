<!-- Paste this block into CLAUDE.md, replacing the existing "### Board layout (`src/config/constants.js`)" section under Architecture. -->

### Board layout (`src/config/constants.js`)

A 15×15 tile grid (48px tiles) — grew from 15×13 on July 8, 2026, when a 4th river lane was added and the safe zone widened from 1 row to 2. Rows are named constants in `ROW`:

| Row | Name |
|-----|------|
| 0 | TOP_PADS (Bit's scoring pads) |
| 1 | TOP_START (Bit spawn) |
| 2–5 | River lanes (4 lanes: log, log, shortLog, turtle — see `lanes.js` for the current per-row assignment, which was reshuffled in the July 8 lane-content pass) |
| 6–7 | Safe zone (`SAFE_1`, `SAFE_2` — `ROW.SAFE` aliases to 6) |
| 8–11 | Road lanes (car/sportsCar/truck/cyberTruck — see "Vehicle skin alternation" below) |
| 12 | BOTTOM_START (Rib spawn) |
| 13 | BOTTOM_PADS (Rib's scoring pads) |
| 14 | HUD row |

`GAME_WIDTH`/`GAME_HEIGHT` are **derived** (`COLS`/`ROWS * TILE_SIZE`), not literal — 720×720 as of this grid size. Canvas dimensions in `main.js` are separate literals and do **not** auto-update with the grid — confirm they match if `ROWS`/`COLS` ever change again.

**Vehicle skin alternation:** road lanes 8–11 each have a primary vehicle type plus an occasional alt skin (`altType`/`altChance` on the lane def), resolved server-side in `GameRoom.js materializeLane()` and broadcast as a `vehicleSkins` array — not rolled independently per client. See `rib-vs-bit-status.md`'s July 8 session notes for the full row-by-row mapping.
