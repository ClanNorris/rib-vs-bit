// test/gameRoom.tick.test.js — GameRoom tick-pipeline unit tests.
//
// Pure logic on plain objects: input processing, movement, tongue, hazards,
// scoring. Sub-methods are driven directly with deterministic positions and a
// faked clock so nothing depends on Math.random lane spawns or the real tick
// interval. See test/helpers.js for the stub socket.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameRoom } from '../server/GameRoom.js';
import {
  ROW, COLS, TILE_SIZE,
  MOVE_COOLDOWN_MS, TONGUE_COOLDOWN_MS, STUN_DURATION_MS,
  PLAYER_STATES, WIN_SCORE,
} from '../server/constants.js';
import { makeSocket } from './helpers.js';

const T0 = 1_000_000; // arbitrary fixed epoch for the faked clock

function centerX(col) { return col * TILE_SIZE + TILE_SIZE / 2; }
function centerY(row) { return row * TILE_SIZE + TILE_SIZE / 2; }

/**
 * A room parked in the `live` phase with both slots connected, ready for
 * direct sub-method calls. Bypasses the countdown so tests are deterministic.
 */
function liveRoom() {
  const red = makeSocket();
  const blue = makeSocket();
  const room = new GameRoom('tick', { onRequestContinueGrace: () => {} });
  room.clients.red = red;
  room.clients.blue = blue;
  room.phase = 'live';
  room._inputsOpen = true;
  room._goTime = Date.now() - 10_000; // grace long past
  return { room, red, blue };
}

