// server/GameRoom.js — authoritative 20 tick/sec game simulation

'use strict';

const {
  TILE_SIZE, COLS, GAME_WIDTH,
  ROW, RIVER_ROWS, ROAD_ROWS, TOP_PAD_COLS, BOTTOM_PAD_COLS,
  WIN_SCORE, TICK_MS,
  MOVE_COOLDOWN_MS, TONGUE_COOLDOWN_MS, TONGUE_RANGE_TILES, STUN_DURATION_MS,
  RESPAWN_DELAY_MS, RESPAWN_INVULN_MS, GO_HAZARD_GRACE_MS,
  SCORE_PAUSE_MS, COUNTDOWN_STEP_MS,
  PLAYER_STATES,
  SUPPORT_WIDTH_MULTIPLIER, MINIMUM_OVERLAP_PX, PLAYER_BODY_RADIUS,
  WRAP_PADDING,
  RIVER_LANE_DEFS, ROAD_LANE_DEFS, SPEED_VARIANCE,
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
  if (def.row === 8)         return SPEED_VARIANCE.road.row8;
  if (def.type === 'truck')  return SPEED_VARIANCE.road.truck;
  return SPEED_VARIANCE.road.default;
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
           type: def.type, length: def.length, spawns, templateId };
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
      this._initGame();
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
    if (this._inputQueues[playerId]) {
      this._inputQueues[playerId].push(input);
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

    for (const player of [this.players.red, this.players.blue]) {
      this._resetPlayer(player);
      player.score = 0;
      player.state = PLAYER_STATES.ALIVE;
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

    for (const id of ['red', 'blue']) {
      const queue  = this._inputQueues[id];
      const player = this.players[id];

      while (queue.length > 0) {
        const input = queue.shift();

        if (!isPlayerAlive(player)) continue;

        if (input.tongue && now >= this._tongueCooldown[id]) {
          this.broadcast({ type: 'tongueFired', attackerId: id, facing: player.facing });
          this._tryTongue(player, now);
          this._tongueCooldown[id] = now + TONGUE_COOLDOWN_MS;
        }

        if (input.move) {
          if ((now - player.lastMoveTime) < MOVE_COOLDOWN_MS) continue;
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

    // Red captures blue pads (top row)
    for (const pad of this.pads.blue) {
      if (pad.active && red.row === pad.row && red.col === pad.col) {
        this._capturePad('red', pad, now);
        return;
      }
    }

    // Blue captures red pads (bottom row)
    for (const pad of this.pads.red) {
      if (pad.active && blue.row === pad.row && blue.col === pad.col) {
        this._capturePad('blue', pad, now);
        return;
      }
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
      movedThisTick: !!p.movedThisTick,
    };
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
