# Rib vs Bit — Project Status Doc

**Last active:** July 4, 2026

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

**Testing setup:** two Chrome windows (normal + device-emulation) cover both client perspectives with full console access. Physical iPhone 13 (Safari Private Tab, `10.0.0.11:5173`, avoids cached-room autocomplete) reserved for final verification — especially anything iOS-audio- or touch-specific, which cannot be reproduced in Chrome emulation.

---

## Session Start Checklist (mandatory)

1. Read `CLAUDE.md` and this file before doing anything else.
2. Code edits go through Claude Code as **targeted before/after snippets** — never full-file rewrites.
3. Claude (technical lead) drafts Code prompts and reviews Code's plans before Eric approves execution. Verify the **mechanism**, not the plausible story — Code's first plan is sometimes confidently wrong (caught repeatedly). Instrument first when the mechanism is unclear.
4. **Verify applied blocks, not diff summaries.** Code has introduced subtle apply-errors before (new function inserted without the old one removed). Most reliable check: Eric uploads the post-edit file so Claude verifies against raw source. This is the established protocol when verification matters.
5. ClickUp status flow: `backlog → in progress → testing/qa → deployed` (exact strings). Confirm task ID before every comment.

---

## Current State — Recently Deployed (July 4, 2026)

**Tongue-visual session — all tested two-Chrome (both perspectives) + iPhone, deployed:**

- **Tongue line drift-tracking (`86baq929r`)** — the tongue line snapshotted origin + endpoint once at fire time and never re-read them, so firing while riding a drifting platform left the line behind. Fixed by making the tongue a per-frame-updatable graphic: new `activeTongues` state (per color) + a new `update()` method on the actionEffects system, called each frame from `MainScene.update()`, that re-samples `attacker.sprite.x/y` and redraws the line + tip/pulse. Origin now follows the frog.

- **Truncate at hit (`86baq92cz`)** — tongue always drew full 3-tile range even when the hit connected closer. **Root cause was NOT the truncation logic** — it was the *fire-time* draw always using `furthestTile` (full range), producing a visible full-length overshoot for a few frames before the server's `onTongueHit` confirmation arrived. Logs showed the settled (correct) state; the eye caught the fire-frame transient. Fixed in two parts:
  - *Fire-time draw correct at source:* `_fireTongueLocal` now computes the actual hit tile from the client's already-known defender position (same approach as local `abilities.js tryTongue`) and draws to that, not full range. No overshoot on frame 1.
  - *Server confirmation as authoritative backstop:* `onTongueHit` calls `truncateTongue(attackerId, hitCol, hitRow, pullCol, pullRow)`, locking length as `|hit − pull| + 1` (drift-proof — derived purely from server values, never the live-drifting attacker col).

- **Mouth-flick demoted (incidental)** — `playTongueAnimation` drew a hardcoded 144px (3-tile) rect at a higher depth than the line, always full-length, rendering *over* the correctly-truncated line and masking the entire truncation fix (also read as a "double tongue"). Dropped `TONGUE_LENGTH` 144 → 20 (short mouth accent). The depth-10 line now carries all reach/length information.

- **Mouth/teeth drift-retrack (implemented + verified, un-ticketed)** — `playTongueAnimation`'s mouth + accent read `player.sprite.x/y` once and used `setScrollFactor(0)` (screen-space), so during platform drift the frog slid away while the mouth stayed pinned. Fixed with a parallel `activeMouths` state slot (separate from `activeTongues` — mouth lives 250ms vs. line's 120ms, can't share), synced each frame by the same `update()` via a new `syncMouth()` writing live `player.sprite.x/y` to both objects. Removed `setScrollFactor(0)` from both (safe — camera never scrolls). **Position-only retrack**; orientation stays as-fired (fire-then-turn keeps original orientation ~250ms — acceptable; orientation-retrack is the follow-up if it ever looks wrong). *No ClickUp ticket — task creation hit the workspace quota cap. Log manually when quota frees; already implemented + verified, would go straight to `testing/qa`.*

**⚠️ SERVER-RULE WAIVER (record):** the standing "server files are not touched for client-only visual work" constraint was **consciously waived** to add `hitCol`/`hitRow` to the `tongueHit` broadcast (`server/GameRoom.js`), because the actual hit-tile distance only exists server-side and cannot be reconstructed on the client. Additive + low-risk (two captured values before the pull overwrite, two new broadcast fields; `network.js` dispatch + doc comment updated to forward them). Scoped, deliberate exception — future server changes still need the same explicit waiver. (Second such waiver to date; first was `movedThisTick` in the audio session.)

---

## Backlog — Prioritized

### Recently closed (July 4, 2026)

