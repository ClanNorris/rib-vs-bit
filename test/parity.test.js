// test/parity.test.js — client/server constant parity guard.
//
// Game data is hand-copied in three places (server/constants.js,
// src/config/lanes.js, src/config/gameTuning.js). A missed mirror silently
// desyncs the authoritative server from the client's rendered world — the
// worst failure mode this architecture has. These assertions pin the copies
// together until the shared-data module (P5) makes this test redundant; when
// that lands, this file should be replaced/trivialized.
//
// SCOPING NOTE: the client's raw RIVER_LANE_DEFS/ROAD_LANE_DEFS are not
// exported, and materializeLane()'s output omits altType/altChance, so parity
// covers row/dir/type/length/speed + the spawn templates (read through the
// public createMatchLanePlan API) but not altType/altChance — those are
// server-only (vehicle skins are server-resolved) with no client consumer to
// desync against.
import { describe, it, expect } from 'vitest';
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

describe('client/server constant parity', () => {
  it('grid dimensions and the ROW map match', () => {
    expect(C_TILE).toBe(SRV.TILE_SIZE);
    expect(C_COLS).toBe(SRV.COLS);
    expect(C_ROWS).toBe(SRV.ROWS);
    expect(C_W).toBe(SRV.GAME_WIDTH);
    expect(C_H).toBe(SRV.GAME_HEIGHT);
    // toEqual works despite the server object being Object.freeze()'d.
    expect({ ...C_ROW }).toEqual({ ...SRV.ROW });
  });

  it('board row/column arrays match', () => {
    expect(GAME_TUNING.board.riverRows).toEqual(SRV.RIVER_ROWS);
    expect(GAME_TUNING.board.roadRows).toEqual(SRV.ROAD_ROWS);
    expect(GAME_TUNING.board.topPadCols).toEqual(SRV.TOP_PAD_COLS);
    expect(GAME_TUNING.board.bottomPadCols).toEqual(SRV.BOTTOM_PAD_COLS);
  });

  it('lane defs match (row/dir/type/length/speed + all spawn templates)', () => {
    const check = (clientLanes, serverDefs) => {
      expect(clientLanes).toHaveLength(serverDefs.length);
      clientLanes.forEach((lane, i) => {
        const def = serverDefs[i];
        expect(lane.row).toBe(def.row);
        expect(lane.dir).toBe(def.dir);
        expect(lane.type).toBe(def.type);
        expect(lane.length).toBe(def.length);
        // variance disabled → speed == baseSpeed == def.speed
        expect(lane.baseSpeed).toBe(def.speed);
        expect(lane.speed).toBe(def.speed);
      });
    };

    // row/dir/type/length/speed (template 0 is representative for these fields)
    const t0 = clientLanesForTemplate(0);
    check(t0.riverLanes, SRV.RIVER_LANE_DEFS);
    check(t0.roadLanes, SRV.ROAD_LANE_DEFS);

    // spawn templates: compare each of the 3 templates per lane
    for (let t = 0; t < 3; t++) {
      const plan = clientLanesForTemplate(t);
      plan.riverLanes.forEach((lane, i) => {
        expect(lane.spawns).toEqual(SRV.RIVER_LANE_DEFS[i].templates[t]);
      });
      plan.roadLanes.forEach((lane, i) => {
        expect(lane.spawns).toEqual(SRV.ROAD_LANE_DEFS[i].templates[t]);
      });
    }
  });

  it('speed-variance bounds match', () => {
    const v = GAME_TUNING.laneSpeedVariance;

    expect([v.river.defaultMinMultiplier, v.river.defaultMaxMultiplier])
      .toEqual([SRV.SPEED_VARIANCE.river.default.min, SRV.SPEED_VARIANCE.river.default.max]);

    expect([v.river.typeOverrides.turtle.minMultiplier, v.river.typeOverrides.turtle.maxMultiplier])
      .toEqual([SRV.SPEED_VARIANCE.river.turtle.min, SRV.SPEED_VARIANCE.river.turtle.max]);

    expect([v.road.defaultMinMultiplier, v.road.defaultMaxMultiplier])
      .toEqual([SRV.SPEED_VARIANCE.road.default.min, SRV.SPEED_VARIANCE.road.default.max]);

    // naming difference: server `road.row10` ↔ client `road.rowOverrides[10]`
    expect([v.road.rowOverrides[10].minMultiplier, v.road.rowOverrides[10].maxMultiplier])
      .toEqual([SRV.SPEED_VARIANCE.road.row10.min, SRV.SPEED_VARIANCE.road.row10.max]);

    expect([v.road.typeOverrides.truck.minMultiplier, v.road.typeOverrides.truck.maxMultiplier])
      .toEqual([SRV.SPEED_VARIANCE.road.truck.min, SRV.SPEED_VARIANCE.road.truck.max]);
  });

  it('shared timing/geometry constants match', () => {
    expect(GAME_TUNING.scoring.winScore).toBe(SRV.WIN_SCORE);
    expect(GAME_TUNING.player.moveCooldownMs).toBe(SRV.MOVE_COOLDOWN_MS);
    expect(GAME_TUNING.player.tongueCooldownMs).toBe(SRV.TONGUE_COOLDOWN_MS);
    expect(GAME_TUNING.abilities.tongueRangeTiles).toBe(SRV.TONGUE_RANGE_TILES);
    expect(GAME_TUNING.player.respawnInvulnMs).toBe(SRV.RESPAWN_INVULN_MS);
    expect(GAME_TUNING.round.goHazardGraceMs).toBe(SRV.GO_HAZARD_GRACE_MS);
    expect(GAME_TUNING.scoring.scorePauseMs).toBe(SRV.SCORE_PAUSE_MS);
    expect(GAME_TUNING.platformSupport.supportWidthMultiplier).toBe(SRV.SUPPORT_WIDTH_MULTIPLIER);
    expect(GAME_TUNING.platformSupport.minimumOverlapPx).toBe(SRV.MINIMUM_OVERLAP_PX);
  });
});
