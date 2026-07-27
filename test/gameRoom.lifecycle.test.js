// test/gameRoom.lifecycle.test.js — room / connection lifecycle unit tests.
//
// Stub sockets + faked timers drive addClient/removeClient, the 30s
// reconnect-forfeit window, the rematch ready-check, and slot-liveness
// classification. See test/helpers.js for the stub socket.
//
// SCOPING NOTE: these tests cover the GameRoom-observable slice of the
// lifecycle — _isSlotLive classification and addClient(ws, playerId) room
// assembly — with stub sockets. As of P3, server/index.js is importable
// (exports start()/helpers), so the raw connection-handler cases (origin gate,
// room-ID gate, maxPayload, rate limit, heartbeat, /health) are now exercised
// over real WebSockets in test/server.integration.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameRoom } from '../server/GameRoom.js';
import { makeSocket } from './helpers.js';

function newRoom() {
  const graceCalls = [];
  const room = new GameRoom('life', {
    onRequestContinueGrace: () => graceCalls.push(Date.now()),
  });
  return { room, graceCalls };
}

/**
 * A room with a real match in progress: both players joined (so _initGame set
 * a real lane plan + pads), moved to the `live` phase, tick stopped so the
 * test controls time. Setup messages are cleared so assertions see only
 * post-rejoin traffic.
 */
function liveMatch() {
  const red = makeSocket();
  const blue = makeSocket();
  const room = new GameRoom('resync', { onRequestContinueGrace: () => {} });
  room.addClient(red, 'red');
  room.addClient(blue, 'blue');   // _initGame → plan + pads; phase countdown; tick running
  room._stopTick();
  room.phase = 'live';
  room._goTime = Date.now() - 5000;
  room._inputsOpen = true;
  red.sent.length = 0;
  blue.sent.length = 0;
  return { room, red, blue };
}

