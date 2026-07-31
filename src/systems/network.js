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
 *   tongueHit    { attackerId, targetId, pullCol, pullRow, hitCol, hitRow, attackerFacing }
 *   roundReset   {}
 *   playerReady  { playerId }                   — a player confirmed rematch ready
 *   opponentLeft       { playerId }
 *   reconnectCountdown { secondsLeft: number }   — "Continue?" countdown ticks, shared by the
 *                                                  mid-match forfeit window and the post-rematch
 *                                                  empty-room grace window
 *   opponentReturned   { playerId }               — opponent reconnected during countdown
 *   resync       { playerId, lanePlan, phase, players, pads, timing }
 *                                                — full-state resume after a mid-match rejoin
 *   gameover           { reason: 'abandoned' }    — room was given up on (lowercase, deliberately
 *                                                  distinct from the camelCase 'gameOver' win message)
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
    onAbandoned,           // (reason: string) => void — room given up on, distinct from onGameOver
    onRestart,             // () => void
    onPlayerReady,  // ({ playerId: string }) => void
    onResync,          // (msg) => void — full-state resume after a mid-match rejoin
    onConnectionLost,  // () => void — unexpected drop; auto-reconnect loop starting
    onReconnecting,    // (attempt: number) => void — a reconnect attempt is being made
    onReconnectFailed, // () => void — reconnect window exhausted
    onError,        // (message: string) => void
    onDisconnected, // () => void — connection closed intentionally (scene teardown)
  } = options;

  let _ws        = null;
  let _playerId  = null;
  let _roomId    = null;
  let _serverUrl = null;

  // ── Auto-reconnect state ─────────────────────────────────────────────────
  // On an UNEXPECTED close we retry connect() with backoff for ~25s (inside
  // the server's 30s forfeit window), preserving the room and requesting the
  // same color via &prefer=. An INTENTIONAL close (disconnect()) skips all of
  // this and reports onDisconnected().
  let _intentionalClose = false;
  let _reconnecting     = false;
  let _reconnectAttempt = 0;
  let _reconnectStart   = 0;
  let _reconnectTimer   = null;
  const RECONNECT_WINDOW_MS = 25_000;

  // ── Connection ─────────────────────────────────────────────────────────────

  /**
   * Open the WebSocket connection.
   * @param {string} serverUrl  e.g. 'wss://your-server.railway.app'
   * @param {string} room       room code from the URL query-string
   */
  function _buildUrl(serverUrl, room, prefer) {
    let url = `${serverUrl}?room=${encodeURIComponent(room)}`;
    if (prefer) url += `&prefer=${encodeURIComponent(prefer)}`;
    return url;
  }

  function _open(url) {
    const ws = new WebSocket(url);
    _ws = ws;

    ws.onopen = () => {
      // A reconnect attempt that reaches OPEN has succeeded; the normal
      // joined → resync (or waiting) flow drives the UI from here.
      if (_reconnecting) {
        _reconnecting = false;
        _reconnectAttempt = 0;
        if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      }
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      _dispatch(msg);
    };

    ws.onclose = () => {
      if (ws !== _ws) return;   // a superseded socket closing during reconnect churn
      _ws = null;
      if (_intentionalClose) { onDisconnected?.(); return; }
      if (_reconnecting) {
        // This attempt failed before staying open — schedule the next.
        _scheduleNextAttempt();
      } else {
        // First unexpected drop, or a re-drop after a successful resume.
        _startReconnect();
      }
    };

    ws.onerror = () => {
      onError?.('WebSocket connection error');
    };
  }

  function connect(serverUrl, room, prefer = null) {
    _serverUrl        = serverUrl;
    _roomId           = room;
    _intentionalClose = false;
    // `prefer` ('red'|'blue') is passed on a rematch reconnect so a returning
    // player keeps their previous color (server honors it only when that slot is
    // free). A fresh first join omits it. Auto-reconnect uses _playerId instead.
    _open(_buildUrl(serverUrl, room, prefer));
  }

  function _startReconnect() {
    _reconnecting     = true;
    _reconnectAttempt = 0;
    _reconnectStart   = Date.now();
    onConnectionLost?.();
    // A handler may abort reconnect (e.g. the match already ended — resuming
    // there would _initGame a fresh match the client can't render). Re-check.
    if (!_reconnecting) return;
    _scheduleNextAttempt(300);
  }

  /** Abort the auto-reconnect loop (e.g. once the match is over). */
  function stopReconnect() {
    _reconnecting = false;
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  }

  function _scheduleNextAttempt(delayOverride) {
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    const backoff = delayOverride ?? Math.min(3000, 400 * _reconnectAttempt);
    _reconnectTimer = setTimeout(_attemptReconnect, backoff);
  }

  function _attemptReconnect() {
    _reconnectTimer = null;
    if (Date.now() - _reconnectStart > RECONNECT_WINDOW_MS) {
      _reconnecting = false;
      onReconnectFailed?.();
      return;
    }
    _reconnectAttempt += 1;
    onReconnecting?.(_reconnectAttempt);
    // Request the same color so the server hands back the vacated slot.
    _open(_buildUrl(_serverUrl, _roomId, _playerId));
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
        onTongueHit?.({ attackerId: msg.attackerId, targetId: msg.targetId, pullCol: msg.pullCol, pullRow: msg.pullRow, hitCol: msg.hitCol, hitRow: msg.hitRow, attackerFacing: msg.attackerFacing });
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
      case 'resync':
        onResync?.(msg);
        break;
      case 'gameover':
        onAbandoned?.(msg.reason);
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

  /** Signal this player is ready for a rematch. Server restarts when both are ready. */
  function sendReady() {
    _send({ type: 'ready' });
  }

  function disconnect() {
    // Intentional teardown (scene shutdown / navigation): suppress
    // auto-reconnect and let onclose report onDisconnected(). _ws is left for
    // the close handler to null so the intentional-close path isn't skipped
    // by the superseded-socket guard.
    _intentionalClose = true;
    _reconnecting = false;
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    _ws?.close();
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** The player ID this client was assigned by the server ('red' | 'blue'). */
  function getPlayerId() { return _playerId; }

  /** The room code this connection is in. */
  function getRoomId() { return _roomId; }

  function isConnected() { return _ws !== null && _ws.readyState === WebSocket.OPEN; }

  return { connect, disconnect, stopReconnect, sendMove, sendTongue, sendReady, getPlayerId, getRoomId, isConnected };
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
 * If `?room=` is already in the URL, that ID is kept (joining an existing room);
 * otherwise a new 6-character ID is generated. Either way the URL is normalized
 * via history.replaceState (no page reload) to end up as exactly `?room=<id>`.
 */
export function resolveRoomId() {
  const existing = new URLSearchParams(window.location.search).get('room');
  const roomId = existing || generateRoomId();

  // Rewrite the query string to hold `room` and nothing else, so inherited
  // tracking params (fbclid, utm_*, gclid, …) don't linger in the address bar
  // or ride along when the player copies the URL to invite a friend.
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('room', roomId);
  history.replaceState(null, '', url.toString());
  return roomId;
}
