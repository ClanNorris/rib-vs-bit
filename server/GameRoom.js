// server/GameRoom.js — authoritative 20 tick/sec game simulation

'use strict';

const {
  TILE_SIZE, COLS, ROWS, GAME_WIDTH,
  ROW, RIVER_ROWS, ROAD_ROWS, TOP_PAD_COLS, BOTTOM_PAD_COLS,
  WIN_SCORE, TICK_MS,
  MOVE_COOLDOWN_MS, TONGUE_COOLDOWN_MS, TONGUE_RANGE_TILES, STUN_DURATION_MS,
  RESPAWN_DELAY_MS, RESPAWN_INVULN_MS, GO_HAZARD_GRACE_MS,
  SCORE_PAUSE_MS, COUNTDOWN_STEP_MS,
  PLAYER_STATES,
  SUPPORT_WIDTH_MULTIPLIER, MINIMUM_OVERLAP_PX, PLAYER_BODY_RADIUS,
  WRAP_PADDING,
  RIVER_LANE_DEFS, ROAD_LANE_DEFS, SPEED_VARIANCE,
  FLY,
} = require('./constants');

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function centerX(col) { return col * TILE_SIZE + TILE_SIZE / 2; }
function centerY(row) { return row * TILE_SIZE + TILE_SIZE / 2; }

function isPlayerAlive(p) {
  return p.state === PLAYER_STATES.ALIVE || p.state === PLAYER_STATES.INVULNERABLE;
}

