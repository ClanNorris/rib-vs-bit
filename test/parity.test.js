// test/parity.test.js — shared-data single-source guard.
//
// Game data (grid, ROW map, lane defs, speed-variance bounds, shared timing/
// geometry) now lives in ONE place: server/shared/gameData.json. The server
// (server/constants.js, CommonJS require) and the client (src/config/*.js, Vite
// JSON import) both re-export from it under their historical names/shapes.
//
// Before P5 this file pinned three hand-copied definitions together. Now it
// proves both sides resolve to the shared JSON, and guards against anyone
// re-introducing a local literal copy (the desync trap the shared module closes).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import gameData from '../server/shared/gameData.json';
import * as SRV from '../server/constants.js';
import {
  TILE_SIZE as C_TILE, COLS as C_COLS, ROWS as C_ROWS,
  GAME_WIDTH as C_W, GAME_HEIGHT as C_H, ROW as C_ROW,
} from '../src/config/constants.js';
import { GAME_TUNING } from '../src/config/gameTuning.js';
import { createMatchLanePlan } from '../src/config/lanes.js';

/**
 * Read the client's lane definitions back through its public API. With
 * speed variance off, `speed` collapses to the base speed; picking a constant
 * random of (t + 0.5)/3 forces spawn-template index t (there are 3 templates
 * per lane), letting us compare each template array.
 */
function clientLanesForTemplate(t) {
  return createMatchLanePlan({
    random: () => (t + 0.5) / 3,
    randomizationEnabled: true,
    speedVarianceEnabled: false,
  });
}

describe('shared game data — server side derives from gameData.json', () => {
  it('grid, ROW map, and board arrays', () => {
    expect(SRV.TILE_SIZE).toBe(gameData.grid.tileSize);
    expect(SRV.COLS).toBe(gameData.grid.cols);
    expect(SRV.ROWS).toBe(gameData.grid.rows);
    expect(SRV.GAME_WIDTH).toBe(gameData.grid.cols * gameData.grid.tileSize);
    expect(SRV.GAME_HEIGHT).toBe(gameData.grid.rows * gameData.grid.tileSize);
    expect({ ...SRV.ROW }).toEqual(gameData.row);
    expect(SRV.RIVER_ROWS).toEqual(gameData.board.riverRows);
    expect(SRV.ROAD_ROWS).toEqual(gameData.board.roadRows);
    expect(SRV.TOP_PAD_COLS).toEqual(gameData.board.topPadCols);
    expect(SRV.BOTTOM_PAD_COLS).toEqual(gameData.board.bottomPadCols);
  });

  it('lane defs (verbatim, incl. altType/altChance)', () => {
    expect(SRV.RIVER_LANE_DEFS).toEqual(gameData.riverLaneDefs);
    expect(SRV.ROAD_LANE_DEFS).toEqual(gameData.roadLaneDefs);
  });

  it('speed-variance bounds resolve to the shared laneSpeedVariance', () => {
    const v = gameData.laneSpeedVariance;
    expect(SRV.SPEED_VARIANCE.river.default)
      .toEqual({ min: v.river.defaultMinMultiplier, max: v.river.defaultMaxMultiplier });
    expect(SRV.SPEED_VARIANCE.river.turtle)
      .toEqual({ min: v.river.typeOverrides.turtle.minMultiplier, max: v.river.typeOverrides.turtle.maxMultiplier });
    expect(SRV.SPEED_VARIANCE.road.default)
      .toEqual({ min: v.road.defaultMinMultiplier, max: v.road.defaultMaxMultiplier });
    expect(SRV.SPEED_VARIANCE.road.row10)
      .toEqual({ min: v.road.rowOverrides['10'].minMultiplier, max: v.road.rowOverrides['10'].maxMultiplier });
    expect(SRV.SPEED_VARIANCE.road.truck)
      .toEqual({ min: v.road.typeOverrides.truck.minMultiplier, max: v.road.typeOverrides.truck.maxMultiplier });
  });

  it('shared timing/geometry constants', () => {
    expect(SRV.WIN_SCORE).toBe(gameData.timing.winScore);
    expect(SRV.TICK_RATE).toBe(gameData.timing.tickRate);
    expect(SRV.TICK_MS).toBe(1000 / gameData.timing.tickRate);
    expect(SRV.MOVE_COOLDOWN_MS).toBe(gameData.timing.moveCooldownMs);
    expect(SRV.TONGUE_COOLDOWN_MS).toBe(gameData.timing.tongueCooldownMs);
    expect(SRV.TONGUE_RANGE_TILES).toBe(gameData.timing.tongueRangeTiles);
    expect(SRV.STUN_DURATION_MS).toBe(gameData.timing.stunDurationMs);
    expect(SRV.RESPAWN_DELAY_MS).toBe(gameData.timing.respawnDelayMs);
    expect(SRV.RESPAWN_INVULN_MS).toBe(gameData.timing.respawnInvulnMs);
    expect(SRV.GO_HAZARD_GRACE_MS).toBe(gameData.timing.goHazardGraceMs);
    expect(SRV.SCORE_PAUSE_MS).toBe(gameData.timing.scorePauseMs);
    expect(SRV.COUNTDOWN_STEP_MS).toBe(gameData.timing.countdownStepMs);
    expect(SRV.SUPPORT_WIDTH_MULTIPLIER).toBe(gameData.platformSupport.supportWidthMultiplier);
    expect(SRV.MINIMUM_OVERLAP_PX).toBe(gameData.platformSupport.minimumOverlapPx);
  });
});