describe('GameRoom tick pipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── _processInputs ─────────────────────────────────────────────────────────

  describe('_processInputs', () => {
    it('drains queued inputs in FIFO order', () => {
      const { room } = liveRoom();
      const red = room.players.red;
      red.col = 7; red.row = ROW.BOTTOM_START;
      red.x = centerX(7); red.y = centerY(ROW.BOTTOM_START);
      // Two moves queued the same tick; cooldown is bypassed because the clock
      // does not advance between them — so only the FIRST should apply, proving
      // ordered draining + the per-move cooldown gate together.
      room._inputQueues.red.push({ move: 'left' }, { move: 'up' });

      room._processInputs(Date.now());

      // 'left' applied first (col 7→6); 'up' rejected by cooldown (same ms).
      expect(red.col).toBe(6);
      expect(red.row).toBe(ROW.BOTTOM_START);
      expect(red.facing).toBe('left');
    });

    it('discards inputs while _inputsOpen is false', () => {
      const { room } = liveRoom();
      room._inputsOpen = false;
      room.queueInput('red', { move: 'left' });
      expect(room._inputQueues.red).toHaveLength(0);
    });

    it('sets movedThisTick on a successful move and self-clears after _broadcastTick', () => {
      const { room } = liveRoom();
      const red = room.players.red;
      red.col = 7; red.row = ROW.BOTTOM_START;
      red.x = centerX(7); red.y = centerY(ROW.BOTTOM_START);
      room._inputQueues.red.push({ move: 'left' });

      room._processInputs(Date.now());
      expect(red.movedThisTick).toBe(true);

      // Documented past regression: the flag must not persist across ticks.
      room._broadcastTick(Date.now());
      expect(red.movedThisTick).toBe(false);
    });
  });

  // ── _tryMove ───────────────────────────────────────────────────────────────

  describe('_tryMove', () => {
    it('clamps at the board edge and reports no move', () => {
      const { room } = liveRoom();
      const red = room.players.red;
      red.col = COLS - 1; red.row = ROW.BOTTOM_START;
      const moved = room._tryMove(red, +1, 0, 'right');
      expect(moved).toBe(false);
      expect(red.col).toBe(COLS - 1);
    });

    it('rejects a second move inside the move cooldown', () => {
      const { room } = liveRoom();
      const red = room.players.red;
      red.col = 7; red.row = ROW.BOTTOM_START;
      red.x = centerX(7); red.y = centerY(ROW.BOTTOM_START);

      room._inputQueues.red.push({ move: 'left' });
      room._processInputs(Date.now());
      expect(red.col).toBe(6);

      // Advance less than the cooldown → second move rejected.
      vi.setSystemTime(T0 + MOVE_COOLDOWN_MS - 1);
      room._inputQueues.red.push({ move: 'left' });
      room._processInputs(Date.now());
      expect(red.col).toBe(6);

      // Advance past the cooldown → move accepted.
      vi.setSystemTime(T0 + MOVE_COOLDOWN_MS + 1);
      room._inputQueues.red.push({ move: 'left' });
      room._processInputs(Date.now());
      expect(red.col).toBe(5);
    });

    it('rejects a move while stunned (now < stunUntil)', () => {
      const { room } = liveRoom();
      const red = room.players.red;
      red.col = 7; red.row = ROW.BOTTOM_START;
      red.x = centerX(7); red.y = centerY(ROW.BOTTOM_START);
      red.stunUntil = Date.now() + STUN_DURATION_MS;

      room._inputQueues.red.push({ move: 'left' });
      room._processInputs(Date.now());
      expect(red.col).toBe(7); // unmoved

      // After the stun expires, the move goes through.
      vi.setSystemTime(T0 + STUN_DURATION_MS + 1);
      room._inputQueues.red.push({ move: 'left' });
      room._processInputs(Date.now());
      expect(red.col).toBe(6);
    });
  });

  // ── _tryTongue ─────────────────────────────────────────────────────────────

  describe('_tryTongue', () => {
    it('hits an in-range defender, pulls it exactly 1 tile toward the attacker, and broadcasts', () => {
      const { room, red } = liveRoom();
      const attacker = room.players.red;
      const defender = room.players.blue;
      // Attacker facing up at row 10 col 7; defender 2 tiles up at row 8.
      attacker.col = 7; attacker.row = 10; attacker.facing = 'up';
      attacker.x = centerX(7); attacker.y = centerY(10);
      defender.col = 7; defender.row = 8;
      defender.x = centerX(7); defender.y = centerY(8);

      room._tryTongue(attacker, Date.now());

      // Pull destination is one tile up from the attacker → row 9.
      expect(defender.col).toBe(7);
      expect(defender.row).toBe(9);
      expect(defender.stunUntil).toBe(Date.now() + STUN_DURATION_MS);

      const hit = red.lastOfType('tongueHit');
      expect(hit).toBeTruthy();
      expect(hit.attackerId).toBe('red');
      expect(hit.targetId).toBe('blue');
      expect(hit.pullCol).toBe(7);
      expect(hit.pullRow).toBe(9);
    });

    it('captures hitCol/hitRow from the defender PRE-pull position', () => {
      const { room, red } = liveRoom();
      const attacker = room.players.red;
      const defender = room.players.blue;
      attacker.col = 7; attacker.row = 10; attacker.facing = 'up';
      attacker.x = centerX(7); attacker.y = centerY(10);
      defender.col = 7; defender.row = 8; // snag tile is row 8
      defender.x = centerX(7); defender.y = centerY(8);

      room._tryTongue(attacker, Date.now());

      const hit = red.lastOfType('tongueHit');
      // hit* = where the tongue connected (row 8), distinct from pull* (row 9).
      expect(hit.hitCol).toBe(7);
      expect(hit.hitRow).toBe(8);
      expect(hit.pullRow).toBe(9);
    });

    it('does not hit a defender out of range / off-axis', () => {
      const { room, red } = liveRoom();
      const attacker = room.players.red;
      const defender = room.players.blue;
      attacker.col = 7; attacker.row = 10; attacker.facing = 'up';
      // Off-axis: different column.
      defender.col = 9; defender.row = 8;
      defender.x = centerX(9); defender.y = centerY(8);

      room._tryTongue(attacker, Date.now());

      expect(red.ofType('tongueHit')).toHaveLength(0);
      expect(defender.col).toBe(9); // unmoved
    });

    it('enforces the tongue cooldown through _processInputs', () => {
      const { room, red } = liveRoom();
      const attacker = room.players.red;
      const defender = room.players.blue;
      attacker.col = 7; attacker.row = 10; attacker.facing = 'up';
      attacker.x = centerX(7); attacker.y = centerY(10);
      const placeDefender = () => {
        defender.col = 7; defender.row = 8;
        defender.x = centerX(7); defender.y = centerY(8);
        defender.state = PLAYER_STATES.ALIVE;
        defender.stunUntil = 0;
      };

      placeDefender();
      room._inputQueues.red.push({ tongue: true });
      room._processInputs(Date.now());
      expect(red.ofType('tongueHit')).toHaveLength(1);

      // Second tongue within cooldown → ignored (no new hit).
      vi.setSystemTime(T0 + TONGUE_COOLDOWN_MS - 1);
      placeDefender();
      room._inputQueues.red.push({ tongue: true });
      room._processInputs(Date.now());
      expect(red.ofType('tongueHit')).toHaveLength(1);

      // After cooldown → fires again.
      vi.setSystemTime(T0 + TONGUE_COOLDOWN_MS + 1);
      placeDefender();
      room._inputQueues.red.push({ tongue: true });
      room._processInputs(Date.now());
      expect(red.ofType('tongueHit')).toHaveLength(2);
    });
  });

  // ── _checkHazards ────────────────────────────────────────────────────────────

  describe('_checkHazards', () => {
    it('kills on road when overlapping a vehicle in the same lane', () => {
      const { room, red } = liveRoom();
      const p = room.players.red;
      p.state = PLAYER_STATES.ALIVE;
      p.row = ROW.ROAD_1; p.col = 7;
      p.x = centerX(7); p.y = centerY(ROW.ROAD_1);
      room.vehicles = [{
        id: 'v0', lane: { row: ROW.ROAD_1 },
        x: centerX(7), y: centerY(ROW.ROAD_1),
        width: TILE_SIZE, height: TILE_SIZE,
      }];

      room._checkHazards(p, Date.now());

      expect(p.state).toBe(PLAYER_STATES.RESPAWNING);
      const death = red.lastOfType('playerDeath');
      expect(death).toBeTruthy();
      expect(death.reason).toBe('traffic');
    });

    it('kills on river with no supporting platform underneath', () => {
      const { room, red } = liveRoom();
      const p = room.players.red;
      p.state = PLAYER_STATES.ALIVE;
      p.row = ROW.RIVER_1; p.col = 7;
      p.x = centerX(7); p.y = centerY(ROW.RIVER_1);
      room.platforms = []; // open water

      room._checkHazards(p, Date.now());

      expect(p.state).toBe(PLAYER_STATES.RESPAWNING);
      expect(red.lastOfType('playerDeath').reason).toBe('river');
    });

    it('survives on river when standing on a supporting platform', () => {
      const { room, red } = liveRoom();
      const p = room.players.red;
      p.state = PLAYER_STATES.ALIVE;
      p.row = ROW.RIVER_1; p.col = 7;
      p.x = centerX(7); p.y = centerY(ROW.RIVER_1);
      room.platforms = [{
        id: 'r0', isMainPlatform: true,
        lane: { row: ROW.RIVER_1, dir: 1, speed: 50, type: 'log', length: 3 },
        x: centerX(7), y: centerY(ROW.RIVER_1),
        width: 3 * TILE_SIZE, height: TILE_SIZE,
      }];

      room._checkHazards(p, Date.now());

      expect(p.state).toBe(PLAYER_STATES.ALIVE);
      expect(red.ofType('playerDeath')).toHaveLength(0);
    });
  });

  // ── _checkScoring / _capturePad / _endGame ───────────────────────────────────

  describe('scoring', () => {
    it('capturing a pad increments score, hides the pad, and enters scorePause', () => {
      const { room, red } = liveRoom();
      room._resetPads();
      const p = room.players.red;
      const pad = room.pads.blue[0];
      p.state = PLAYER_STATES.ALIVE;
      p.row = pad.row; p.col = pad.col;

      room._checkScoring(Date.now());

      expect(p.score).toBe(1);
      expect(pad.active).toBe(false);
      expect(room.phase).toBe('scorePause');
      expect(red.lastOfType('score').scores.red).toBe(1);
    });

    it('the winning capture ends the game with the correct winner', () => {
      const { room, red, blue } = liveRoom();
      room._resetPads();
      const p = room.players.red;
      p.state = PLAYER_STATES.ALIVE;
      p.score = WIN_SCORE - 1; // one capture from winning
      const pad = room.pads.blue[0];
      p.row = pad.row; p.col = pad.col;

      room._checkScoring(Date.now());

      expect(p.score).toBe(WIN_SCORE);
      expect(room.phase).toBe('gameOver');
      const over = red.lastOfType('gameOver');
      expect(over).toBeTruthy();
      expect(over.winnerId).toBe('red');
      expect(blue.lastOfType('gameOver').winnerId).toBe('red');
    });
  });

  // ── Roadmap (owned by later tasks — intended post-fix behavior) ───────────────

  describe('roadmap (todo)', () => {
    it.todo('[P7] input drain order alternates by tick parity (removes the fixed red-first bias)');
    it.todo('[P7] simultaneous same-tick final captures are both collected before resolution');
  });
});
