// src/scenes/MainScene.js
import * as Phaser from 'phaser';
import {
  TILE_SIZE,
  COLS,
  ROWS,
  GAME_WIDTH,
  GAME_HEIGHT,
  ROW,
} from '../config/constants';
import { GAME_TUNING } from '../config/gameTuning';
import { createAudioSystem } from '../systems/audio';
import { createAnnouncerSystem, getScoreCallout } from '../systems/announcer';
import { createIntroSystem } from '../systems/intro';
import { createUiOverlaySystem } from '../systems/uiOverlay';
import { createEffectsSystem } from '../systems/effects';
import { createPlayerFeedbackSystem } from '../systems/playerFeedback';
import { createRoundFlowSystem } from '../systems/roundFlow';
import { createMovementSystem } from '../systems/movement';
import { createCollisionSystem } from '../systems/collision';
import { createPlatformSupportSystem } from '../systems/platformSupport';
import { createScoringSystem } from '../systems/scoring';
import { createAbilitiesSystem } from '../systems/abilities';
import { createActionEffectsSystem } from '../systems/actionEffects';
import { createPlayerStateSystem } from '../systems/playerState';
import { PLAYER_STATES } from '../systems/playerLifecycle';
import { createLaneSystem } from '../systems/laneSystem';
import { createHudSystem } from '../systems/hud';
import { createMatchLanePlan } from '../config/lanes';
import { buildWorld, buildLaneObjects } from '../builders/worldBuilder';
import { createPlayer } from '../entities/frogFactory';
import { createFly } from '../entities/platformFactory';
import { GAME_THEME } from '../config/theme';
import { getMatchStateCallout } from '../systems/matchState';
import { createPlayerDeathSystem } from '../systems/playerDeath';
import { createDebugOverlaySystem } from '../systems/debugOverlay';
import { createPauseOverlaySystem } from '../systems/pauseOverlay';
import { createRoundGateSystem } from '../systems/roundGate';
import { createTouchControls } from '../systems/touchControls';
import { createNetworkSystem, resolveRoomId } from '../systems/network';
import { dirVector, clamp } from '../systems/helpers';