describe('shared game data — client side derives from gameData.json', () => {
  it('grid dimensions and ROW map', () => {
    expect(C_TILE).toBe(gameData.grid.tileSize);
    expect(C_COLS).toBe(gameData.grid.cols);
    expect(C_ROWS).toBe(gameData.grid.rows);
    expect(C_W).toBe(gameData.grid.cols * gameData.grid.tileSize);
    expect(C_H).toBe(gameData.grid.rows * gameData.grid.tileSize);
    expect({ ...C_ROW }).toEqual(gameData.row);
  });

  it('board arrays, speed variance, and shared timing', () => {
    expect(GAME_TUNING.board).toEqual(gameData.board);
    expect(GAME_TUNING.laneSpeedVariance).toEqual(gameData.laneSpeedVariance);
    expect(GAME_TUNING.scoring.winScore).toBe(gameData.timing.winScore);
    expect(GAME_TUNING.scoring.scorePauseMs).toBe(gameData.timing.scorePauseMs);
    expect(GAME_TUNING.player.moveCooldownMs).toBe(gameData.timing.moveCooldownMs);
    expect(GAME_TUNING.player.tongueCooldownMs).toBe(gameData.timing.tongueCooldownMs);
    expect(GAME_TUNING.player.respawnInvulnMs).toBe(gameData.timing.respawnInvulnMs);
    expect(GAME_TUNING.round.goHazardGraceMs).toBe(gameData.timing.goHazardGraceMs);
    expect(GAME_TUNING.abilities.tongueRangeTiles).toBe(gameData.timing.tongueRangeTiles);
    expect(GAME_TUNING.platformSupport.supportWidthMultiplier).toBe(gameData.platformSupport.supportWidthMultiplier);
    expect(GAME_TUNING.platformSupport.minimumOverlapPx).toBe(gameData.platformSupport.minimumOverlapPx);
  });

  it('lane defs, read back through createMatchLanePlan, match the shared defs', () => {
    // row/dir/type/length/speed (variance off → speed == baseSpeed == def.speed)
    const t0 = clientLanesForTemplate(0);
    const check = (clientLanes, defs) => {
      expect(clientLanes).toHaveLength(defs.length);
      clientLanes.forEach((lane, i) => {
        expect(lane.row).toBe(defs[i].row);
        expect(lane.dir).toBe(defs[i].dir);
        expect(lane.type).toBe(defs[i].type);
        expect(lane.length).toBe(defs[i].length);
        expect(lane.baseSpeed).toBe(defs[i].speed);
        expect(lane.speed).toBe(defs[i].speed);
      });
    };
    check(t0.riverLanes, gameData.riverLaneDefs);
    check(t0.roadLanes, gameData.roadLaneDefs);

    // spawn templates: compare each of the 3 templates per lane
    for (let t = 0; t < 3; t++) {
      const plan = clientLanesForTemplate(t);
      plan.riverLanes.forEach((lane, i) => {
        expect(lane.spawns).toEqual(gameData.riverLaneDefs[i].templates[t]);
      });
      plan.roadLanes.forEach((lane, i) => {
        expect(lane.spawns).toEqual(gameData.roadLaneDefs[i].templates[t]);
      });
    }
  });
});

describe('single-source guard — no re-inlined literal copies', () => {
  // If someone drops the shared import and pastes lane defs / tuning back into a
  // config file, the desync trap reopens silently. Assert every config file still
  // sources gameData.json.
  const CONFIG_FILES = [
    '../server/constants.js',
    '../src/config/constants.js',
    '../src/config/lanes.js',
    '../src/config/gameTuning.js',
  ];

  it.each(CONFIG_FILES)('%s references shared/gameData.json', (rel) => {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    expect(src).toMatch(/shared\/gameData\.json/);
  });
});