- **`86bajan4j`** (opponent lily-pad capture notification) → **deployed.** Verified working on iPhone + Samsung (opponent does get notified on capture). Closed on device confirmation, not a code change this session.
- **`86baqav3v`** (touch D-pad during countdown) → **canceled.** Re-scoped after device testing: the real observed behavior is that the touch D-pad lingers *visibly but inert* during the inter-round countdown (appears at first GO, is not torn down on round reset). No functional bug — inputs are correctly gated on both devices; frog doesn't move. Consciously parked as a minor cosmetic issue not worth fixing vs. higher-impact queued work. The CLAUDE.md "D-pad injected after GO" doc-drift was corrected as part of the July 4 doc refresh (accurate for round 1, silent on round-transition persistence). If ever revisited: tie D-pad visibility to the round-phase gate (hide during countdown, re-show at GO).

### Low priority / research

- **`86baqubwh`** — *Research:* PC sounds queue while the Chrome window is unfocused, then flush on refocus. Almost certainly browser-level Web Audio throttling of backgrounded tabs, not our bug. Likely won't-fix; confirm before any mitigation. **(Only open ticket.)**

### Un-ticketed (quota cap)

- **Tongue mouth/teeth drift-retrack** — already implemented + verified this session (see Current State). Retried ticket creation July 4 — still blocked by the quota cap. Create manually when the cap frees; it's done, so it goes straight to `testing/qa` (or `deployed`, since the tongue work is device-verified).

### Queued, not started

- **Board redesign (next session)** — changing the board itself: adding a river lane, changing lane contents, adding a neutral lane in the middle, and updating what logs/vehicles look like. Touches `constants.js` (ROW map / grid height), `lanes.js` (lane defs + spawn templates), `worldBuilder.js` (board draw), `platformFactory.js`/`frogFactory.js` (object visuals), `theme.js` (colors), and likely `server/` (grid dimensions + hazard authority must stay in sync client↔server). See dedicated starting prompt.
- **Graphics pass** — hazard colors (cars, trucks, logs, turtles) toward an "arcade-inspired but softer" aesthetic: 85–90% saturation pulls from fully saturated arcade primaries, anchored to values in `src/config/theme.js`. (May fold into the board-redesign visual work.)
- **Sound-design tuning** — including the two-phase whoosh-snap tongue sound (deployed but marked not-final). Deferred until the backlog clears.

---

## Key Architectural Facts