export class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');

    this.tileSize = TILE_SIZE;
    this.cols = COLS;
    this.rows = ROWS;
    this.width = GAME_WIDTH;
    this.height = GAME_HEIGHT;
    this.rowTypes = ROW;
    this.skipTitle = false;
    this.onKeyDown = null;
    this.winVignette = null;
    this.lanePlanDebugSummary = '';
  }

  init(data = {}) {
    this.skipTitle = Boolean(data.skipTitle);
    // Carried across a rematch scene.restart() so the reconnect can request the
    // same color (server honors it when that slot is free). null on a fresh load.
    this._preferColor = data.preferColor ?? null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0f172a');

	this.gameOver = false;
    this._gameOverScreenShown = false;
    this._pendingContinueSeconds = null;
    this._isFirstRound = true;
    this.isGamePaused = false;
    // Persistent mode flag — set true on 'joined', NEVER cleared for the
    // scene's lifetime. This (not localPlayerId, which onDisconnected used to
    // null) is what gates local-sim vs server-authoritative, so a socket drop
    // can never silently reactivate local simulation ("zombie match").
    this.isNetworkMatch = false;
    // True from connection-loss until the resync (or fresh gameStart) rebuilds
    // the world — blocks _applyServerTick from painting the stale world.
    this._awaitingResync = false;
    // Guards startRoundIntro against a double-fire (stray countdown:3 + resync).
    this._roundIntroActive = false;
    this.moveCooldown = GAME_TUNING.player.moveCooldownMs;
    // id → fly container. Server-owned freestanding entities, reconciled by id in
    // _syncFlies (count only ever shrinks — eaten flies never respawn).
    this.flies = new Map();
    this.touchControlsRed = null;
	this.touchControlsBlue = null;
	  
    const lanePlan = createMatchLanePlan({
      randomizationEnabled: GAME_TUNING.laneRandomization.randomizePerMatch,
    });
    this.riverLanes = lanePlan.riverLanes;
    this.roadLanes = lanePlan.roadLanes;
    this.lanePlanDebugSummary = lanePlan.debugSummary;

    this.buildWorld();
    this.createPlayers();
    this.createInput();

    this.audio = createAudioSystem(this);

// ─────────────────────────────────────────────────────────────────────────
    this.announcer = createAnnouncerSystem(this);
    this.effects = createEffectsSystem(this);
    this.playerFeedback = createPlayerFeedbackSystem(this);
    this.actionEffects = createActionEffectsSystem(this);

    this.pauseKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.P
    );

    this.roundGate = createRoundGateSystem(this, {
      goHazardGraceMs: GAME_TUNING.round.goHazardGraceMs,
      countdownMovesWorld: GAME_TUNING.round.countdownMovesWorld,
      countdownInputEnabled: GAME_TUNING.round.countdownInputEnabled,
      countdownCarryEnabled: GAME_TUNING.round.countdownCarryEnabled,
      countdownHazardsEnabled: GAME_TUNING.round.countdownHazardsEnabled,
      countdownScoringEnabled: GAME_TUNING.round.countdownScoringEnabled,
    });

    this.intro = createIntroSystem(this, {
      audio: this.audio,
      announcer: this.announcer,
    });

    this.uiOverlay = createUiOverlaySystem(this);
    this.hud = createHudSystem(this, {
      winScore: GAME_TUNING.scoring.winScore,
    });

    this.roundFlow = createRoundFlowSystem(this, {
      announcer: this.announcer,
      effects: this.effects,
    });

    this.laneSystem = createLaneSystem(this);
    this.laneSystem.register({
      platforms: this.platforms,
      vehicles: this.vehicles,
      platformDecorations: this.platformDecorations,
    });

    this.platformSupport = createPlatformSupportSystem(this, {
      riverRows: GAME_TUNING.board.riverRows,
      supportWidthMultiplier: GAME_TUNING.platformSupport.supportWidthMultiplier,
      minimumOverlapPx: GAME_TUNING.platformSupport.minimumOverlapPx,
    });

    this.collision = createCollisionSystem(this, {
      onTrafficHit: (player) => {
        this.playerDeath.requestPlayerDeath(player, 'traffic');
        this.effects.cameraPunch(
          GAME_TUNING.camera.hitShakeIntensity,
          GAME_TUNING.camera.hitShakeDurationMs
        );
        this.effects.spawnImpact(player.sprite.x, player.sprite.y, 0xffffff);
        this.audio.playCrash();
      },
      onWaterFall: (player) => {
        this.audio?.playSplash();
		this.playerDeath.requestPlayerDeath(player, 'river');
      },
      roadRows: GAME_TUNING.board.roadRows,
      riverRows: GAME_TUNING.board.riverRows,
    });

    this.playerState = createPlayerStateSystem(this, {
      announcer: this.announcer,
      respawnInvulnMs: GAME_TUNING.player.respawnInvulnMs,
    });

    this.playerDeath = createPlayerDeathSystem(this, {
      effects: this.effects,
      audio: this.audio,
      playerState: this.playerState,
    });

    this.movement = createMovementSystem(this, {
      onMove: (player) => {
        this.audio.playJump();
        this.playerFeedback.pop(player);
      },
      requestPlayerDeath: (player, reason) =>
        this.playerDeath.requestPlayerDeath(player, reason),
      riverRows: GAME_TUNING.board.riverRows,
      platformSupport: this.platformSupport,
    });

    this.collision.setPlatformUnderPlayerResolver(
      (player) => this.platformSupport.findSupportingPlatform(player)
    );

    this.abilities = createAbilitiesSystem(this, {
      actionEffects: this.actionEffects,
      playerFeedback: this.playerFeedback,
      announcer: this.announcer,
      effects: this.effects,
    });

    this.scoring = createScoringSystem(this, {
      winScore: GAME_TUNING.scoring.winScore,
      onScore: (playerId, pad) => {
        this.scoring.pulseScore(
          GAME_TUNING.scoring.scorePulseScale,
          GAME_TUNING.scoring.scorePulseDurationMs
        );

        this.hud?.pulseSide(
          playerId,
          1.08,
          GAME_TUNING.scoring.scorePulseDurationMs + 30
        );

        this.effects.spawnImpact(
          pad.x,
          pad.y,
          playerId === 'red' ? 0xef4444 : 0x3b82f6
        );

        this.audio.playScore();
      },
      onWin: (playerId, pad, scoreState) => {
        this.endGame(playerId, scoreState);
      },
      onRegularPoint: (playerId, pad, scoreState) => {
        const scoreCallout = getScoreCallout(this, playerId);
        const matchStateCallout = getMatchStateCallout(scoreState);

        this.roundFlow.handlePointScored({
          bannerText: scoreCallout,
          scorePauseMs: GAME_TUNING.scoring.scorePauseMs,
          zoomScale: GAME_TUNING.zoom.scoreZoomScale,
          zoomInMs: GAME_TUNING.zoom.scoreZoomInMs,
          zoomOutMs: GAME_TUNING.zoom.scoreZoomOutMs,
          cameraShakeIntensity: GAME_TUNING.camera.scoreShakeIntensity,
          cameraShakeDurationMs: GAME_TUNING.camera.scoreShakeDurationMs,
          onResume: () => {
            if (matchStateCallout) {
              this.announcer?.showScoreBanner(matchStateCallout, 900);

              this.time.delayedCall(950, () => {
                this.startRoundIntro();
              });

              return;
            }

            this.startRoundIntro();
          },
        });
      },
    });

    this.createUI();

    this.pauseOverlay = createPauseOverlaySystem(this);

    // null = local-multiplayer mode; set to 'red'|'blue' when server assigns a slot
    this.localPlayerId = null;

    this.network = createNetworkSystem({
      onJoined: (playerId, roomId) => {
        if (import.meta.env.DEV) console.log('[net] joined as', playerId, 'in room', roomId);
        this.localPlayerId = playerId;   // identity
        this.isNetworkMatch = true;      // mode — never cleared
      },
      onWaiting: () => {
        if (import.meta.env.DEV) console.log('[net] waiting for opponent');
        this.uiOverlay?.showWaitingMessage?.();
      },
      onGameStart: (lanePlan) => {
        if (import.meta.env.DEV) console.log('[net] gameStart — rebuilding world from server lane plan');
        // Fresh match (incl. reconnect into a server that restarted with an
        // empty room map) — no resync is coming, so release the tick guard.
        this._awaitingResync = false;
        this.uiOverlay?.hideWaitingMessage?.();
        this.hud?.clearDisconnectCountdown();
        this._applyServerLanePlan(lanePlan);
        // Intro fires on countdown:3 so AudioContext has a chance to resume first
      },
      onCountdown: (value) => {
        // A mid-countdown rejoin is driven by the resync path, not here, so
        // guard against a double intro if both a stray countdown:3 and a
        // resync arrive.
        if (value === 3 && this.localPlayerId && !this._roundIntroActive) {
          if (import.meta.env.DEV) console.log('[net] countdown', value);
          this.audio?.initContext?.();
          this.uiOverlay?.clearOverlay();
          this.startRoundIntro();
        }
      },
      onTick: (state) => this._applyServerTick(state),
      onScore: ({ playerId, scores }) => {
        this.players.red.score  = scores.red;
        this.players.blue.score = scores.blue;
        this.scoring?.updateScoreText();
        this.hud?.pulseSide(playerId, 1.08, GAME_TUNING.scoring.scorePulseDurationMs + 30);
        this.audio?.playScore();
      },
      onPlayerDeath: (playerId, reason) => {
        const player = this.players[playerId];
        if (!player) return;
        if (this.isNetworkMatch) {
          // Server owns state + position; play visuals only (splash / fade / sfx).
          this.playerDeath.playDeathEffects(player, reason);
        } else {
          this.playerDeath.requestPlayerDeath(player, reason);
        }
        if (reason === 'traffic') {
          this.audio?.playCrash?.();
        }
      },
      onGameOver: (winnerId) => {
        // Clear any lingering "Continue?" countdown banner (e.g. from the
        // mid-match forfeit window) before the win screen takes over.
        this.hud?.clearDisconnectCountdown();
        const scoreState = {
          red:  this.players.red.score,
          blue: this.players.blue.score,
        };
        this.endGame(winnerId, scoreState);
      },
      onTongueFired: ({ attackerId, facing }) => {
        const attacker = this.players[attackerId];
        if (attacker && attacker.id !== this.localPlayerId) {
          attacker.facing = facing;
          const dir = dirVector(facing);
          const range = GAME_TUNING.abilities.tongueRangeTiles;
          const furthestTile = { col: attacker.col + dir.x * range, row: attacker.row + dir.y * range };
          this.actionEffects?.drawTongue?.(attacker, furthestTile);
          this.actionEffects?.playTongueAnimation?.(attacker);
          this.audio?.playTongue?.();
        }
      },
      onTongueHit: ({ attackerId, targetId, pullCol, pullRow, hitCol, hitRow, attackerFacing }) => {
        const attacker = this.players[attackerId];
        const defender = this.players[targetId];
        this.actionEffects?.truncateTongue?.(attackerId, hitCol, hitRow, pullCol, pullRow);
        this.abilities.applyTongueHit(attacker, defender, pullCol, pullRow, attackerFacing);
      },
      onRoundReset: () => {
        this.resetRound(false);
        // Pads are NOT restored here — they accumulate captured within a match,
        // matching local-mode behaviour. Full reset happens on scene.restart().
      },
      onRestart: () => {
        // Rematch: reconnect requesting the same color so players don't silently
        // swap sides (P7/L-3). localPlayerId still holds this client's color here.
        this.scene.restart({ skipTitle: true, preferColor: this.localPlayerId });
      },
      onPlayerReady: ({ playerId }) => {
        this.uiOverlay.updateReadyState(playerId);
      },
      onOpponentLeft: (playerId) => {
        if (import.meta.env.DEV) console.log('[net] opponent left:', playerId);
        this.hud?.showMessage('Opponent disconnected');
      },
      onReconnectCountdown: (secondsLeft) => {
        // Don't let the post-match grace countdown flash on the live board
        // before the GAME OVER overlay (which it's positioned relative to)
        // has actually appeared — buffer it and flush once endGame()'s
        // delayedCall shows the overlay. The mid-match forfeit countdown
        // (this.gameOver still false here) is unaffected and shows immediately.
        if (this.gameOver && !this._gameOverScreenShown) {
          this._pendingContinueSeconds = secondsLeft;
          return;
        }
        this.hud?.showDisconnectCountdown(secondsLeft);
      },
      onOpponentReturned: () => {
        this.hud?.clearDisconnectCountdown();
        this.hud?.clearMessage?.();   // clear the "Opponent disconnected" text
      },
      onResync: (msg) => this._applyServerResync(msg),
      onConnectionLost: () => {
        // Unexpected socket drop mid-match: freeze the world and show the
        // reconnecting overlay while network.js retries. Do NOT touch
        // localPlayerId — isNetworkMatch keeps the sim gated off.
        if (!this.isNetworkMatch) return;
        if (this.gameOver) {
          // Match already ended — reconnecting would _initGame a fresh match
          // the client can't render (this.gameOver freezes update()). Leave the
          // win screen up. Rematch-after-drop is P7's scope.
          this.network?.stopReconnect?.();
          return;
        }
        if (import.meta.env.DEV) console.log('[net] connection lost — freezing, auto-reconnecting');
        this._awaitingResync = true;
        this.roundGate.setDisconnected();
        this.uiOverlay?.showReconnecting?.();
      },
      onReconnecting: (attempt) => {
        this.uiOverlay?.setReconnectAttempt?.(attempt);
      },
      onReconnectFailed: () => {
        if (import.meta.env.DEV) console.log('[net] reconnect window exhausted');
        this.uiOverlay?.showConnectionLost?.({
          onPlayAgain: () => { window.location.reload(); },
        });
      },
      onAbandoned: () => {
        this.hud?.clearDisconnectCountdown();
        this.uiOverlay.showAbandoned({
          onPlayAgain: () => {
            window.location.href = window.location.origin;
          },
        });
      },
      onError: (msg) => { if (import.meta.env.DEV) console.warn('[net] error', msg); },
      onDisconnected: () => {
        // Only reached on an INTENTIONAL close (scene teardown / navigation).
        // Unexpected drops go through onConnectionLost + auto-reconnect.
        // Never null localPlayerId here — mode is owned by isNetworkMatch.
        if (import.meta.env.DEV) console.log('[net] disconnected (intentional)');
      },
    });
    const room = resolveRoomId();
    const roomUrl = window.location.href;
    this._pendingRoom = room;           // stash for _connectNetwork()
    this._networkConnected = false;


    this.debugOverlay = createDebugOverlaySystem(this, {
      players: this.players,
    });

    this.debugToggleKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.F3
    );

    this.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      this.handleSceneShutdown,
      this
    );
    this.events.once(
      Phaser.Scenes.Events.DESTROY,
      this.handleSceneShutdown,
      this
    );

    this._visibilityHandler = () => {
      if (!document.hidden) this.audio?.initContext?.();
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    this.resetRound(false);

    if (this.skipTitle) {
      this._connectNetwork();
      // Network mode: intro fires once via onCountdown:3 when the server starts the
      // match (both players present). Only start it locally in true local mode.
      if (!this._pendingRoom) this.startRoundIntro();
    } else {
      this.roundGate.setMenu();
      this.uiOverlay.showTitleScreen({
        onStart: () => {
          this._connectNetwork();
          // Network mode: intro deferred to onCountdown:3 (fires when opponent joins).
          // The "waiting for opponent" overlay covers the gap. Local mode has no
          // server countdown, so start the intro immediately.
          if (!this._pendingRoom) this.startRoundIntro();
        },
        roomUrl,
      });
    }
  }

  buildWorld() {
    const world = buildWorld(this, {
      riverLanes: this.riverLanes,
      roadLanes: this.roadLanes,
      rowTypes: this.rowTypes,
    });

    this.platforms = world.platforms;
    this.vehicles = world.vehicles;
    this.platformDecorations = world.platformDecorations;
    this.bluePads = world.bluePads;
    this.redPads = world.redPads;
    this.topPadCols = world.topPadCols;
    this.bottomPadCols = world.bottomPadCols;
  }

  handleSceneShutdown() {
	if (this._shutdownComplete) return;
	this._shutdownComplete = true;
    if (this.onKeyDown) {
      this.input.keyboard.off('keydown', this.onKeyDown);
      this.onKeyDown = null;
    }

    this.laneSystem?.destroy();
    this.platformSupport?.destroy();
    this.abilities?.destroy();
    this.actionEffects?.destroy();
    this.playerState?.destroy();
    this.scoring?.destroy();
    this.collision?.destroy();
    this.movement?.destroy();
    this.roundFlow?.destroy();
    this.playerFeedback?.destroy();
    this.effects?.destroy();
    this.intro?.destroy();
    this.hud?.destroy();
    this.uiOverlay?.destroy();
    this.audio?.destroy();
    this.announcer?.destroy();
    this.playerDeath?.destroy();
    this.debugOverlay?.destroy();
    this.pauseOverlay?.destroy();
    this.roundGate?.destroy();
    this.network?.disconnect();

    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }

    this.touchControlsRed?.destroy?.();
    this.touchControlsBlue?.destroy?.();

    if (this.flies) {
      for (const fly of this.flies.values()) fly.destroy();
      this.flies.clear();
    }

    if (this.winVignette?.active) {
      this.winVignette.destroy();
    }
    this.winVignette = null;
  }

  createPlayers() {
    this.players = {
      red: createPlayer(this, {
        id: 'red',
        name: 'Rib',
        color: 0x22c55e,
        accent: 0xef4444,
        startCol: 7,
        startRow: this.rowTypes.BOTTOM_START,
        facing: 'up',
        score: 0,
      }),
      blue: createPlayer(this, {
        id: 'blue',
        name: 'Bit',
        color: 0x22c55e,
        accent: 0x3b82f6,
        startCol: 7,
        startRow: this.rowTypes.TOP_START,
        facing: 'down',
        score: 0,
      }),
    };
  }

  createUI() {
    this.hud.create();
    this.createWinVignette();
    this.announcer.createStatusText(this.width / 2, this.height / 2 - 18);
    this.scoring.updateScoreText();
  }

  createWinVignette() {
    if (this.winVignette?.active) return;

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const vignette = this.add.container(0, 0);
    vignette.setDepth(1000.4);
    vignette.setAlpha(0);
    vignette.setVisible(false);

    const base = this.add.rectangle(
      centerX,
      centerY,
      this.width,
      this.height,
      0x000000,
      0.04
    );
    const top = this.add.rectangle(centerX, 48, this.width, 96, 0x000000, 0.06);
    const bottom = this.add.rectangle(
      centerX,
      this.height - 48,
      this.width,
      96,
      0x000000,
      0.06
    );
    const left = this.add.rectangle(48, centerY, 96, this.height, 0x000000, 0.06);
    const right = this.add.rectangle(
      this.width - 48,
      centerY,
      96,
      this.height,
      0x000000,
      0.06
    );

    vignette.add([base, top, bottom, left, right]);
    this.winVignette = vignette;
  }

  playWinVignette(winnerId) {
    if (!this.winVignette) return;

    const tintColor = winnerId === 'red' ? 0xef4444 : 0x3b82f6;
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    this.winVignette.removeAll(true);

    const base = this.add.rectangle(
      centerX,
      centerY,
      this.width,
      this.height,
      0x000000,
      0.04
    );
    const top = this.add.rectangle(centerX, 48, this.width, 96, 0x000000, 0.06);
    const bottom = this.add.rectangle(
      centerX,
      this.height - 48,
      this.width,
      96,
      0x000000,
      0.06
    );
    const left = this.add.rectangle(48, centerY, 96, this.height, 0x000000, 0.06);
    const right = this.add.rectangle(
      this.width - 48,
      centerY,
      96,
      this.height,
      0x000000,
      0.06
    );
    const centerTint = this.add.ellipse(centerX, centerY, 320, 130, tintColor, 0.035);

    this.winVignette.add([base, top, bottom, left, right, centerTint]);
    this.winVignette.setVisible(true);
    this.winVignette.setAlpha(0);

    this.tweens.killTweensOf(this.winVignette);
    this.tweens.add({
      targets: this.winVignette,
      alpha: 1,
      duration: 260,
      ease: 'Quad.out',
    });
  }

  hideWinVignette() {
    if (!this.winVignette) return;

    this.tweens.killTweensOf(this.winVignette);
    this.tweens.add({
      targets: this.winVignette,
      alpha: 0,
      duration: 180,
      ease: 'Quad.out',
      onComplete: () => {
        if (this.winVignette) {
          this.winVignette.setVisible(false);
        }
      },
    });
  }

  createInput() {
    this.wasdControls = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      tongue: Phaser.Input.Keyboard.KeyCodes.F,
    });

    this.arrowControls = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      tongue: Phaser.Input.Keyboard.KeyCodes.ENTER,
    });

    this.rightCtrlPressed = false;
    this.onKeyDown = (event) => {
      if (!event.repeat && event.code === 'ControlRight') {
        this.rightCtrlPressed = true;
      }
    };

    this.input.keyboard.on('keydown', this.onKeyDown);
    this.players.red.controls = this.wasdControls;
    this.players.blue.controls = this.arrowControls;
  }

  startRoundIntro() {
    this._roundIntroActive = true;
    this.roundGate.setCountdown();
    this.hud?.clearMessage();
    this.hideWinVignette();

    this.audio?.playRoundStart?.();   // ← directly, no delayedCall

    const showLabels = this._isFirstRound;
    this._isFirstRound = false;

    this.intro.playRoundIntro({
      players: this.players,
      showLabels,
      onComplete: () => {
        this._roundIntroActive = false;
        this.roundGate.setLive();
        if (this.isNetworkMatch) {
          this._createNetworkTouchControls();
        } else {
          this.touchControlsRed?.destroy?.();
          this.touchControlsBlue?.destroy?.();
          this.touchControlsRed  = createTouchControls(this, this.players.red);
          this.touchControlsBlue = createTouchControls(this, this.players.blue);
        }
      },
    });
  }

  // One D-pad for the local player, wired through the network. Shared by the
  // round-intro onComplete and the live-phase resync path.
  _createNetworkTouchControls() {
    this.touchControlsRed?.destroy?.();
    this.touchControlsBlue?.destroy?.();
    const netOpts = {
      onMove:   (dir) => this._sendNetworkMove(dir),
      onTongue: ()    => this._fireTongueLocal(this.players[this.localPlayerId], this.time.now),
    };
    this.touchControlsRed  = this.localPlayerId === 'red'
      ? createTouchControls(this, this.players.red,  netOpts)
      : { destroy: () => {} };
    this.touchControlsBlue = this.localPlayerId === 'blue'
      ? createTouchControls(this, this.players.blue, netOpts)
      : { destroy: () => {} };
  }

  update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.toggleGamePaused();
    }

    if (Phaser.Input.Keyboard.JustDown(this.debugToggleKey)) {
      this.debugOverlay?.toggle();
    }

    this.debugOverlay?.update();

    if (this.isGamePaused) return;

    // Local mode only. In network mode the server is the sole writer of `state`
    // and position (applied every tick in _applyServerTick); running the client
    // machine here only creates conflict. Placing it below the pause check also
    // stops respawn/invuln timers advancing during a local-mode P-pause (L-6).
    if (!this.isNetworkMatch) this.playerState?.update(time);

    this.actionEffects?.update();

    // Fly-eat 2x-speed buff glow (both frogs), driven off the mirrored timer.
    // Idempotent, so it starts/stops the rainbow cleanly as the buff comes and goes.
    const nowMs = Date.now();
    this.players.red.setBuffGlow?.(nowMs < (this.players.red.speedBuffUntil ?? 0));
    this.players.blue.setBuffGlow?.(nowMs < (this.players.blue.speedBuffUntil ?? 0));

    const dt = delta / 1000;
    const gate = this.roundGate;

    if (gate?.isWorldRunning?.()) {
      if (this.isNetworkMatch) {
        // Network mode: server owns all hazard positions; only animate decorations
        this.laneSystem.updateDecorations();
      } else {
        this.laneSystem.update(dt);
      }
    }

    if (this.gameOver || gate?.getPhase?.() === 'gameOver') {
      return;
    }

    this.platformSupport?.resetFrameFlags?.(this.players.red);
    this.platformSupport?.resetFrameFlags?.(this.players.blue);

    if (gate?.isInputEnabled?.()) {
      this.handlePlayerInput(this.players.red, time);
      this.handlePlayerInput(this.players.blue, time);
    }

    // Server is authoritative in network mode — skip local simulation
    if (!this.isNetworkMatch) {
      if (gate?.isCarryEnabled?.()) {
        this.movement.applyPlatformCarry(this.players.red, dt);
        this.movement.applyPlatformCarry(this.players.blue, dt);
      }

      if (gate?.areHazardsEnabled?.(time)) {
        this.collision.checkPlayerHazards(this.players.red);
        this.collision.checkPlayerHazards(this.players.blue);
      }

      if (gate?.isScoringEnabled?.()) {
        this.scoring.checkLilyPadCapture();
      }
    }
  }

  // Would this move change the player's tile, or would the server clamp it to a
  // no-op at the board edge? Mirrors GameRoom._tryMove's clamp bounds so the
  // client doesn't send (or play the hop SFX for) a move the server will drop.
  _moveChangesTile(player, dir) {
    const d = dirVector(dir);
    const newCol = clamp(player.col + d.x, 0, COLS - 1);
    const newRow = clamp(player.row + d.y, 0, ROW.BOTTOM_PADS);
    return newCol !== player.col || newRow !== player.row;
  }

  // Single network move-send path for BOTH keyboard and touch, with every gate
  // in one place: input phase (scorePause/menu/countdown), post-tongue-hit stun
  // (server rejects moves while stunned — stunUntil is its Date.now()-based value
  // mirrored each tick), move cooldown, and board-edge no-ops. Only plays the
  // optimistic hop SFX when the move will actually be accepted (P7/L-4).
  _sendNetworkMove(dir, now = this.time.now) {
    if (!this.roundGate?.isInputEnabled?.()) return;
    const player = this.players[this.localPlayerId];
    if (!player) return;
    if (Date.now() < (player.stunUntil ?? 0)) return;
    // Buff-aware cooldown — must mirror the server's _effectiveMoveCooldown so a
    // boosted player isn't gated locally on moves the server would accept.
    const cd = this.moveCooldown *
      (Date.now() < (player.speedBuffUntil ?? 0) ? GAME_TUNING.fly.buffMoveCooldownFactor : 1);
    if (now - player.lastMoveTime < cd) return;
    if (!this._moveChangesTile(player, dir)) return;

    this.network.sendMove(dir);
    player.setPupilDirection?.(dir);
    player.lastMoveTime = now;
    player.serverPosLocked = false;
    delete player.expectedPullCol;
    delete player.expectedPullRow;
    this.audio?.playJump?.();
  }

  handlePlayerInput(player, time) {
    const c = player.controls;
    if (!c) return;

    // ── Network mode: send inputs to server, no local movement ────────────────
    if (this.isNetworkMatch) {
      if (player.id !== this.localPlayerId) return;

      const w = this.wasdControls;
      const a = this.arrowControls;
      const JD = Phaser.Input.Keyboard.JustDown;

      const tonguePressed = JD(w.tongue) || JD(a.tongue) || this.consumeRightCtrl();
      if (tonguePressed) {
        this._fireTongueLocal(player, time);
      }

      let sentDir = null;
      if      (JD(w.up)    || JD(a.up))    sentDir = 'up';
      else if (JD(w.down)  || JD(a.down))  sentDir = 'down';
      else if (JD(w.left)  || JD(a.left))  sentDir = 'left';
      else if (JD(w.right) || JD(a.right)) sentDir = 'right';
      // Move + all gates (stun / cooldown / edge no-op) live in _sendNetworkMove,
      // shared with the touch path so both feel identical.
      if (sentDir) this._sendNetworkMove(sentDir, time);
      return;
    }

    // ── Local multiplayer mode ─────────────────────────────────────────────────
    const tonguePressed =
      Phaser.Input.Keyboard.JustDown(c.tongue) ||
      (player.controls === this.arrowControls && this.consumeRightCtrl());

    if (tonguePressed && this.abilities.tryTongue(player, time)) {
      this.actionEffects?.playTongueAnimation?.(player);
      this.audio?.playTongue?.();
    }

    if (time - player.lastMoveTime < this.moveCooldown) return;

    let moved = false;

    if (Phaser.Input.Keyboard.JustDown(c.up)) {
      moved = this.movement.tryMove(player, 0, -1, 'up');
    } else if (Phaser.Input.Keyboard.JustDown(c.down)) {
      moved = this.movement.tryMove(player, 0, 1, 'down');
    } else if (Phaser.Input.Keyboard.JustDown(c.left)) {
      moved = this.movement.tryMove(player, -1, 0, 'left');
    } else if (Phaser.Input.Keyboard.JustDown(c.right)) {
      moved = this.movement.tryMove(player, 1, 0, 'right');
    }

    if (moved) {
      player.lastMoveTime = time;
    }
  }

  _fireTongueLocal(player, time) {
    if (!this.abilities.canFireTongue(player, time)) return;
    this.network.sendTongue();
    const dir = dirVector(player.facing);
    const range = GAME_TUNING.abilities.tongueRangeTiles;

    // Draw to the actual target the client already knows about, not full range —
    // avoids a visible full-length overshoot before the server's onTongueHit
    // confirmation arrives. onTongueHit still truncates authoritatively.
    const defender = player.id === 'red' ? this.players.blue : this.players.red;
    let targetTile = { col: player.col + dir.x * range, row: player.row + dir.y * range };
    if (defender) {
      for (let i = 1; i <= range; i += 1) {
        const tile = { col: player.col + dir.x * i, row: player.row + dir.y * i };
        if (defender.col === tile.col && defender.row === tile.row) {
          targetTile = tile;
          break;
        }
      }
    }

    this.actionEffects?.drawTongue?.(player, targetTile);
    this.actionEffects?.playTongueAnimation?.(player);
    this.audio?.playTongue?.();
  }

  resetRound(showMessage) {
    this.roundFlow.resetRound({
      players: [this.players.red, this.players.blue],
      tongueGraphics: {
        clear: () => this.actionEffects.clearTongue(),
      },
      resetPlayer: (player, reason, silent) =>
        this.playerState.respawnPlayer(player, reason, silent),
      showMessage,
    });
  }

  setGamePaused(paused) {
    this.isGamePaused = paused;

    this.pauseOverlay?.toggle(paused);

    this.time.timeScale = paused ? 0 : 1;

    if (paused) {
      this.tweens.pauseAll();
      this.anims.pauseAll();
      return;
    }

    this.tweens.resumeAll();
    this.anims.resumeAll();
  }

  toggleGamePaused() {
    if (this.gameOver) return;
    this.setGamePaused(!this.isGamePaused);
  }

  // ── Network helpers ──────────────────────────────────────────────────────────

  _applyServerLanePlan(lanePlan) {
    // Destroy existing Phaser lane objects
    for (const p of this.platforms)           p.destroy();
    for (const v of this.vehicles)            v.destroy();
    for (const d of this.platformDecorations) d.destroy();

    // Clear in-place so platformSupport (which reads scene.platforms) sees the new set
    this.platforms.length           = 0;
    this.vehicles.length            = 0;
    this.platformDecorations.length = 0;

    // Adopt server's lane plan so local physics runs identically
    this.riverLanes = lanePlan.riverLanes;
    this.roadLanes  = lanePlan.roadLanes;

    // Recreate Phaser objects — pushed into the same arrays in the same order as the server
    buildLaneObjects(this, {
      riverLanes:          this.riverLanes,
      roadLanes:           this.roadLanes,
      platforms:           this.platforms,
      vehicles:            this.vehicles,
      platformDecorations: this.platformDecorations,
    });

    // Re-register with laneSystem (it stores its own array reference)
    this.laneSystem.register({
      platforms:           this.platforms,
      vehicles:            this.vehicles,
      platformDecorations: this.platformDecorations,
    });
  }

  _connectNetwork() {
    if (this._networkConnected) return;
    this._networkConnected = true;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}/ws`;
    this.network.connect(wsUrl, this._pendingRoom, this._preferColor);
  }

  // Network mode: the server is the sole writer of `state` and position, so the
  // death/respawn/invuln *visuals* are reconciled off the broadcast `state`
  // rather than a local clock. RESPAWNING = corpse held at the death tile (the
  // fade tween owns alpha); INVULNERABLE = respawned at spawn (server snapped
  // position) with a static tint; ALIVE = full alpha, angle cleared.
  _syncPlayerStateVisual(player, prevState, nextState) {
    const S = PLAYER_STATES;
    if (nextState === S.RESPAWNING) return;   // death fade owns alpha this window
    if (nextState === S.INVULNERABLE) {
      this._endNetDeathFade(player);
      player.sprite.setAngle(0);
      player.sprite.setAlpha(0.82);
      player.shadow?.setAlpha(0.7);
    } else if (prevState !== S.ALIVE) {        // ALIVE (server never sends DYING)
      this._endNetDeathFade(player);
      player.sprite.setAngle(0);
      player.sprite.setAlpha(1);
      player.shadow?.setAlpha(1);
    }
  }

  _endNetDeathFade(player) {
    if (player._netDeathTween) {
      player._netDeathTween.stop();
      player._netDeathTween = null;
    }
  }

  _applyServerTick(state) {
    // While disconnected/reconnecting the local world is stale (or being
    // rebuilt) — ignore ticks until the resync (or fresh gameStart) lands.
    if (this._awaitingResync) return;

    // Apply authoritative player positions
    for (const [id, data] of Object.entries(state.players)) {
      const player = this.players[id];
      if (!player) continue;
      const prevState = player.state;
      player.facing = data.facing;
      player.state  = data.state;
      player.stunUntil = data.stunUntil ?? 0;   // mirror for the client stun gate (Date.now()-based)
      player.speedBuffUntil = data.speedBuffUntil ?? 0;  // mirror for the client move-cooldown gate + glow
      this._syncPlayerStateVisual(player, prevState, data.state);
      if (data.facing) player.setPupilDirection?.(data.facing);

      if (player.serverPosLocked) {
        // Release the lock only when the server confirms the pulled tile,
        // then fall through to apply the server position normally.
        if (player.expectedPullCol !== undefined &&
            data.col === player.expectedPullCol &&
            data.row === player.expectedPullRow) {
          player.serverPosLocked = false;
          delete player.expectedPullCol;
          delete player.expectedPullRow;
        } else {
          continue;
        }
      }
      // Opponent hop SFX: fire only on a server-confirmed input move (not platform
      // carry, which reassigns col without setting movedThisTick). Non-local only —
      // the local player plays playJump() at send-time in handlePlayerInput.
      if (id !== this.localPlayerId && data.movedThisTick) {
        this.audio?.playJump?.();
      }

      player.col      = data.col;
      player.row      = data.row;
      player.sprite.x = data.x;
      player.sprite.y = data.y;
    }

    // Apply authoritative hazard positions.
    // laneSystem.update() is disabled in network mode so there is no local movement
    // to conflict with. Platforms index-match the server array because _applyServerLanePlan
    // rebuilt them from the same lane plan in the same iteration order.
    if (state.platforms) {
      for (let i = 0; i < state.platforms.length && i < this.platforms.length; i++) {
        this.platforms[i].x = state.platforms[i].x;
      }
    }
    if (state.vehicles) {
      for (let i = 0; i < state.vehicles.length && i < this.vehicles.length; i++) {
        this.vehicles[i].x = state.vehicles[i].x;
      }
    }

    // Sync pad visibility — only hide on capture; restoration is handled in onRoundReset
    this._applyPadState(state.pads);

    // Reconcile flies (announce eaten-vanish effects on the live tick path).
    this._syncFlies(state.flies, true);
  }

  // Reconcile the id-keyed fly set against the server payload. Creates sprites
  // for new ids, snaps every fly to its authoritative x/y, and destroys any local
  // fly the server no longer reports — which (flies never respawn) means it was
  // eaten, so on the live path we also play the chomp spark + sound at its last
  // position. `announce` is false on resync/initial so an already-eaten fly
  // revealed by a snapshot doesn't fire a spurious effect.
  _syncFlies(serverFlies, announce) {
    if (!serverFlies) return;
    const seen = new Set();
    for (const f of serverFlies) {
      seen.add(f.id);
      let fly = this.flies.get(f.id);
      if (!fly) {
        fly = createFly(this, f.x, f.y);
        this.flies.set(f.id, fly);
      }
      fly.x = f.x;
      fly.y = f.y;
    }
    for (const [id, fly] of this.flies) {
      if (seen.has(id)) continue;
      if (announce) {
        this.effects?.spawnImpact?.(fly.x, fly.y, GAME_THEME.objects.flyEatSpark);
        this.audio?.playScore?.();
      }
      fly.destroy();
      this.flies.delete(id);
    }
  }

  // Hide pads the server reports as captured (active:false). Shared by the
  // per-tick sync and the resync snapshot. Restoration (un-hiding) happens on
  // roundReset / scene.restart(), never here.
  _applyPadState(pads) {
    if (!pads) return;
    const syncPads = (serverPads, clientPads) => {
      for (const padData of serverPads ?? []) {
        if (!padData.active) {
          const pad = clientPads?.find(p => p.col === padData.col && p.row === padData.row);
          if (pad && pad.activePad) {
            pad.activePad = false;
            pad.x = -9999;
            pad.y = -9999;
          }
        }
      }
    };
    syncPads(pads.blue, this.bluePads);
    syncPads(pads.red,  this.redPads);
  }

  // Full-state resume after a mid-match reconnect. Tears down the stale,
  // locally-randomized world and rebuilds it from the server's authoritative
  // snapshot, then jumps the gate to the live phase so play continues.
  _applyServerResync(msg) {
    if (import.meta.env.DEV) console.log('[net] resync — resuming match in phase', msg.phase);

    // 1. Rebuild the world from the server's CURRENT lane plan (reuse the
    //    existing round-rebuild path — destroys the mismatched local world,
    //    recreates platforms/vehicles/decorations, re-registers laneSystem).
    if (msg.lanePlan) this._applyServerLanePlan(msg.lanePlan);

    // 2. Apply the player snapshot (direct assignment — no prediction locks).
    for (const [id, data] of Object.entries(msg.players ?? {})) {
      const player = this.players[id];
      if (!player) continue;
      const prevState = player.state;
      player.facing = data.facing;
      player.state  = data.state;
      player.stunUntil = data.stunUntil ?? 0;
      player.speedBuffUntil = data.speedBuffUntil ?? 0;
      this._syncPlayerStateVisual(player, prevState, data.state);
      player.score  = data.score;
      player.col    = data.col;
      player.row    = data.row;
      player.sprite.x = data.x;
      player.sprite.y = data.y;
      player.serverPosLocked = false;
      delete player.expectedPullCol;
      delete player.expectedPullRow;
      if (data.facing) player.setPupilDirection?.(data.facing);
    }

    // 3. Pad captures + score display + current flies (no eaten-vanish effect —
    //    the snapshot may reveal flies eaten while this client was gone).
    this._applyPadState(msg.pads);
    this._syncFlies(msg.flies, false);
    this.scoring?.updateScoreText?.();

    // 4. Release the tick guard and clear the reconnecting overlay.
    this._awaitingResync = false;
    this.uiOverlay?.clearOverlay?.();
    this.hud?.clearDisconnectCountdown?.();
    this.hud?.clearMessage?.();

    // 5. Jump the gate to the snapshot phase and restore input/D-pad.
    if (msg.phase === 'scorePause') {
      // Frozen until the server's next countdown:3 runs startRoundIntro (which
      // recreates the D-pad). Nothing to spawn now.
      this.roundGate.setScorePause();
    } else if (msg.phase === 'countdown') {
      // Drive the intro so input + D-pad come up; onCountdown is guarded so a
      // trailing countdown:3 won't double-fire it.
      if (!this._roundIntroActive) this.startRoundIntro();
    } else {
      // live (or any unexpected value) → resume play immediately.
      this.roundGate.setLive();
      this._createNetworkTouchControls();
    }
  }

  endGame(winnerId, scoreState = null) {
    this.gameOver = true;
    this.roundGate.setGameOver();
	this.touchControlsRed?.destroy?.();
    this.touchControlsBlue?.destroy?.();
    this.touchControlsRed = null;
    this.touchControlsBlue = null;
    this.roundFlow.cancelPendingTransitions();

    const winnerText = winnerId === 'red' ? 'WINNER! RIB!!' : 'WINNER! BIT!!';

    this.hud?.showMessage(winnerText);
    this.playWinVignette(winnerId);
    this.announcer?.showScoreBanner(winnerText, 1500);
    this.audio.playWinSting?.(winnerId);

    this.time.delayedCall(1600, () => {
      this._gameOverScreenShown = true;
      if (this._pendingContinueSeconds !== null) {
        this.hud?.showDisconnectCountdown(this._pendingContinueSeconds);
        this._pendingContinueSeconds = null;
      }
      this.uiOverlay.showGameOver({
        winnerId,
        onRestart: () => {
          if (this.isNetworkMatch) {
            // Signal ready; server restarts both clients when both players confirm
            this.network.sendReady();
          } else {
            this.scene.restart({ skipTitle: true });
          }
        },
      });
    });
  }

  consumeRightCtrl() {
    if (!this.rightCtrlPressed) return false;
    this.rightCtrlPressed = false;
    return true;
  }

  centerX(col) {
    return col * this.tileSize + this.tileSize / 2;
  }

  centerY(row) {
    return row * this.tileSize + this.tileSize / 2;
  }

  gridY(row) {
    return row * this.tileSize;
  }
}
