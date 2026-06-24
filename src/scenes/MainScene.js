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
import { createLaneSystem } from '../systems/laneSystem';
import { createHudSystem } from '../systems/hud';
import { createMatchLanePlan } from '../config/lanes';
import { buildWorld, buildLaneObjects } from '../builders/worldBuilder';
import { createPlayer } from '../entities/frogFactory';
import { getMatchStateCallout } from '../systems/matchState';
import { createPlayerDeathSystem } from '../systems/playerDeath';
import { createDebugOverlaySystem } from '../systems/debugOverlay';
import { createPauseOverlaySystem } from '../systems/pauseOverlay';
import { createRoundGateSystem } from '../systems/roundGate';
import { createTouchControls } from '../systems/touchControls';
import { createNetworkSystem, resolveRoomId } from '../systems/network';
import { dirVector } from '../systems/helpers';

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
  }

  create() {
    this.cameras.main.setBackgroundColor('#0f172a');

	this.gameOver = false;
    this.roundPaused = false;
    this._isFirstRound = true;
    this.isGamePaused = false;
    this.moveCooldown = GAME_TUNING.player.moveCooldownMs;
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
        console.log('[net] joined as', playerId, 'in room', roomId);
        this.localPlayerId = playerId;
      },
      onWaiting: () => {
        console.log('[net] waiting for opponent');
        this.uiOverlay?.showWaitingMessage?.();
      },
      onGameStart: (lanePlan) => {
        console.log('[net] gameStart — rebuilding world from server lane plan');
        this.uiOverlay?.hideWaitingMessage?.();
        this.hud?.clearDisconnectCountdown();
        this._applyServerLanePlan(lanePlan);
        // Intro fires on countdown:3 so AudioContext has a chance to resume first
      },
      onCountdown: (value) => {
        if (value === 3 && this.localPlayerId) {
		  console.log('[net] countdown', value); 
          // Resume AudioContext (browser may allow without gesture once page is loaded)
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
        if (player) this.playerDeath.requestPlayerDeath(player, reason);
        if (playerId === this.localPlayerId && reason === 'traffic') {
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
        }
      },
      onTongueHit: ({ attackerId, targetId, pullCol, pullRow, attackerFacing }) => {
        const attacker = this.players[attackerId];
        const defender = this.players[targetId];
        this.abilities.applyTongueHit(attacker, defender, pullCol, pullRow, attackerFacing);
      },
      onRoundReset: () => {
        this.resetRound(false);
        // Pads are NOT restored here — they accumulate captured within a match,
        // matching local-mode behaviour. Full reset happens on scene.restart().
      },
      onRestart: () => {
        this.scene.restart({ skipTitle: true });
      },
      onPlayerReady: ({ playerId }) => {
        this.uiOverlay.updateReadyState(playerId);
      },
      onOpponentLeft: (playerId) => {
        console.log('[net] opponent left:', playerId);
        this.hud?.showMessage('Opponent disconnected');
      },
      onReconnectCountdown: (secondsLeft) => {
        this.hud?.showDisconnectCountdown(secondsLeft);
      },
      onOpponentReturned: () => {
        this.hud?.clearDisconnectCountdown();
      },
      onAbandoned: () => {
        this.hud?.clearDisconnectCountdown();
        this.uiOverlay.showAbandoned({
          onPlayAgain: () => {
            window.location.href = window.location.origin;
          },
        });
      },
      onError: (msg) => console.warn('[net] error', msg),
      onDisconnected: () => {
        console.log('[net] disconnected');
        this.localPlayerId = null;
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
      this.startRoundIntro();
    } else {
      this.roundPaused = true;
      this.roundGate.setMenu();
      this.uiOverlay.showTitleScreen({
        onStart: () => {
          this._connectNetwork();
          this.startRoundIntro();
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
    this.roundPaused = true;
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
        this.roundPaused = false;
        this.roundGate.setLive();
        this.touchControlsRed?.destroy?.();
        this.touchControlsBlue?.destroy?.();
        if (this.localPlayerId) {
          // Network mode: one D-pad for the local player, wired through the network
          const netOpts = {
            onMove:   (dir)  => this.network.sendMove(dir),
            onTongue: ()     => this.network.sendTongue(),
          };
          this.touchControlsRed  = this.localPlayerId === 'red'
            ? createTouchControls(this, this.players.red,  netOpts)
            : { destroy: () => {} };
          this.touchControlsBlue = this.localPlayerId === 'blue'
            ? createTouchControls(this, this.players.blue, netOpts)
            : { destroy: () => {} };
        } else {
          this.touchControlsRed  = createTouchControls(this, this.players.red);
          this.touchControlsBlue = createTouchControls(this, this.players.blue);
        }
      },
    });
  }

  update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.toggleGamePaused();
    }

    if (Phaser.Input.Keyboard.JustDown(this.debugToggleKey)) {
      this.debugOverlay?.toggle();
    }

    this.debugOverlay?.update();
    this.playerState?.update(time);

    if (this.isGamePaused) return;

    const dt = delta / 1000;
    const gate = this.roundGate;

    this.roundPaused = !gate?.isWorldRunning?.() && gate?.getPhase?.() !== 'menu';

    if (gate?.isWorldRunning?.()) {
      if (this.localPlayerId) {
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
    if (!this.localPlayerId) {
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

  handlePlayerInput(player, time) {
    const c = player.controls;
    if (!c) return;

    // ── Network mode: send inputs to server, no local movement ────────────────
    if (this.localPlayerId) {
      if (player.id !== this.localPlayerId) return;

      const w = this.wasdControls;
      const a = this.arrowControls;
      const JD = Phaser.Input.Keyboard.JustDown;

      const tonguePressed = JD(w.tongue) || JD(a.tongue) || this.consumeRightCtrl();
      if (tonguePressed && this.abilities.canFireTongue(player, time)) {
        this.network.sendTongue();
        const dir = dirVector(player.facing);
        const range = GAME_TUNING.abilities.tongueRangeTiles;
        const furthestTile = { col: player.col + dir.x * range, row: player.row + dir.y * range };
        this.actionEffects?.drawTongue?.(player, furthestTile);
        this.actionEffects?.playTongueAnimation?.(player);
      }

      if (time - player.lastMoveTime < this.moveCooldown) return;

      let sent = false;
      let sentDir = null;
      if      (JD(w.up)    || JD(a.up))    { this.network.sendMove('up');    sentDir = 'up';    sent = true; }
      else if (JD(w.down)  || JD(a.down))  { this.network.sendMove('down');  sentDir = 'down';  sent = true; }
      else if (JD(w.left)  || JD(a.left))  { this.network.sendMove('left');  sentDir = 'left';  sent = true; }
      else if (JD(w.right) || JD(a.right)) { this.network.sendMove('right'); sentDir = 'right'; sent = true; }
      if (sent) {
        player.setPupilDirection?.(sentDir);
        player.lastMoveTime = time;
        player.serverPosLocked = false;
        delete player.expectedPullCol;
        delete player.expectedPullRow;
        this.audio?.playJump?.();
      }
      return;
    }

    // ── Local multiplayer mode ─────────────────────────────────────────────────
    const tonguePressed =
      Phaser.Input.Keyboard.JustDown(c.tongue) ||
      (player.controls === this.arrowControls && this.consumeRightCtrl());

    if (tonguePressed && this.abilities.tryTongue(player, time)) {
      this.actionEffects?.playTongueAnimation?.(player);
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
    this.network.connect(`${wsProtocol}//${window.location.host}/ws`, this._pendingRoom);
  }

  _applyServerTick(state) {
    // Apply authoritative player positions
    for (const [id, data] of Object.entries(state.players)) {
      const player = this.players[id];
      if (!player) continue;
      player.facing = data.facing;
      player.state  = data.state;
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
    if (state.pads) {
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
      syncPads(state.pads.blue, this.bluePads);
      syncPads(state.pads.red,  this.redPads);
    }
  }

  endGame(winnerId, scoreState = null) {
    this.gameOver = true;
    this.roundPaused = true;
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
      this.uiOverlay.showGameOver({
        winnerId,
        onRestart: () => {
          if (this.localPlayerId) {
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
