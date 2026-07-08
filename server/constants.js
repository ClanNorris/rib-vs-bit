// server/constants.js — shared values mirroring src/config/constants.js + gameTuning.js

const TILE_SIZE = 48;
const COLS = 15;
const ROWS = 15;
const GAME_WIDTH = COLS * TILE_SIZE;   // 720
const GAME_HEIGHT = ROWS * TILE_SIZE;  // 720

const ROW = Object.freeze({
  TOP_PADS: 0,
  TOP_START: 1,
  RIVER_1: 2,
  RIVER_2: 3,
  RIVER_3: 4,
  RIVER_4: 5,
  SAFE_1: 6,
  SAFE_2: 7,
  SAFE: 6,
  ROAD_1: 8,
  ROAD_2: 9,
  ROAD_3: 10,
  ROAD_4: 11,
  BOTTOM_START: 12,
  BOTTOM_PADS: 13,
  HUD: 14,
});

const RIVER_ROWS = [2, 3, 4, 5];
const ROAD_ROWS  = [8, 9, 10, 11];

// Cols where lily pads live.
// bluePads (row=TOP_PADS)    are captured by the red  player.
// redPads  (row=BOTTOM_PADS) are captured by the blue player.
const TOP_PAD_COLS    = [3, 7, 11];
const BOTTOM_PAD_COLS = [3, 7, 11];

// Timing
const WIN_SCORE           = 3;
const TICK_RATE           = 20;
const TICK_MS             = 1000 / TICK_RATE;   // 50 ms
const MOVE_COOLDOWN_MS    = 150;
const TONGUE_COOLDOWN_MS  = 700;
const TONGUE_RANGE_TILES  = 3;
const STUN_DURATION_MS    = 1000;
const RESPAWN_DELAY_MS    = 400;   // server-side: time in RESPAWNING before position reset
const RESPAWN_INVULN_MS   = 350;
const GO_HAZARD_GRACE_MS  = 120;
const SCORE_PAUSE_MS      = 1000;
const COUNTDOWN_STEP_MS   = 800;

const PLAYER_STATES = Object.freeze({
  ALIVE:        'alive',
  DYING:        'dying',
  RESPAWNING:   'respawning',
  INVULNERABLE: 'invulnerable',
});

// Platform-support geometry — mirrors gameTuning.platformSupport
const SUPPORT_WIDTH_MULTIPLIER = 0.58;
const MINIMUM_OVERLAP_PX       = 10;
// Approximation: frogFactory draws body at radius = tileSize * 0.28
const PLAYER_BODY_RADIUS = TILE_SIZE * 0.28;   // ~13.44 px

// Lane wrap padding (matches laneSystem: scene.tileSize * 2.5)
const WRAP_PADDING = TILE_SIZE * 2.5;  // 120 px

// ─────────────────────────────────────────────────────────────────────────────
// Lane definitions — mirrors src/config/lanes.js
// ─────────────────────────────────────────────────────────────────────────────

const RIVER_LANE_DEFS = [
  {
    row: 2, dir: 1, speed: 70, type: 'turtle', length: 3,
    templates: [[1, 6, 11], [0, 5, 10], [2, 7, 12]],
  },
  {
    row: 3, dir: -1, speed: 48, type: 'log', length: 4,
    templates: [[0, 7, 12], [1, 6, 11], [2, 8, 13]],
  },
  {
    row: 4, dir: 1, speed: 95, type: 'logCircle', length: 2,
    templates: [[1, 5, 10, 13], [0, 4, 9, 12], [2, 6, 11, 14]],
  },
  {
    row: 5, dir: -1, speed: 70, type: 'turtle', length: 2,
    templates: [[1, 6, 11], [0, 5, 10], [2, 7, 12]],
  },
];

const ROAD_LANE_DEFS = [
  {
    row: 8, dir: -1, speed: 120, type: 'car',   length: 1.2,
    templates: [[1, 5, 10, 13], [0, 4, 9, 12], [2, 6, 11, 14]],
  },
  {
    row: 9, dir: 1,  speed: 140, type: 'truck', length: 1.8,
    templates: [[0, 4, 9, 12], [1, 5, 10, 13], [2, 6, 11, 14]],
  },
  {
    row: 10, dir: -1, speed: 160, type: 'car',   length: 1.2,
    templates: [[2, 7, 11, 14], [1, 6, 10, 13], [0, 5, 9, 12]],
  },
  {
    row: 11, dir: 1,  speed: 100, type: 'truck', length: 1.8,
    templates: [[1, 6, 10, 13], [0, 5, 9, 12], [2, 7, 11, 14]],
  },
];

// Speed-variance bounds — mirrors gameTuning.laneSpeedVariance
const SPEED_VARIANCE = {
  river: {
    default: { min: 0.96, max: 1.04 },
    turtle:  { min: 0.97, max: 1.04 },
  },
  road: {
    default: { min: 0.94, max: 1.06 },
    row10:   { min: 0.95, max: 1.05 },  // rowOverrides[10] — was row8, moved with renumbering
    truck:   { min: 0.95, max: 1.06 },
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