- **Player IDs are literally `'red'` / `'blue'`.** `onTongueFired` resolves full player objects via `this.players[attackerId]`.
- **Server tick rate is 20/sec = 50ms.** Player sprite positions are **snapped on each tick, never interpolated** — for both local and opponent players (`_applyServerTick` does direct assignment `player.sprite.x = data.x`). No client-side smoothing exists; `applyPlatformCarry` is gated off in network mode. (This is why per-frame tongue retracking looks the same as the body's own motion granularity — both step in 50ms increments.)
- **`_pendingRoom`** (set unconditionally in `create()`), NOT `localPlayerId`, is the correct signal to distinguish network vs. local mode at `startRoundIntro()` call sites — `localPlayerId` is still null at the title-tap point and would make guards silent no-ops.
- **Local mode (server-less, both frogs one keyboard, `localPlayerId` null) is confirmed unreachable** in the current two-terminal setup — every page load resolves a room and connects. Guarded local-mode branches are dead-branch insurance, never hit in network play. **Watch item:** if a doubled intro ever appears *between rounds* (not at match start), the `roundFlow.onResume` intro calls are the first suspects.
- **Opponent-triggered effects (audio + visual) need direct local calls, not gated behind `localPlayerId`.** The server-echo guard (`attacker.id !== localPlayerId`) blocks backfill, so touch paths and opponent handlers must invoke local audio/visual directly. Recurred for: tongue visual, hop sound, crash sound, tongue sound.
- **`movedThisTick`** is a per-tick server signal, self-clearing at the end of `_broadcastTick`. True only on a successful `_tryMove` input — carry and resets do NOT set it.
- **Audio uses Phaser's own `scene.sys.game.sound.context`** (via `getCtx()`), which survives `scene.restart()`. Never create a separate `AudioContext` — iOS mobile unlock breaks otherwise. **iOS Safari does not resume the AudioContext without a user gesture** (proven on-device).
- **The board camera never scrolls** — no follow target, no scroll assignment; only `zoomTo` (score-pause) and `shake` (score/intro). World-space vs. screen-space (`setScrollFactor`) therefore render identically today, but the two are not always declared consistently across visuals. (The tongue line uses default world-space; the mouth visuals had `setScrollFactor(0)` removed this session to match.)
- **`tryTongue` draw paths in `abilities.js`** are vestigial (local-mode only, unreachable). Flag if `abilities.js` is touched.
- **`playStart()` in `audio.js`** is unused (no call sites in `src/`) — dead code, left in place.

### Tongue attack — three distinct visuals

Debugging confusion this session came largely from these being conflated. They are separate:

1. **Tongue line** — `drawTongue` in `actionEffects.js`, `tongueGfxRed`/`tongueGfxBlue` at **depth 10**. Primary reach/length indicator (pink line + tip/pulse circles). Drift-tracks + truncates as of this session.
2. **Mouth-flick** — `playTongueAnimation` in `actionEffects.js`, `mouthGfx` (teeth) + accent `tongueRect` at **depth ~19-20**. 250ms shoot-out/retract. Now a short 20px accent; drift-tracks as of this session.
3. **Hit reaction** — `applyTongueHit` in `abilities.js`: defender pop/tint + 150ms pull tween. Not a tongue visual per se.

**Server hit model (`GameRoom.js _tryTongue`):** range `TONGUE_RANGE_TILES = 3` (center-to-center). 2 empty tiles between = distance 3 = max hittable. 3 empty tiles between = distance 4 = no hit (correct). Same-tile = no hit (intended). On hit, broadcasts `pullCol`/`pullRow` (pull destination, always 1 tile from attacker), `hitCol`/`hitRow` (actual snag tile — added this session), `attackerFacing`.

---

## Key Principles / Learnings

- **Verify mechanism, not plausibility.** Demand device readings, file evidence, or instrumentation output before approving a fix. Code's first plan is sometimes confidently wrong; every time this session, demanding evidence caught it.
- **Instrument → confirm → fix → strip.** Add caller-tagged temp logs when a draw path or timing is unclear, confirm the trace matches the hypothesis, fix, then remove ALL instrumentation before closing. This session's telemetry is what exposed that the length math was correct AND a different graphic was masking it — neither visible from static reading.
- **Logs can show the settled state while the eye catches a transient.** The truncation "still 3 tiles" bug was a fire-frame overshoot that a log-of-final-state couldn't reveal. When logs and screen disagree, get ground truth from the screen (screenshots / frame-by-frame recording), not another round of log-reading.
- **When multiple visuals overlap, isolate which one you're actually debugging.** Rounds of confusion collapsed once the depth-10 line was separated from the depth-20 flick. A correct fix on the wrong graphic looks like no fix.
- **Live references drift.** Reading `attacker.col`/`sprite.x` "now" against a value captured "then" (fire time) produces garbage when the frog moved in between. Lock time-sensitive values when known, or derive from drift-immune sources (e.g., server pull/hit deltas).
- **Per-tick vs. one-shot:** sounds/effects driven by per-tick state comparison can machine-gun (~20×/sec) if the gating state persists; one-shot event triggers can't. Check which kind when wiring a networked effect.
- **Constraint waivers are explicit.** Standing constraints can be waived but must be consciously acknowledged and recorded, never silently bypassed (`movedThisTick`, `hitCol`/`hitRow` to date — both because the needed info only existed server-side).
- **Test the full matrix** for any networked audio/visual: local keyboard, local touch (iPhone), opponent-fires-both-directions. The touch path and opponent path are where gaps hide.

---

## Dev Commands

```bash
npm run dev        # Vite (:5173) — project root
# separate terminal, in server/:
npm run dev        # node --watch index.js — WS server (:3001)
npm run build      # production build
```

**Port conflict cleanup (Windows PowerShell):**
```powershell
for /f "tokens=5" %a in ('netstat -ano ^| findstr :[PORT]') do taskkill /PID %a /F
```

---

## ClickUp

- List ID: `901415825223` (folder `90148891360`, space `90145027732`). Status flow: `backlog → in progress → testing/qa → deployed` (exact strings). Task type: `Project`.
- **Note:** the board also has `planning` and `review` statuses not in the documented flow (`review` sits between `testing/qa` and `deployed`). Worth reconciling this doc with the actual board, or start using them intentionally.
- Confirm task ID before every `clickup_create_comment` (a misfiling established this).
- Check `expand_statuses: true` on `clickup_get_task` before status updates.
- Known quota: **"Max usage for custom task types reached"** = workspace plan cap, blocks **task creation only** (status updates on existing tasks are unaffected); retrying won't resolve it. Create the task manually in the ClickUp UI when this hits. Has recurred multiple sessions.
- **Knowledge Base doc** lives in the project's Docs section: "Rib vs Bit — Knowledge Base" (`2kyd8qpc-854`).
