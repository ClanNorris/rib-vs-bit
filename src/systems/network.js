// src/systems/network.js — client WebSocket wrapper for authoritative server

/**
 * createNetworkSystem(options)
 *
 * Factory that manages the WebSocket connection to the game server.
 * Wire the callbacks up in your scene; call connect() when ready.
 *
 * Message types received (server → client):
 *   joined       { playerId, roomId }
 *   waiting      {}                             — waiting for 2nd player
 *   gameStart    { lanePlan }                   — lane plan to build the world
 *   countdown    { value: 3|2|1|'GO' }
 *   tick         { tick, phase, players, platforms, vehicles, pads }
 *   score        { playerId, scores }
 *   playerDeath  { playerId, reason }
 *   gameOver     { winnerId }
 *   tongueHit    { attackerId, targetId }
 *   roundReset   {}
 *   playerReady  { playerId }                   — a player confirmed rematch ready
 *   opponentLeft       { playerId }
 *   reconnectCountdown { secondsLeft: number }   — last 5 s of the 30 s reconnect window
 *   opponentReturned   { playerId }               — opponent reconnected during countdown
 *   error              { message }
 *
 * Messages sent (client → server):
 *   { type: 'input', move: 'up'|'down'|'left'|'right' }
 *   { type: 'input', tongue: true }
 *   { type: 'ready' }
 */
export function createNetworkSystem(options = {}) {
  const {
    onJoined,       // (playerId: string, roomId: string) => void
    onWaiting,      // () => void
    onGameStart,    // (lanePlan: { riverLanes, roadLanes }) => void
    onCountdown,    // (value: number | 'GO') => void
    onTick,         // (state: TickState) => void
    onScore,        // ({ playerId, scores }) => void
    onPlayerDeath,  // (playerId: string, reason: string) => void
    onGameOver,     // (winnerId: string) => void
    onTongueFired,  // ({ attackerId, facing }) => void
    onTongueHit,    // ({ attackerId, targetId }) => void
    onRoundReset,   // () => void
    onOpponentLeft,        // (playerId: string) => void
    onReconnectCountdown,  // (secondsLeft: number) => void
    onOpponentReturned,    // (playerId: string) => void
    onRestart,             // () => void
    onPlayerReady,  // ({ playerId: string }) => void
    onError,        // (message: string) => void
    onDisconnected, // () => void
  } = options;

  let _ws       = null;
  let _playerId = null;
  let _roomId   = null;

  // ── Connection ─────────────────────────────────────────────────────────────

  /**
   * Open the WebSocket connection.
   * @param {string} serverUrl  e.g. 'wss://your-server.railway.app'
   * @param {string} room       room code from the URL query-string
   */
  function connect(serverUrl, room) {
    _roomId = room;
    _ws = new WebSocket(`${serverUrl}?room=${encodeURIComponent(room)}`);

    _ws.onopen = () => {
      // Server sends 'joined' immediately on connection; nothing to do here.
    };

    _ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      _dispatch(msg);
    };

    _ws.onclose = () => {
      _ws = null;
      onDisconnected?.();
    };

    _ws.onerror = () => {
      onError?.('WebSocket connection error');
    };
  }

  function _dispatch(msg) {
    switch (msg.type) {
      case 'joined':
        _playerId = msg.playerId;
        onJoined?.(msg.playerId, msg.roomId);
        break;
      case 'waiting':
        onWaiting?.();
        break;
      case 'gameStart':
        onGameStart?.(msg.lanePlan);
        break;
      case 'countdown':
        onCountdown?.(msg.value);
        break;
      case 'tick':
        onTick?.(msg);
        break;
      case 'score':
        onScore?.({ playerId: msg.playerId, scores: msg.scores });
        break;
      case 'playerDeath':
        onPlayerDeath?.(msg.playerId, msg.reason);
        break;
      case 'gameOver':
        onGameOver?.(msg.winnerId);
        break;
      case 'tongueFired':
        onTongueFired?.({ attackerId: msg.attackerId, facing: msg.facing });
        break;
      case 'tongueHit':
        onTongueHit?.({ attackerId: msg.attackerId, targetId: msg.targetId, pullCol: msg.pullCol, pullRow: msg.pullRow, attackerFacing: msg.attackerFacing });
        break;
      case 'roundReset':
        onRoundReset?.();
        break;
      case 'opponentLeft':
        onOpponentLeft?.(msg.playerId);
        break;
      case 'reconnectCountdown':
        onReconnectCountdown?.(msg.secondsLeft);
        break;
      case 'opponentReturned':
        onOpponentReturned?.(msg.playerId);
        break;
      case 'restart':
        onRestart?.();
        break;
      case 'playerReady':
        onPlayerReady?.({ playerId: msg.playerId });
        break;
      case 'error':
        onError?.(msg.message);
        break;
    }
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  function _send(msg) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Send a directional move input.
   * @param {'up'|'down'|'left'|'right'} direction
   */
  function sendMove(direction) {
    _send({ type: 'input', move: direction });
  }

  /** Send a tongue-attack input. */
  function sendTongue() {
    _send({ type: 'input', tongue: true });
  }

  /** Ask the server to restart the match (broadcasts to both clients). */
  function sendRestart() {
    _send({ type: 'restart' });
  }

  /** Signal this player is ready for a rematch. Server restarts when both are ready. */
  function sendReady() {
    _send({ type: 'ready' });
  }

  function disconnect() {
    _ws?.close();
    _ws = null;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** The player ID this client was assigned by the server ('red' | 'blue'). */
  function getPlayerId() { return _playerId; }

  /** The room code this connection is in. */
  function getRoomId() { return _roomId; }

  function isConnected() { return _ws !== null && _ws.readyState === WebSocket.OPEN; }

  return { connect, disconnect, sendMove, sendTongue, sendRestart, sendReady, getPlayerId, getRoomId, isConnected };
}

/**
 * Returns the value of the `?room=` query parameter from the current URL,
 * or null if not present.
 */
export function getRoomFromUrl() {
  return new URLSearchParams(window.location.search).get('room');
}

/** Generate a random 6-character lowercase alphanumeric room ID. */
export function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Returns the room ID to use for this session.
 * If `?room=` is already in the URL, returns it as-is (joining an existing room).
 * Otherwise generates a new 6-character ID, writes it into the URL via
 * history.replaceState (no page reload), and returns the new ID.
 */
export function resolveRoomId() {
  const existing = new URLSearchParams(window.location.search).get('room');
  if (existing) return existing;

  const roomId = generateRoomId();
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  history.replaceState(null, '', url.toString());
  return roomId;
}
