# Rib vs Bit — Project Status Doc

**Last active:** July 2, 2026

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
4. ClickUp status flow: `backlog → in progress → testing/qa → deployed` (exact strings). Confirm task ID before every comment.

---

## Current State — Recently Deployed (July 2, 2026)

**Audio + round-intro session (all tested PC + iPhone, deployed):**

- **Opponent hop + car-collision sounds (`86baqkj46`)** — opponent-triggered hop/crash were silent (only fired for local player). Fixed: opponent hop via a server-authoritative `movedThisTick` flag consumed in `_applyServerTick`; local touch hop added to the D-pad `onMove`; opponent crash de-gated at MainScene.js:282 to mirror the ungated splash path.
- **Two machine-gun regressions from the hop trigger, both fixed:**
  - *Log-carry false hops* — raw position-delta fired on platform-carry drift. Fixed with the `movedThisTick` flag (set only on a successful `_tryMove` input, broadcast in `_serializePlayer`, client keys off `data.movedThisTick`).
  - *Score-pause machine-gun* — `movedThisTick` only cleared in `_processInputs`, which doesn't run during `scorePause`, so it latched true and re-broadcast ~20×. Fixed by self-clearing both players' `movedThisTick = false` at the end of `_broadcastTick` (true per-tick signal). The `_processInputs` clear is now redundant but kept as belt-and-suspenders.
- **Round intro fires prematurely / doubled RIB-BIT-GO (`86baqua66`)** — `startRoundIntro()` had two premature local triggers (title-tap `onStart`; `skipTitle` rematch) plus the correct server-driven `onCountdown:3`. Guarded both premature triggers on `!this._pendingRoom` so network mode defers entirely to the server countdown.
- **Tongue-attack sound** — `playTongue()` added to `audio.js` (was never written) and wired into all three fire paths (`_fireTongueLocal`, keyboard path, `onTongueFired` opponent handler). Current design: two-phase whoosh-then-snap. Working across devices/players. **Sound character will get further tuning after the backlog clears** — not final.
- **iOS audio silent until first input (`86bahhn0z`)** — closed **cannot-reproduce**. RIB-BIT-GO plays reliably on iPhone; suspended-context hypothesis disproven on-device.

**⚠️ SERVER-RULE WAIVER (record):** the standing "server files are not touched for client-only visual/audio work" constraint was **consciously waived** for the two `movedThisTick` fixes, because the carry-vs-input distinction only exists server-side and the change was additive + low-risk. Scoped, deliberate exception — future server changes still need the same explicit waiver.

---

## Backlog — Prioritized

### Next up: tongue-visual pair (tackle together — shared draw-path context)

- **`86baq929r`** — *Polish:* tongue visuals don't track the sprite during platform drift. The tongue endpoint is a fire-time snapshot; if the attacker is riding a drifting platform, the visual doesn't follow. Pre-existing.
- **`86baq92cz`** — *Enhancement:* network-mode tongue visual doesn't truncate at hit. Client draws the full tongue range at input time, before the server confirms the hit — so the visual overshoots the actual stun target. Server broadcasts `pullCol`/`pullRow`/`attackerFacing` at hit confirmation (`onTongueHit`); the draw should use that to truncate.

### After that

- **`86bajan4j`** — *Bug:* no notification to the opponent when a lily pad is captured. Opponent should get a visual/HUD cue on capture. (Note: `onScore` network handler + `playScore` audio already fire; this is about an opponent-facing capture *notification*, not the sound.)
- **`86baqav3v`** — *Client:* touch input path sends inputs during the countdown (server discards them via the `_inputsOpen` gate, so no gameplay leak — but the client shouldn't send). Also carries a **CLAUDE.md doc-drift fix**: the doc's "D-pad injected after GO" claim is contradicted by evidence.

### Low priority / research

- **`86baqubwh`** — *Research:* PC sounds queue while the Chrome window is unfocused, then flush on refocus. Almost certainly browser-level Web Audio throttling of backgrounded tabs, not our bug. Likely won't-fix; confirm before any mitigation.

---

## Key Architectural Facts

- **Player IDs are literally `'red'` / `'blue'`.** `onTongueFired` resolves full player objects via `this.players[attackerId]`.
- **`_pendingRoom`** (set unconditionally in `create()` at ~:358), NOT `localPlayerId`, is the correct signal to distinguish network vs. local mode at `startRoundIntro()` call sites — `localPlayerId` is still null at the title-tap point and would make guards silent no-ops.
- **Local mode (server-less, both frogs one keyboard, `localPlayerId` null) is confirmed unreachable** in the current two-terminal setup — every page load resolves a room and connects. Guarded local-mode branches (`startRoundIntro` at skipTitle/onStart; `roundFlow.onResume` intro calls at MainScene.js :226/:232) are effectively dead-branch insurance. **Watch item:** if a doubled intro ever appears *between rounds* (not at match start), :226/:232 are the first suspects.
- **Opponent-triggered effects (audio + visual) need direct local calls, not gated behind `localPlayerId`.** The server-echo guard (`attacker.id !== localPlayerId`) blocks backfill, so touch paths and opponent handlers must invoke local audio/visual directly. This pattern has now recurred for: tongue visual, hop sound, crash sound, tongue sound.
- **`movedThisTick`** is a per-tick server signal, self-clearing at the end of `_broadcastTick`. True only on a successful `_tryMove` input — carry and resets (`_resetPlayer`, direct field assignment) do NOT set it.
- **Audio uses Phaser's own `scene.sys.game.sound.context` throughout** (via `getCtx()`), which survives `scene.restart()`. Never create a separate `AudioContext` — iOS mobile unlock breaks otherwise. **iOS Safari does not resume the AudioContext without a user gesture** (proven on-device; no exceptions). CLAUDE.md line 64 corrected this session to match.
- **`tryTongue` draw paths in `abilities.js`** may be vestigial (guarded to local mode). Flag if `abilities.js` is touched.
- **`playStart()` in `audio.js`** is unused (no call sites in `src/`) — dead code, left in place.

---

## Key Principles / Learnings

- **Verify mechanism, not plausibility.** Demand device readings, file evidence, or instrumentation output before approving a fix. This session: the "async resume race" audio theory and the "frozen-clock RIB drop" theory were both plausible and both wrong — killed by on-device readings. The real audio bug (opponent sounds) was a different bug entirely, found only by testing.
- **Instrument before fixing** when the mechanism is unclear: add caller tags / temp logs, confirm the trace, then fix. Strip all instrumentation before closing (tags used this session: `[AUDIO-UNLOCK]`, `[HOP-SFX]`, `[CAPTURE-NOISE]`).
- **Per-tick vs. one-shot audio:** sounds driven by per-tick state comparison can machine-gun (~20×/sec) if the gating state persists; one-shot event triggers (keypress, touch, single network message) can't. When adding a networked sound, check which kind it is.
- **Test the full matrix** for any networked audio/visual: local keyboard, local touch (iPhone), opponent-fires-both-directions. The touch path and the opponent path are where gaps hide.

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

- List ID: `901415825223`. Status flow: `backlog → in progress → testing/qa → deployed` (exact strings). Task type: `Project`.
- Confirm task ID before every `clickup_create_comment` (a misfiling established this).
- Check `expand_statuses: true` on `clickup_get_task` before status updates.
- Known quota: **"Max usage for custom task types reached"** = workspace plan cap; retrying won't resolve it. Create the task manually in the ClickUp UI when this hits (happened this session on the tongue-sound task — Eric to create manually).
