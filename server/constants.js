// server/constants.js — game data + server tuning.
//
// Grid, ROW map, lane defs, speed-variance bounds, and the shared timing/geometry
// constants are single-sourced from ./shared/gameData.json (see CLAUDE.md). This
// file re-exports them under their historical names/shapes so no consumer changes,
// and derives the server-only computed values (GAME_WIDTH, TICK_MS, etc.).
// The JSON lives INSIDE server/ so Railway's server-root deploy includes it.
const gameData = require('./shared/gameData.json');

const { tileSize: TILE_SIZE, cols: COLS, rows: ROWS } = gameData.grid;
const GAME_WIDTH = COLS * TILE_SIZE;   // 720
const GAME_HEIGHT = ROWS * TILE_SIZE;  // 720

const ROW = Object.freeze({ ...gameData.row });

const RIVER_ROWS = gameData.board.riverRows;
const ROAD_ROWS  = gameData.board.roadRows;

// Cols where lily pads live.
// bluePads (row=TOP_PADS)    are captured by the red  player.
// redPads  (row=BOTTOM_PADS) are captured by the blue player.
const TOP_PAD_COLS    = gameData.board.topPadCols;
const BOTTOM_PAD_COLS = gameData.board.bottomPadCols;

// Timing (winScore/cooldowns/etc. are shared; tickRate/stun/respawnDelay/
// countdownStep are server-only but co-located in the JSON so a fork tunes them
// in one place).
const {
  winScore:         WIN_SCORE,
  tickRate:         TICK_RATE,
  moveCooldownMs:   MOVE_COOLDOWN_MS,
  tongueCooldownMs: TONGUE_COOLDOWN_MS,
  tongueRangeTiles: TONGUE_RANGE_TILES,
  stunDurationMs:   STUN_DURATION_MS,
  respawnDelayMs:   RESPAWN_DELAY_MS,   // server-side: time in RESPAWNING before position reset
  respawnInvulnMs:  RESPAWN_INVULN_MS,
  goHazardGraceMs:  GO_HAZARD_GRACE_MS,
  scorePauseMs:     SCORE_PAUSE_MS,
  countdownStepMs:  COUNTDOWN_STEP_MS,
} = gameData.timing;
const TICK_MS = 1000 / TICK_RATE;   // 50 ms

const PLAYER_STATES = Object.freeze({
  ALIVE:        'alive',
  DYING:        'dying',
  RESPAWNING:   'respawning',
  INVULNERABLE: 'invulnerable',
});

// Platform-support geometry — mirrors gameTuning.platformSupport
const SUPPORT_WIDTH_MULTIPLIER = gameData.platformSupport.supportWidthMultiplier;
const MINIMUM_OVERLAP_PX       = gameData.platformSupport.minimumOverlapPx;
// Approximation: frogFactory draws body at radius = tileSize * 0.28
const PLAYER_BODY_RADIUS = TILE_SIZE * 0.28;   // ~13.44 px

// Lane wrap padding (matches laneSystem: scene.tileSize * 2.5)
const WRAP_PADDING = TILE_SIZE * 2.5;  // 120 px

// ─────────────────────────────────────────────────────────────────────────────
// Lane definitions — single-sourced from shared/gameData.json
// ─────────────────────────────────────────────────────────────────────────────

const RIVER_LANE_DEFS = gameData.riverLaneDefs;
const ROAD_LANE_DEFS  = gameData.roadLaneDefs;

// Speed-variance bounds — derived from the shared laneSpeedVariance (client shape)
// into the flat {min,max} shape chooseBounds() reads in GameRoom.js.
const _sv = gameData.laneSpeedVariance;
const SPEED_VARIANCE = {
  river: {
    default: { min: _sv.river.defaultMinMultiplier, max: _sv.river.defaultMaxMultiplier },
    turtle:  { min: _sv.river.typeOverrides.turtle.minMultiplier, max: _sv.river.typeOverrides.turtle.maxMultiplier },
  },
  road: {
    default: { min: _sv.road.defaultMinMultiplier, max: _sv.road.defaultMaxMultiplier },
    row10:   { min: _sv.road.rowOverrides['10'].minMultiplier, max: _sv.road.rowOverrides['10'].maxMultiplier },
    truck:   { min: _sv.road.typeOverrides.truck.minMultiplier, max: _sv.road.typeOverrides.truck.maxMultiplier },
  },
};

module.exports = {
  TILE_SIZE,
  COLS,
  ROWS,
  GAME_WIDTH,
  GAME_HEIGHT,
  ROW,
  RIVER_ROWS,
  ROAD_ROWS,
  TOP_PAD_COLS,
  BOTTOM_PAD_COLS,
  WIN_SCORE,
  TICK_RATE,
  TICK_MS,
  MOVE_COOLDOWN_MS,
  TONGUE_COOLDOWN_MS,
  TONGUE_RANGE_TILES,
  STUN_DURATION_MS,
  RESPAWN_DELAY_MS,
  RESPAWN_INVULN_MS,
  GO_HAZARD_GRACE_MS,
  SCORE_PAUSE_MS,
  COUNTDOWN_STEP_MS,
  PLAYER_STATES,
  SUPPORT_WIDTH_MULTIPLIER,
  MINIMUM_OVERLAP_PX,
  PLAYER_BODY_RADIUS,
  WRAP_PADDING,
  RIVER_LANE_DEFS,
  ROAD_LANE_DEFS,
  SPEED_VARIANCE,
};