describe('GameRoom room/connection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('addClient: first join gets joined+waiting; second fills the room and starts the match', () => {
    const { room } = newRoom();
    const red = makeSocket();
    const blue = makeSocket();

    room.addClient(red, 'red');
    expect(red.lastOfType('joined').playerId).toBe('red');
    expect(red.ofType('waiting')).toHaveLength(1);
    expect(room.phase).toBe('waiting');

    room.addClient(blue, 'blue');
    expect(blue.lastOfType('joined').playerId).toBe('blue');
    // Both slots live → _initGame ran: gameStart broadcast + countdown started.
    expect(red.ofType('gameStart')).toHaveLength(1);
    expect(blue.ofType('gameStart')).toHaveLength(1);
    expect(room.phase).toBe('countdown');

    room.destroy();
  });

  it('removeClient mid-live starts the 30s forfeit window and forfeits to the survivor', () => {
    const { room } = newRoom();
    const red = makeSocket();
    const blue = makeSocket();
    room.clients.red = red;
    room.clients.blue = blue;
    room.phase = 'live';

    room.removeClient(red);

    expect(blue.lastOfType('opponentLeft').playerId).toBe('red');
    expect(room._pendingDisconnectedId).toBe('red');

    // Countdown ticks (5..1) are sent to the survivor as the window elapses.
    vi.advanceTimersByTime(29_000);
    const counts = blue.ofType('reconnectCountdown').map((m) => m.secondsLeft);
    expect(counts).toContain(5);
    expect(counts).toContain(1);

    // At 30s with no return, the survivor wins by forfeit.
    vi.advanceTimersByTime(1_000);
    expect(blue.lastOfType('gameOver').winnerId).toBe('blue');
    expect(room.phase).toBe('gameOver');

    room.destroy();
  });

  it('rejoin within the window cancels the forfeit (no dead-end)', () => {
    const { room } = newRoom();
    const red = makeSocket();
    const blue = makeSocket();
    room.clients.red = red;
    room.clients.blue = blue;
    room.phase = 'live';

    room.removeClient(red);
    expect(room._pendingDisconnectedId).toBe('red');

    // Player returns 10s in, before the 30s forfeit.
    vi.advanceTimersByTime(10_000);
    const newRed = makeSocket();
    room.addClient(newRed, 'red');

    // Survivor is told the opponent returned; forfeit state is cleared.
    expect(blue.lastOfType('opponentReturned').playerId).toBe('red');
    expect(room._pendingDisconnectedId).toBeNull();

    // Advancing past the original 30s must NOT forfeit.
    vi.advanceTimersByTime(30_000);
    expect(blue.ofType('gameOver')).toHaveLength(0);
    expect(room.phase).toBe('live');

    room.destroy();
  });

  it('both players dropping mid-match pauses the tick without destroying state', () => {
    const { room } = newRoom();
    const red = makeSocket();
    const blue = makeSocket();
    room.clients.red = red;
    room.clients.blue = blue;
    room.phase = 'live';
    room.players.red.score = 2;
    room._startTick();
    expect(room._tickInterval).not.toBeNull();

    room.removeClient(red);
    room.removeClient(blue);

    expect(room.clients.red).toBeNull();
    expect(room.clients.blue).toBeNull();
    expect(room._tickInterval).toBeNull();     // paused
    expect(room.players.red.score).toBe(2);    // state intact
    expect(room._destroyed).toBe(false);       // not torn down

    room.destroy();
  });

  it('handleReady restarts only when BOTH players are ready', () => {
    const { room } = newRoom();
    const red = makeSocket();
    const blue = makeSocket();
    room.clients.red = red;
    room.clients.blue = blue;
    room.phase = 'gameOver';

    room.handleReady('red');
    expect(red.lastOfType('playerReady').playerId).toBe('red');
    expect(red.ofType('restart')).toHaveLength(0); // not yet

    room.handleReady('blue');
    // Both ready → handleRestart broadcasts 'restart' to both.
    expect(red.ofType('restart')).toHaveLength(1);
    expect(blue.ofType('restart')).toHaveLength(1);

    room.destroy();
  });

  it('_isSlotLive classifies OPEN vs non-OPEN sockets', () => {
    const { room } = newRoom();

    room.clients.red = null;
    expect(room._isSlotLive('red')).toBe(false);

    for (const rs of [0 /* CONNECTING */, 2 /* CLOSING */, 3 /* CLOSED */]) {
      room.clients.red = makeSocket(rs);
      expect(room._isSlotLive('red')).toBe(false);
    }

    room.clients.red = makeSocket(1 /* OPEN */);
    expect(room._isSlotLive('red')).toBe(true);

    room.destroy();
  });

  // ── Mid-match reconnect resync (P2) ──────────────────────────────────────────
  // These were P1 [P2] test.todo() placeholders; P2 converts them to real
  // assertions. The owner chose option (b) real resume, so a live-room rejoin
  // now yields a `resync` message (not a fresh `gameStart`).

  describe('mid-match reconnect resync (P2)', () => {
    it('a live-room rejoin sends the returner a resync (current plan + snapshot), not a fresh gameStart', () => {
      const { room, red, blue } = liveMatch();
      // Give the match some state worth snapshotting.
      room.players.red.score = 2;
      room.pads.blue[0].active = false;   // a captured pad
      const expectedRiver = room.riverLanes;
      const expectedRoad = room.roadLanes;

      room.removeClient(red);
      const newRed = makeSocket();
      room.addClient(newRed, 'red');

      const resync = newRed.lastOfType('resync');
      expect(resync).toBeTruthy();
      expect(newRed.ofType('gameStart')).toHaveLength(0); // NOT a fresh match
      expect(resync.phase).toBe('live');
      expect(resync.lanePlan.riverLanes).toEqual(expectedRiver);
      expect(resync.lanePlan.roadLanes).toEqual(expectedRoad);
      expect(resync.players.red.score).toBe(2);
      expect(resync.pads.blue.some((p) => !p.active)).toBe(true);
      expect(resync.timing.goElapsedMs).toBeGreaterThanOrEqual(0);
      // Survivor was untouched (kept playing) — no resync sent to blue.
      expect(blue.ofType('resync')).toHaveLength(0);

      room.destroy();
    });

    it('rejoin cancels the forfeit AND resyncs — no frozen-world dead-end', () => {
      const { room, red, blue } = liveMatch();

      room.removeClient(red);
      expect(room._pendingDisconnectedId).toBe('red');

      vi.advanceTimersByTime(10_000);
      const newRed = makeSocket();
      room.addClient(newRed, 'red');
      room._stopTick(); // don't let the resumed tick churn during the advance below

      expect(room._pendingDisconnectedId).toBeNull();              // forfeit canceled
      expect(blue.lastOfType('opponentReturned').playerId).toBe('red');
      expect(newRed.lastOfType('resync')).toBeTruthy();            // real resume, not a dead-end

      vi.advanceTimersByTime(30_000);
      expect(blue.ofType('gameOver')).toHaveLength(0);             // no forfeit
      expect(room.phase).toBe('live');

      room.destroy();
    });

    it('rejoin during scorePause resyncs with phase scorePause + remaining time', () => {
      const { room, red } = liveMatch();
      room.phase = 'scorePause';
      room._scorePauseEnd = Date.now() + 600;

      room.removeClient(red);
      const newRed = makeSocket();
      room.addClient(newRed, 'red');

      const resync = newRed.lastOfType('resync');
      expect(resync.phase).toBe('scorePause');
      expect(resync.timing.scorePauseRemainingMs).toBeGreaterThan(0);
      expect(resync.timing.scorePauseRemainingMs).toBeLessThanOrEqual(600);

      room.destroy();
    });

    it('rejoin during countdown resyncs with phase countdown + step', () => {
      const { room, red } = liveMatch();
      room.phase = 'countdown';
      room._countdownStep = 2;
      room._nextCountdownAt = Date.now() + 500;

      room.removeClient(red);
      const newRed = makeSocket();
      room.addClient(newRed, 'red');

      const resync = newRed.lastOfType('resync');
      expect(resync.phase).toBe('countdown');
      expect(resync.timing.countdownStep).toBe(2);
      expect(resync.timing.countdownRemainingMs).toBeGreaterThan(0);

      room.destroy();
    });

    it('both-drop then both-return resyncs BOTH clients (neither stranded)', () => {
      const { room, red, blue } = liveMatch();

      room.removeClient(red);
      room.removeClient(blue);
      expect(room._pausedMidMatch).toBe(true);
      expect(room._tickInterval).toBeNull();

      // First returner can't resume a 1v1 alone → waiting, no resync yet.
      const newRed = makeSocket();
      room.addClient(newRed, 'red');
      expect(newRed.ofType('resync')).toHaveLength(0);
      expect(newRed.ofType('waiting')).toHaveLength(1);

      // Second returner → both frozen clients get a fresh resync.
      const newBlue = makeSocket();
      room.addClient(newBlue, 'blue');
      expect(newBlue.lastOfType('resync')).toBeTruthy();
      expect(newRed.lastOfType('resync')).toBeTruthy();
      expect(room._pausedMidMatch).toBe(false);

      room.destroy();
    });
  });

  // Both former [P3] todos are now real tests: raw-restart rejection and the
  // zombie-socket (no-pong) terminate→close path live in
  // test/server.integration.test.js (real ws), with the pure helpers covered in
  // test/server.hardening.test.js. Remaining roadmap todos ([P7]) are in
  // test/gameRoom.tick.test.js.
});