function isPlayerHazardVulnerable(p) {
  return p.state === PLAYER_STATES.ALIVE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane-plan generation  (mirrors src/config/lanes.js)
// ─────────────────────────────────────────────────────────────────────────────

function chooseBounds(def, family) {
  if (family === 'river') {
    return def.type === 'turtle' ? SPEED_VARIANCE.river.turtle : SPEED_VARIANCE.river.default;
  }
  if (def.row === 10)        return SPEED_VARIANCE.road.row10;
  if (def.type === 'truck' || def.type === 'cyberTruck')  return SPEED_VARIANCE.road.truck;
  return SPEED_VARIANCE.road.default;
}

function rollVehicleSkins(def, spawns) {
  if (!def.altType) return null;
  const skins = spawns.map(() => def.type);
  let altCount = 0;
  for (let i = 0; i < skins.length && altCount < 2; i++) {
    if (Math.random() < def.altChance) {
      skins[i] = def.altType;
      altCount++;
    }
  }
  return skins;
}

function materializeLane(def, family) {
  const idx = Math.floor(Math.random() * def.templates.length);
  const templateId = String.fromCharCode(65 + idx);   // 'A', 'B', 'C'
  const spawns = def.templates[idx].slice();

  const bounds = chooseBounds(def, family);
  const unit = clamp(Math.random(), 0, 0.999999);
  const speedMultiplier = Number(
    (bounds.min + (bounds.max - bounds.min) * unit).toFixed(3)
  );
  const speed = Math.max(0.001, Number((def.speed * speedMultiplier).toFixed(3)));

  return { row: def.row, dir: def.dir, baseSpeed: def.speed, speedMultiplier, speed,
           type: def.type, length: def.length, spawns, templateId,
           vehicleSkins: rollVehicleSkins(def, spawns) };
}

function createMatchLanePlan() {
  return {
    riverLanes: RIVER_LANE_DEFS.map(d => materializeLane(d, 'river')),
    roadLanes:  ROAD_LANE_DEFS.map(d => materializeLane(d, 'road')),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build world objects from lane plan
// ─────────────────────────────────────────────────────────────────────────────

function buildWorldObjects(riverLanes, roadLanes) {
  let seq = 0;
  const platforms = [];
  const vehicles  = [];

  for (const lane of riverLanes) {
    for (const spawnCol of lane.spawns) {
      platforms.push({
        id: `r${lane.row}-${seq++}`,
        x: centerX(spawnCol),
        y: centerY(lane.row),
        width: lane.length * TILE_SIZE,
        height: TILE_SIZE,
        isMainPlatform: true,
        lane: { row: lane.row, dir: lane.dir, speed: lane.speed, type: lane.type, length: lane.length },
      });
    }
  }

  for (const lane of roadLanes) {
    for (const spawnCol of lane.spawns) {
      vehicles.push({
        id: `d${lane.row}-${seq++}`,
        x: centerX(spawnCol),
        y: centerY(lane.row),
        width: lane.length * TILE_SIZE,
        height: TILE_SIZE,
        lane: { row: lane.row, dir: lane.dir, speed: lane.speed, type: lane.type },
      });
    }
  }

  return { platforms, vehicles };
}

// ─────────────────────────────────────────────────────────────────────────────
// GameRoom
// ─────────────────────────────────────────────────────────────────────────────

class GameRoom {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    // Arms the post-match "Continue?" grace/countdown window. Called from
    // _endGame() the instant every match ends (the primary trigger — gives
    // players ~20s to rematch before the room is torn down, regardless of
    // connection state), and re-armed from handleRestart() (before either
    // client could possibly have reconnected yet) and removeClient() (when
    // one player leaves during the gameOver phase) so an in-flight
    // reconnect/rematch always gets a fresh window.
    this._onRequestContinueGrace = options.onRequestContinueGrace || null;

    // { red: WebSocket | null, blue: WebSocket | null }
    this.clients = { red: null, blue: null };

    // waiting | countdown | live | scorePause | gameOver
    this.phase = 'waiting';
    this.tickCount = 0;
    this._tickInterval = null;

    // Lane plan — set when both players are connected
    this.riverLanes = null;
    this.roadLanes  = null;

    // Game objects
    this.platforms = [];
    this.vehicles  = [];

    // bluePads at TOP_PADS  row → captured by red player
    // redPads  at BOTTOM_PADS row → captured by blue player
    this.pads = { blue: [], red: [] };

    // Roaming flies — freestanding entities (not lane-bound). Spawned fresh (3)
    // per match in _initGame; eaten flies are removed for good and, like pads,
    // are NOT restored across rounds within a match (_endScorePause ignores them).
    this.flies = [];

    this.players = {
      red:  this._makePlayer('red'),
      blue: this._makePlayer('blue'),
    };

    // Per-player input queues (filled by queueInput, drained each tick)
    this._inputQueues = { red: [], blue: [] };
    this._inputsOpen  = false;

    // Per-player tongue cooldown timestamps
    this._tongueCooldown = { red: 0, blue: 0 };

    // Countdown state
    this._countdownStep  = -1;
    this._nextCountdownAt = 0;

    // Live-phase timing
    this._goTime       = null;  // when GO fired (ms)
    this._scorePauseEnd = null; // when score pause ends (ms)

    // Reconnect-window state
    this._reconnectTimer         = null;  // forfeit setTimeout handle
    this._reconnectSecondsTimers = [];    // countdown setTimeout handles (5 → 1)
    this._pendingDisconnectedId  = null;  // player currently in reconnect window

    // Rematch ready-check state (gameOver phase only)
    this._readyStates = { red: false, blue: false };

    // Set true when the tick loop is paused because BOTH players dropped
    // mid-match (state preserved, not reset). When play resumes, both clients
    // were frozen and need a full resync — distinct from a single-drop rejoin,
    // where the survivor kept playing and must NOT be torn down.
    this._pausedMidMatch = false;

    // Set once this room has been permanently torn down (abandoned or swept
    // by the periodic empty-room cleanup). index.js removes it from its
    // roomId → room map at that point, but any sockets that haven't closed
    // yet still hold a direct reference to this object via closure, so its
    // methods must refuse to act instead of quietly resurrecting a "dead"
    // room (e.g. re-arming the grace countdown from removeClient()).
    this._destroyed = false;
  }

  // ── Player state factory ───────────────────────────────────────────────────

  _makePlayer(id) {
    return {
      id,
      col:   7,
      row:   id === 'red' ? ROW.BOTTOM_START : ROW.TOP_START,
      x:     centerX(7),
      y:     centerY(id === 'red' ? ROW.BOTTOM_START : ROW.TOP_START),
      state: PLAYER_STATES.ALIVE,
      score: 0,
      facing:       id === 'red' ? 'up' : 'down',
      lastMoveTime: 0,
      stunUntil:    0,
      respawnAt:    null,   // ms timestamp: when to leave RESPAWNING
      aliveAt:      null,   // ms timestamp: when to leave INVULNERABLE
      // Wall-clock (Date.now()) end of the fly-eat 2x speed buff. Deliberately
      // NOT cleared by _resetPlayer — the buff is a timer that survives respawn.
      speedBuffUntil: 0,
    };
  }

  _resetPlayer(player) {
    player.col    = 7;
    player.row    = player.id === 'red' ? ROW.BOTTOM_START : ROW.TOP_START;
    player.x      = centerX(7);
    player.y      = centerY(player.row);
    player.facing = player.id === 'red' ? 'up' : 'down';
    player.stunUntil = 0;
    player.respawnAt = null;
    player.aliveAt   = null;
  }

  // ── Pad management ─────────────────────────────────────────────────────────

  _resetPads() {
    this.pads.blue = TOP_PAD_COLS.map((col, i) => ({
      id: `bp${i}`, col, row: ROW.TOP_PADS, active: true,
    }));
    this.pads.red = BOTTOM_PAD_COLS.map((col, i) => ({
      id: `rp${i}`, col, row: ROW.BOTTOM_PADS, active: true,
    }));
  }

  // ── Fly management ───────────────────────────────────────────────────────────
  // Freestanding roaming collectibles. They move in continuous pixel space
  // (integrated each tick) and broadcast x/y — the client snaps, same model as
  // vehicles, so the small per-tick delta reads smooth without interpolation.
  // Confined to the inner grid region (off the outermost ring, and above the
  // HUD row); they bounce off those bounds.

  _flyBounds() {
    return {
      minX: TILE_SIZE,
      maxX: GAME_WIDTH - TILE_SIZE,
      minY: TILE_SIZE,
      maxY: (ROWS - 1) * TILE_SIZE,
    };
  }

  _randomFlyHeading() {
    const angle = Math.random() * Math.PI * 2;
    const speed = FLY.minSpeedPx + Math.random() * (FLY.maxSpeedPx - FLY.minSpeedPx);
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  }

  _randomTurnAt(now) {
    return now + FLY.turnIntervalMinMs +
      Math.random() * (FLY.turnIntervalMaxMs - FLY.turnIntervalMinMs);
  }

  _spawnFlies() {
    const now = Date.now();
    const b = this._flyBounds();
    // Start in the neutral safe band (rows SAFE_1..SAFE_2, the bush zone) so
    // neither side gets a head start — red spawns bottom, blue top, so a random
    // vertical draw would unfairly favor whoever the flies clustered nearer.
    // They roam the full board (b) freely once the match starts.
    const spawnMinY = ROW.SAFE_1 * TILE_SIZE;
    const spawnMaxY = (ROW.SAFE_2 + 1) * TILE_SIZE;
    const flies = [];
    for (let i = 0; i < FLY.count; i++) {
      const { vx, vy } = this._randomFlyHeading();
      flies.push({
        id: `fly${i}`,
        x: b.minX + Math.random() * (b.maxX - b.minX),
        y: spawnMinY + Math.random() * (spawnMaxY - spawnMinY),
        vx, vy,
        nextTurnAt: this._randomTurnAt(now),
      });
    }
    return flies;
  }

  _updateFlies(dt, now) {
    const b = this._flyBounds();
    for (const fly of this.flies) {
      if (now >= fly.nextTurnAt) {
        const h = this._randomFlyHeading();
        fly.vx = h.vx;
        fly.vy = h.vy;
        fly.nextTurnAt = this._randomTurnAt(now);
      }
      fly.x += fly.vx * dt;
      fly.y += fly.vy * dt;
      // Bounce off the inner-region edges (reflect the crossing component + clamp)
      if      (fly.x < b.minX) { fly.x = b.minX; fly.vx =  Math.abs(fly.vx); }
      else if (fly.x > b.maxX) { fly.x = b.maxX; fly.vx = -Math.abs(fly.vx); }
      if      (fly.y < b.minY) { fly.y = b.minY; fly.vy =  Math.abs(fly.vy); }
      else if (fly.y > b.maxY) { fly.y = b.maxY; fly.vy = -Math.abs(fly.vy); }
    }
  }

  // A tongue flick eats any fly along the attacker's facing ray. Independent of
  // _tryTongue's opponent-pull (fires even when no opponent is in range). Eating
  // ≥1 fly grants/refreshes the 2x speed buff.
  _tryEatFlies(attacker, now) {
    if (this.flies.length === 0) return;
    const dirX = attacker.facing === 'right' ? 1 : attacker.facing === 'left' ? -1 : 0;
    const dirY = attacker.facing === 'down'  ? 1 : attacker.facing === 'up'   ? -1 : 0;
    const reach = TONGUE_RANGE_TILES * TILE_SIZE;
    const halfW = FLY.tongueHitHalfWidthPx;

    const survivors = [];
    let ate = false;
    for (const fly of this.flies) {
      const relX = fly.x - attacker.x;
      const relY = fly.y - attacker.y;
      const along = relX * dirX + relY * dirY;            // distance along the ray
      const perp  = Math.abs(relX * dirY - relY * dirX);  // perpendicular offset
      if (along >= 0 && along <= reach && perp <= halfW) {
        ate = true;  // eaten — drop it for good
      } else {
        survivors.push(fly);
      }
    }
    if (ate) {
      this.flies = survivors;
      attacker.speedBuffUntil = now + FLY.buffDurationMs;
    }
  }

  _effectiveMoveCooldown(player, now) {
    return player.speedBuffUntil > now
      ? MOVE_COOLDOWN_MS * FLY.buffMoveCooldownFactor
      : MOVE_COOLDOWN_MS;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  _isSlotLive(id) {
    const client = this.clients[id];
    return Boolean(client) && client.readyState === 1 /* OPEN */;
  }

  addClient(ws, playerId) {
    // Player returned within the reconnect window — cancel the forfeit timer
    if (this._pendingDisconnectedId === playerId) {
      const survivorId = playerId === 'red' ? 'blue' : 'red';
      if (this.clients[survivorId]) {
        this._send(this.clients[survivorId], { type: 'opponentReturned', playerId });
      }
      this._cancelReconnectTimers();
    }

    this.clients[playerId] = ws;
    this._send(ws, { type: 'joined', playerId, roomId: this.roomId });

    // Use liveness, not just truthiness: the OTHER slot can still hold a
    // stale reference (its close hasn't been processed by index.js yet) at
    // the moment this connection arrives, which would otherwise look like
    // "both filled" and fire _initGame() prematurely against a dead socket.
    if (!this._isSlotLive('red') || !this._isSlotLive('blue')) {
      this._send(ws, { type: 'waiting' });
      return;
    }

    // Both slots filled. Resume the tick loop in case it was paused while the
    // room sat empty (e.g. both clients dropped briefly mid-match) — harmless
    // no-op otherwise since _startTick() is idempotent.
    this._startTick();

    // Start a fresh match: either this is the very first join (phase
    // 'waiting'), or both players reconnected after a rematch into the same
    // room object (phase 'gameOver', kept alive by the empty-room grace
    // window in server/index.js instead of being deleted and recreated).
    if (this.phase === 'waiting' || this.phase === 'gameOver') {
      this._pausedMidMatch = false;
      this._initGame();
      return;
    }

    // Mid-match rejoin (live / scorePause / countdown): the match is still
    // in progress, so DON'T reset it — resync the returning client into the
    // authoritative world instead. A returning client's own create() built a
    // locally-randomized lane plan that won't match the server's; resync
    // carries the current plan + a full snapshot so the client rebuilds the
    // correct world before the next _broadcastTick applies.
    if (this._pausedMidMatch) {
      // Both players had dropped: both clients were frozen, so both need a
      // full resync (the survivor-kept-playing assumption doesn't hold here).
      this._pausedMidMatch = false;
      this._sendResync(this.clients.red);
      this._sendResync(this.clients.blue);
    } else {
      // Single drop: only the returner was frozen; the survivor kept playing
      // and must not be torn down.
      this._sendResync(ws);
    }
  }

  /** Permanently stop this room once it's been removed from index.js's room
   *  map, so any already-connected socket that closes afterward can't
   *  resurrect it (see _destroyed comment in the constructor). */
  destroy() {
    this._destroyed = true;
    this._cancelReconnectTimers();
    this._stopTick();
    for (const id of ['red', 'blue']) {
      const ws = this.clients[id];
      if (ws && ws.readyState === 1 /* OPEN */) ws.close();
      this.clients[id] = null;
    }
  }

  removeClient(ws) {
    if (this._destroyed) return;

    let disconnectedId = null;
    for (const [id, client] of Object.entries(this.clients)) {
      if (client === ws) {
        this.clients[id] = null;
        disconnectedId = id;
        this.broadcast({ type: 'opponentLeft', playerId: id });
        break;
      }
    }

    if (!this.clients.red && !this.clients.blue) {
      this._cancelReconnectTimers();
      // Pause, don't destroy: game/player state is left intact so a
      // reconnect within server/index.js's empty-room grace window can
      // resume (or restart) cleanly via addClient().
      this._stopTick();
      // If the match was still in progress, flag that resuming it needs a
      // full resync of BOTH clients (both were frozen), so a rejoin doesn't
      // start a brand-new match.
      if (this.phase === 'live' || this.phase === 'scorePause' || this.phase === 'countdown') {
        this._pausedMidMatch = true;
      }
      return;
    }

    // One player still connected — start the 30-second reconnect window
    if (disconnectedId && this.phase !== 'gameOver') {
      this._startReconnectWindow(disconnectedId);
    } else if (disconnectedId && this.phase === 'gameOver') {
      // The other player left while sitting on the post-match screen with
      // no rematch in progress. There's no match to forfeit, so the 30s
      // reconnect window doesn't apply — instead arm the same grace/
      // countdown the restart path uses, so the remaining player isn't
      // left stuck on the win screen with no opponent and no resolution.
      this._onRequestContinueGrace?.();
    }
  }

  _startReconnectWindow(disconnectedId) {
    this._cancelReconnectTimers();
    this._pendingDisconnectedId = disconnectedId;

    const survivorId = disconnectedId === 'red' ? 'blue' : 'red';
    const WINDOW_MS = 30_000;

    // Send countdown ticks at 5, 4, 3, 2, 1 seconds remaining
    for (let sec = 5; sec >= 1; sec--) {
      const delay = WINDOW_MS - sec * 1000;
      const t = setTimeout(() => {
        if (this._pendingDisconnectedId !== disconnectedId) return;
        this._send(this.clients[survivorId], { type: 'reconnectCountdown', secondsLeft: sec });
      }, delay);
      this._reconnectSecondsTimers.push(t);
    }

    // Forfeit after 30 seconds
    this._reconnectTimer = setTimeout(() => {
      if (this._pendingDisconnectedId !== disconnectedId) return;
      this._pendingDisconnectedId = null;
      this._endGame(survivorId);
    }, WINDOW_MS);
  }

  _cancelReconnectTimers() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    for (const t of this._reconnectSecondsTimers) clearTimeout(t);
    this._reconnectSecondsTimers = [];
    this._pendingDisconnectedId = null;
  }

  /** Called by index.js when a client sends { type: 'input', ... } */
  queueInput(playerId, input) {
    if (!this._inputsOpen) return;
    const q = this._inputQueues[playerId];
    // Cap the queue: a human can't produce more than a handful of inputs
    // between 50ms ticks, so drop anything past 8 queued. This also closes the
    // unbounded-growth vector while _inputsOpen stays true after gameOver
    // (whose semantics are intentionally left unchanged here).
    if (q && q.length < 8) {
      q.push(input);
    }
  }

  // ── Game initialisation ────────────────────────────────────────────────────

  _initGame() {
    this._readyStates = { red: false, blue: false };
    const plan = createMatchLanePlan();
    this.riverLanes = plan.riverLanes;
    this.roadLanes  = plan.roadLanes;

    const { platforms, vehicles } = buildWorldObjects(this.riverLanes, this.roadLanes);
    this.platforms = platforms;
    this.vehicles  = vehicles;

    this._resetPads();
    // Fresh match → fresh set of flies. (Round resets deliberately leave them be.)
    this.flies = this._spawnFlies();

    for (const player of [this.players.red, this.players.blue]) {
      this._resetPlayer(player);
      player.score = 0;
      player.state = PLAYER_STATES.ALIVE;
      player.speedBuffUntil = 0;
    }

    this.broadcast({
      type: 'gameStart',
      lanePlan: { riverLanes: this.riverLanes, roadLanes: this.roadLanes },
    });

    this._startCountdown();
  }

  // ── Countdown ─────────────────────────────────────────────────────────────

  _startCountdown() {
    this._inputsOpen = false;
    // Drain any inputs queued during scorePause so they don't fire all at once on GO.
    this._inputQueues.red.length  = 0;
    this._inputQueues.blue.length = 0;
    this.phase = 'countdown';
    this._countdownStep   = 3;
    this._nextCountdownAt = Date.now() + COUNTDOWN_STEP_MS;
    this.broadcast({ type: 'countdown', value: 3 });
    this._startTick();
  }

  // ── Tick loop ──────────────────────────────────────────────────────────────

  _startTick() {
    if (this._tickInterval) return;
    this._tickInterval = setInterval(() => this._tick(), TICK_MS);
  }

  _stopTick() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }

  _tick() {
    const now = Date.now();
    this.tickCount++;
    const dt = TICK_MS / 1000;  // seconds

    if (this.phase === 'gameOver') {
      this._stopTick();
      return;
    }

    // Flies keep roaming through every active phase (countdown / scorePause / live).
    this._updateFlies(dt, now);

    if (this.phase === 'countdown') {
      this._tickCountdown(now, dt);
      this._broadcastTick(now);
      return;
    }

    if (this.phase === 'scorePause') {
      if (now >= this._scorePauseEnd) this._endScorePause(now);
      this._broadcastTick(now);
      return;
    }

    // ── live ──────────────────────────────────────────────────────────────

    this._updatePlayerStates(now);
    this._updateLanes(dt);
    this._processInputs(now);

    this._applyPlatformCarry(this.players.red,  dt, now);
    this._applyPlatformCarry(this.players.blue, dt, now);

    const hazardsEnabled = this._goTime !== null && (now - this._goTime) > GO_HAZARD_GRACE_MS;
    if (hazardsEnabled) {
      this._checkHazards(this.players.red,  now);
      this._checkHazards(this.players.blue, now);
    }

    this._checkScoring(now);
    this._broadcastTick(now);
  }

  // ── Countdown tick ─────────────────────────────────────────────────────────

  _tickCountdown(now, dt) {
    // Lanes move during countdown
    this._updateLanes(dt);

    if (now < this._nextCountdownAt) return;

    this._countdownStep--;

    if (this._countdownStep > 0) {
      this.broadcast({ type: 'countdown', value: this._countdownStep });
      this._nextCountdownAt = now + COUNTDOWN_STEP_MS;
    } else {
      this.broadcast({ type: 'countdown', value: 'GO' });
      this._inputsOpen = true;
      this.phase   = 'live';
      this._goTime = now;
    }
  }

  // ── Lane movement  (mirrors laneSystem.updatePlatformPosition) ─────────────

  _updateLanes(dt) {
    for (const obj of this.platforms) this._moveObj(obj, dt);
    for (const obj of this.vehicles)  this._moveObj(obj, dt);
  }

  _moveObj(obj, dt) {
    obj.x += obj.lane.dir * obj.lane.speed * dt;
    const half = obj.width / 2;
    if      (obj.x - half > GAME_WIDTH + WRAP_PADDING) obj.x = -WRAP_PADDING;
    else if (obj.x + half < -WRAP_PADDING)              obj.x = GAME_WIDTH + WRAP_PADDING;
  }

  // ── Player-state machine (dying → respawning → invulnerable → alive) ───────

  _updatePlayerStates(now) {
    for (const p of [this.players.red, this.players.blue]) {
      if (p.state === PLAYER_STATES.RESPAWNING && p.respawnAt && now >= p.respawnAt) {
        this._resetPlayer(p);
        p.state   = PLAYER_STATES.INVULNERABLE;
        p.aliveAt = now + RESPAWN_INVULN_MS;
      } else if (p.state === PLAYER_STATES.INVULNERABLE && p.aliveAt && now >= p.aliveAt) {
        p.state   = PLAYER_STATES.ALIVE;
        p.aliveAt = null;
      }
    }
  }

  // ── Input processing ───────────────────────────────────────────────────────

  _processInputs(now) {
    // Reset per-tick move flag; latched true below only on a successful input move.
    // Consumed client-side (opponent hop SFX) to distinguish real hops from platform carry.
    this.players.red.movedThisTick  = false;
    this.players.blue.movedThisTick = false;

    // Alternate drain order by tick parity so a same-tick contest isn't decided
    // by a fixed red-first order (P7/L-1). tickCount increments once per _tick,
    // before this runs, so _checkScoring below sees the same parity this tick.
    const order = this.tickCount % 2 ? ['red', 'blue'] : ['blue', 'red'];
    for (const id of order) {
      const queue  = this._inputQueues[id];
      const player = this.players[id];

      while (queue.length > 0) {
        const input = queue.shift();

        if (!isPlayerAlive(player)) continue;

        if (input.tongue && now >= this._tongueCooldown[id]) {
          this.broadcast({ type: 'tongueFired', attackerId: id, facing: player.facing });
          this._tryEatFlies(player, now);   // independent of the opponent-pull below
          this._tryTongue(player, now);
          this._tongueCooldown[id] = now + TONGUE_COOLDOWN_MS;
        }

        if (input.move) {
          if ((now - player.lastMoveTime) < this._effectiveMoveCooldown(player, now)) continue;
          if (now < player.stunUntil) continue;
          let dx = 0, dy = 0, facing = player.facing;
          if      (input.move === 'up')    { dy = -1; facing = 'up'; }
          else if (input.move === 'down')  { dy =  1; facing = 'down'; }
          else if (input.move === 'left')  { dx = -1; facing = 'left'; }
          else if (input.move === 'right') { dx =  1; facing = 'right'; }

          if (this._tryMove(player, dx, dy, facing)) {
            player.lastMoveTime = now;
            player.movedThisTick = true;
          }
        }
      }
    }
  }

  _tryMove(player, dx, dy, facing) {
    player.facing = facing;
    const newCol = clamp(player.col + dx, 0, COLS - 1);
    const newRow = clamp(player.row + dy, 0, ROW.BOTTOM_PADS);
    if (newCol === player.col && newRow === player.row) return false;
    player.col = newCol;
    player.row = newRow;
    player.x   = centerX(newCol);
    player.y   = centerY(newRow);
    return true;
  }

  // ── Tongue ability ─────────────────────────────────────────────────────────
  // Directional: fires in attacker.facing direction, up to TONGUE_RANGE_TILES.
  // Same-axis check only (must be in the line the attacker is facing).

  _tryTongue(attacker, now) {
    const defender = attacker.id === 'red' ? this.players.blue : this.players.red;
    if (!isPlayerAlive(defender)) return;

    const dc = defender.col - attacker.col;
    const dr = defender.row - attacker.row;
    let inRange = false;

    switch (attacker.facing) {
      case 'up':    inRange = dc === 0 && dr < 0 && -dr <= TONGUE_RANGE_TILES; break;
      case 'down':  inRange = dc === 0 && dr > 0 &&  dr <= TONGUE_RANGE_TILES; break;
      case 'left':  inRange = dr === 0 && dc < 0 && -dc <= TONGUE_RANGE_TILES; break;
      case 'right': inRange = dr === 0 && dc > 0 &&  dc <= TONGUE_RANGE_TILES; break;
    }

    if (!inRange) return;

    // Pull destination: one tile in the attacker's facing direction
    const dirX = attacker.facing === 'right' ? 1 : attacker.facing === 'left' ? -1 : 0;
    const dirY = attacker.facing === 'down'  ? 1 : attacker.facing === 'up'   ? -1 : 0;
    const pullCol = clamp(attacker.col + dirX, 0, COLS - 1);
    const pullRow = clamp(attacker.row + dirY, 0, ROW.BOTTOM_PADS);

    // Actual tile where the tongue connected (before the pull moves the defender).
    const hitCol = defender.col;
    const hitRow = defender.row;

    // Apply the pull server-side so future ticks reflect the new position
    if (defender.col !== pullCol || defender.row !== pullRow) {
      defender.col = pullCol;
      defender.row = pullRow;
      defender.x   = centerX(pullCol);
      defender.y   = centerY(pullRow);
    }

    defender.stunUntil = now + STUN_DURATION_MS;

    this.broadcast({
      type:           'tongueHit',
      attackerId:     attacker.id,
      targetId:       defender.id,
      pullCol,
      pullRow,
      hitCol,
      hitRow,
      attackerFacing: attacker.facing,
    });
  }

  // ── Platform support  (mirrors platformSupport.js) ─────────────────────────

  _supportHalfWidth() {
    return Math.max(1, PLAYER_BODY_RADIUS * SUPPORT_WIDTH_MULTIPLIER);
  }

  _findPlatformUnder(player) {
    if (!isPlayerAlive(player)) return null;
    if (!RIVER_ROWS.includes(player.row)) return null;

    const sw = this._supportHalfWidth();
    let best = null, bestOverlap = 0;

    for (const plat of this.platforms) {
      if (!plat.isMainPlatform) continue;
      if (plat.lane.row !== player.row) continue;

      // Vertical band check
      if (player.y <= plat.y - plat.height / 2) continue;
      if (player.y >= plat.y + plat.height / 2) continue;

      // Horizontal overlap
      const pLeft = player.x - sw;
      const pRight = player.x + sw;
      const platHW = plat.width / 2;
      const overlap = Math.max(
        0,
        Math.min(pRight, plat.x + platHW) - Math.max(pLeft, plat.x - platHW)
      );
      if (overlap < MINIMUM_OVERLAP_PX) continue;
      if (overlap <= bestOverlap) continue;

      best = plat;
      bestOverlap = overlap;
    }

    return best;
  }

  // ── Platform carry  (mirrors movement.applyPlatformCarry) ─────────────────

  _applyPlatformCarry(player, dt, now) {
    if (!isPlayerAlive(player)) return;
    if (!RIVER_ROWS.includes(player.row)) return;

    const plat = this._findPlatformUnder(player);
    if (!plat) return;

    player.x += plat.lane.dir * plat.lane.speed * dt;

    // Derive col from pixel x (mirrors movement.js)
    player.col = clamp(
      Math.round((player.x - TILE_SIZE / 2) / TILE_SIZE),
      0,
      COLS - 1
    );

    // Carried off-screen → water death (mirrors movement.isPlayerHalfOffscreenX)
    const triggerOffset = PLAYER_BODY_RADIUS * 0.5;
    if (player.x < triggerOffset || player.x > GAME_WIDTH - triggerOffset) {
      this._killPlayer(player, 'river', now);
    }
  }

  // ── Hazard detection  (mirrors collision.js) ───────────────────────────────

  _checkHazards(player, now) {
    if (!isPlayerHazardVulnerable(player)) return;

    if (ROAD_ROWS.includes(player.row)) {
      for (const v of this.vehicles) {
        if (v.lane.row !== player.row) continue;
        if (this._overlapsRect(player, v)) {
          this._killPlayer(player, 'traffic', now);
          return;
        }
      }
      return;
    }

    if (RIVER_ROWS.includes(player.row)) {
      if (this._findPlatformUnder(player)) return;

      // Fully off-screen → kill (mirrors collision.isPlayerFullyOffscreenX)
      const hw = PLAYER_BODY_RADIUS;
      if (player.x + hw < 0 || player.x - hw > GAME_WIDTH) {
        this._killPlayer(player, 'river', now);
        return;
      }

      // Not near horizontal edge → open water → kill
      // (mirrors collision.isPlayerNearHorizontalEdge — edge margin = 0.5 tiles)
      const edgeMargin = TILE_SIZE * 0.5;
      if (player.x > edgeMargin && player.x < GAME_WIDTH - edgeMargin) {
        this._killPlayer(player, 'river', now);
      }
    }
  }

  _overlapsRect(player, rect, widthFactor = 1) {
    const halfW = (rect.width * widthFactor) / 2;
    const halfH = rect.height / 2;
    return (
      player.x > rect.x - halfW &&
      player.x < rect.x + halfW &&
      player.y > rect.y - halfH &&
      player.y < rect.y + halfH
    );
  }

  _killPlayer(player, reason, now) {
    if (player.state !== PLAYER_STATES.ALIVE) return;  // only ALIVE is killable
    player.state     = PLAYER_STATES.RESPAWNING;        // skip visual DYING on server
    player.respawnAt = now + RESPAWN_DELAY_MS;
    this.broadcast({ type: 'playerDeath', playerId: player.id, reason });
  }

  // ── Scoring  (mirrors scoring.js) ─────────────────────────────────────────

  _checkScoring(now) {
    const red  = this.players.red;
    const blue = this.players.blue;
    if (!isPlayerAlive(red) || !isPlayerAlive(blue)) return;

    // Collect BOTH players' candidate captures before applying either, so a
    // same-tick contest isn't resolved by a fixed red-first order (P7/L-1).
    // redPad = a blue/top pad red is standing on; bluePad = a red/bottom pad
    // blue is standing on — disjoint pad sets, so no pad is double-captured.
    const redPad  = this.pads.blue.find(p => p.active && red.row === p.row && red.col === p.col) || null;
    const bluePad = this.pads.red.find(p => p.active && blue.row === p.row && blue.col === p.col) || null;
    if (!redPad && !bluePad) return;

    // Apply in tick-parity order — a deterministic alternating coin rather than a
    // structural red edge. If the first capture ends the match, the loser's
    // same-tick capture does not also register. (A true draw/overtime rule is a
    // deliberately deferred design decision; tick-parity is the interim adjudicator.)
    const pads  = { red: redPad, blue: bluePad };
    const order = this.tickCount % 2 ? ['red', 'blue'] : ['blue', 'red'];
    for (const id of order) {
      const pad = pads[id];
      if (!pad || !pad.active) continue;
      this._capturePad(id, pad, now);
      if (this.players[id].score >= WIN_SCORE) break;
    }
  }

  _capturePad(playerId, pad, now) {
    pad.active = false;
    this.players[playerId].score += 1;

    const scores = { red: this.players.red.score, blue: this.players.blue.score };
    this.broadcast({ type: 'score', playerId, scores });

    if (this.players[playerId].score >= WIN_SCORE) {
      this._endGame(playerId);
      return;
    }

    this.phase          = 'scorePause';
    this._scorePauseEnd = now + SCORE_PAUSE_MS;
  }

  _endScorePause(now) {
    for (const player of [this.players.red, this.players.blue]) {
      this._resetPlayer(player);
      player.state = PLAYER_STATES.ALIVE;
    }
    // Pads accumulate captured across rounds within a match — only _initGame resets them
    this.broadcast({ type: 'roundReset' });
    this._startCountdown();
  }

  _endGame(winnerId) {
    this._cancelReconnectTimers();
    this.phase = 'gameOver';
    this.broadcast({ type: 'gameOver', winnerId });
    this._stopTick();
    // Start the "Continue?" grace countdown the instant the match ends,
    // regardless of connection state — players get ~20s to rematch before
    // the room is abandoned, same as the disconnect-recovery case.
    this._onRequestContinueGrace?.();
  }

  /** Either player requesting restart while in gameOver → broadcast to both. */
  handleRestart() {
    if (this._destroyed || this.phase !== 'gameOver') return;
    this.broadcast({ type: 'restart' });
    // Both clients are about to disconnect+reconnect (scene.restart()). Clear
    // slot tracking now, synchronously, so a new connection that reaches the
    // server before the old socket's close has been processed never sees
    // "both slots full" (server/index.js races the async close handshake
    // against the new connection otherwise). The old sockets are left to
    // close naturally — removeClient() on their later close event will
    // no-op harmlessly since their slot is already null.
    this.clients = { red: null, blue: null };
    this._onRequestContinueGrace?.();
  }

  /** A player signals they are ready for a rematch. When both are ready, restart. */
  handleReady(playerId) {
    if (this._destroyed || this.phase !== 'gameOver') return;
    this._readyStates[playerId] = true;
    this.broadcast({ type: 'playerReady', playerId });
    if (this._readyStates.red && this._readyStates.blue) {
      this._readyStates = { red: false, blue: false };
      this.handleRestart();
    }
  }

  // ── Broadcasting ───────────────────────────────────────────────────────────

  _broadcastTick(now) {
    this.broadcast({
      type:      'tick',
      tick:      this.tickCount,
      phase:     this.phase,
      players: {
        red:  this._serializePlayer(this.players.red),
        blue: this._serializePlayer(this.players.blue),
      },
      // Send only x so clients can reconcile their visuals cheaply.
      // id is stable; clients look up their local platform/vehicle by id.
      platforms: this.platforms.map(p => ({ id: p.id, x: p.x })),
      vehicles:  this.vehicles.map(v => ({ id: v.id, x: v.x })),
      pads: {
        blue: this.pads.blue.map(p => ({ id: p.id, col: p.col, row: p.row, active: p.active })),
        red:  this.pads.red.map(p => ({ id: p.id, col: p.col, row: p.row, active: p.active })),
      },
      // Freestanding flies — id-keyed (count shrinks as they're eaten, unlike the
      // index-matched platforms/vehicles). A vanished id = eaten, on the client.
      flies: this.flies.map(f => ({ id: f.id, x: f.x, y: f.y })),
    });

    // movedThisTick is a per-tick signal: true only for the tick a move occurred.
    // Clear after every broadcast so it can't persist across ticks where
    // _processInputs doesn't run (e.g. scorePause), which would otherwise re-send
    // true for ~20 ticks and machine-gun the opponent's hop SFX.
    this.players.red.movedThisTick  = false;
    this.players.blue.movedThisTick = false;
  }

  _serializePlayer(p) {
    return {
      col: p.col, row: p.row, x: p.x, y: p.y,
      state: p.state, score: p.score, facing: p.facing,
      stunUntil: p.stunUntil,
      speedBuffUntil: p.speedBuffUntil,
      movedThisTick: !!p.movedThisTick,
    };
  }

  // Full-state resync for a client rejoining a match already in progress.
  // Carries the CURRENT lane plan (same shape as gameStart — road lanes embed
  // vehicleSkins/templateId/speed) plus a snapshot of both players, pad states,
  // the phase, and the phase-timing remainder, so the client rebuilds the
  // correct world and lands in the right gate state before the next tick.
  _sendResync(ws) {
    if (!ws) return;
    const now = Date.now();

    const timing = {};
    if (this.phase === 'live') {
      timing.goElapsedMs = this._goTime !== null ? now - this._goTime : 0;
    } else if (this.phase === 'scorePause') {
      timing.scorePauseRemainingMs = this._scorePauseEnd !== null
        ? Math.max(0, this._scorePauseEnd - now) : 0;
    } else if (this.phase === 'countdown') {
      timing.countdownStep = this._countdownStep;
      timing.countdownRemainingMs = Math.max(0, this._nextCountdownAt - now);
    }

    this._send(ws, {
      type:     'resync',
      playerId: ws === this.clients.red ? 'red' : 'blue',
      lanePlan: { riverLanes: this.riverLanes, roadLanes: this.roadLanes },
      phase:    this.phase,
      players: {
        red:  this._serializePlayer(this.players.red),
        blue: this._serializePlayer(this.players.blue),
      },
      pads: {
        blue: this.pads.blue.map(p => ({ id: p.id, col: p.col, row: p.row, active: p.active })),
        red:  this.pads.red.map(p => ({ id: p.id, col: p.col, row: p.row, active: p.active })),
      },
      // Current flies (however many survive) so a rejoiner sees the real state,
      // not a fresh 3. Client applies WITHOUT the eaten-vanish effect (see _syncFlies).
      flies: this.flies.map(f => ({ id: f.id, x: f.x, y: f.y })),
      timing,
    });
  }

  _send(ws, msg) {
    if (ws && ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(msg));
    }
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    if (this.clients.red  && this.clients.red.readyState  === 1) this.clients.red.send(data);
    if (this.clients.blue && this.clients.blue.readyState === 1) this.clients.blue.send(data);
  }
}

module.exports = { GameRoom };
