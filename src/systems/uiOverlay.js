// src/systems/uiOverlay.js
import { isMobile } from '../utils/device';

export function createUiOverlaySystem(scene) {
  const managedObjects = new Set();
  const cleanupCallbacks = new Set();
  let destroyed = false;
  let currentTapZone = null;
  let _waitingText = null;
  let _waitingTween = null;
  let _ribReadyCircle = null, _ribReadyText = null;
  let _bitReadyCircle = null, _bitReadyText = null;

  function track(gameObject) {
    if (!gameObject) return gameObject;
    managedObjects.add(gameObject);
    gameObject.once?.('destroy', () => managedObjects.delete(gameObject));
    return gameObject;
  }

  function addCleanup(fn) {
    cleanupCallbacks.add(fn);
    return fn;
  }

  function runCleanupCallbacks() {
    for (const fn of cleanupCallbacks) {
      try { fn(); } catch (e) {}
    }
    cleanupCallbacks.clear();
  }

  function clearOverlay() {
    runCleanupCallbacks();

    if (currentTapZone) {
      currentTapZone.destroy();
      currentTapZone = null;
    }

    for (const obj of managedObjects) {
      scene.tweens.killTweensOf(obj);
      if (obj.active) obj.destroy();
    }
    managedObjects.clear();

    _waitingText = null;
    _waitingTween = null;
    _ribReadyCircle = _ribReadyText = _bitReadyCircle = _bitReadyText = null;
  }

  function createCenteredText(x, y, text, style) {
    return track(scene.add.text(x, y, text, style).setOrigin(0.5).setDepth(10));
  }

  function createTrackedRectangle(x, y, width, height, color, alpha = 1) {
    return track(scene.add.rectangle(x, y, width, height, color, alpha).setDepth(10));
  }

  function createPanel(x, y, width, height, alpha = 0.94) {
    const panel = createTrackedRectangle(x, y, width, height, 0x0b1220, alpha);
    panel.setStrokeStyle(2, 0xfacc15, 0.82);
    return panel;
  }

    function showTitleScreen({ onStart, roomUrl } = {}) {
    clearOverlay();   // clean anything left from before

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    const isMobileDevice = isMobile();
    const mobileOffset = isMobileDevice ? -210 : 0;
    const mobileBottomOffset = isMobileDevice ? 10 : 0;
    const desktopPromptOffset = !isMobileDevice ? 10 : 0;

    // ── Full-screen tap zone ──
    currentTapZone = scene.add.rectangle(centerX, centerY, scene.scale.width, scene.scale.height, 0x000000, 0)
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(1000);

    const startGame = () => {
      if (!onStart) return;
      scene.audio?.initContext?.();  // resume Phaser's AudioContext in the gesture
      onStart();           // triggers RIB BIT GO animation + sound
      clearOverlay();      // immediately removes this tapZone so it can't fire again
    };

    currentTapZone.on('pointerdown', startGame);

    // ── Rest of your visuals (unchanged) ──
    createTrackedRectangle(centerX, centerY + mobileOffset, scene.scale.width, scene.scale.height, 0x020617, 0.88);
    createTrackedRectangle(centerX, 30 + mobileOffset, scene.scale.width, 32, 0x020617, 0.96);
    createTrackedRectangle(centerX, 45 + mobileOffset, scene.scale.width, 2, 0xfacc15, 0.95);

    const panelY = centerY - 20 + mobileOffset;
    createPanel(centerX, panelY, 588, 298, 0.88);

    createTrackedRectangle(centerX, centerY - 118 + mobileOffset, 528, 8, 0xfacc15);

    const ribBar = createTrackedRectangle(centerX - 146, centerY - 26 + mobileOffset, 154, 10, 0xef4444);
    const bitBar = createTrackedRectangle(centerX + 146, centerY - 26 + mobileOffset, 154, 10, 0x3b82f6);
    const versusBadge = track(scene.add.circle(centerX, centerY - 26 + mobileOffset, 26, 0x111827).setDepth(10));
    versusBadge.setStrokeStyle(3, 0xfacc15, 1);

    const onAirDot = track(scene.add.circle(centerX - 226, centerY - 118 + mobileOffset, 5, 0xef4444).setDepth(10));

    createCenteredText(centerX - 184, centerY - 118 + mobileOffset, 'ON AIR', {
      fontSize: '14px', color: '#fee2e2', fontStyle: 'bold', stroke: '#4A4A4A', strokeThickness: 2, letterSpacing: 1.4,
    });
    createCenteredText(centerX + 168, centerY - 118 + mobileOffset, 'FROGWAY ARENA', {
      fontSize: '14px', color: '#fee2e2', fontStyle: 'bold', stroke: '#4A4A4A', strokeThickness: 2, letterSpacing: 1.4,
    });

    createCenteredText(centerX - 182, centerY - 58 + mobileOffset, 'RIB', {
      fontSize: '44px', color: '#fee2e2', fontStyle: 'bold', stroke: '#7f1d1d', strokeThickness: 5,
    });
    createCenteredText(centerX + 182, centerY - 58 + mobileOffset, 'BIT', {
      fontSize: '44px', color: '#dbeafe', fontStyle: 'bold', stroke: '#1e3a8a', strokeThickness: 5,
    });

    createCenteredText(centerX, centerY - 26 + mobileOffset, 'VS', {
      fontSize: '18px', color: '#f8fafc', fontStyle: 'bold',
    });

    createCenteredText(centerX, centerY + 22 + mobileOffset, 'RIB vs BIT', {
      fontSize: '56px', color: '#f8fafc', fontStyle: 'bold', stroke: '#111827', strokeThickness: 6,
    });

    createCenteredText(centerX, centerY + 72 + mobileOffset, 'Broadcast Match Presentation', {
      fontSize: '22px', color: '#cbd5e1', fontStyle: 'bold',
    });

    createCenteredText(centerX, centerY + 100 + mobileOffset, 'FIRST TO 3 CAPTURES', {
      fontSize: '16px', color: '#facc15', fontStyle: 'bold', letterSpacing: 1.5,
    });

    const promptText = isMobileDevice ? 'TAP ANYWHERE TO START' : 'PRESS ANY KEY TO START';
    const promptY = centerY + 144 + mobileOffset + (isMobileDevice ? mobileBottomOffset : desktopPromptOffset);

    const promptBox = createTrackedRectangle(centerX, promptY, 292, 40, 0x111827, 0.95);
    promptBox.setStrokeStyle(1.5, 0xfacc15, 0.92);

    const prompt = createCenteredText(centerX, promptY, promptText, {
      fontSize: '20px', color: '#facc15', fontStyle: 'bold'
    });

    scene.tweens.add({ targets: [prompt, promptBox], alpha: 0.45, yoyo: true, repeat: -1, duration: 700 });

    createCenteredText(centerX, centerY + 185 + mobileOffset + mobileBottomOffset, 'an 8-Bit Twist by Eric Norris', {
      fontSize: '14px', color: '#94a3b8', fontStyle: 'bold', fontFamily: 'monospace', letterSpacing: 2,
    });

    if (roomUrl) {
      const shareBaseY = centerY + 210 + mobileOffset + mobileBottomOffset;
      const shareRowY  = centerY + 232 + mobileOffset + mobileBottomOffset;

      createCenteredText(centerX, shareBaseY, 'SHARE THIS LINK', {
        fontSize: '11px', color: '#64748b', fontStyle: 'bold', letterSpacing: 2,
      });

      // URL box (left portion of row)
      const urlBoxX = centerX - 44;
      const urlBg = createTrackedRectangle(urlBoxX, shareRowY, 400, 28, 0x0f172a, 0.95);
      urlBg.setStrokeStyle(1, 0x334155, 1);
      createCenteredText(urlBoxX, shareRowY, roomUrl, {
        fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace',
      });

      // Copy button (right portion of row) — must be above the tap zone (depth 1000)
      const copyBtnX = centerX + 204;
      const copyBg = createTrackedRectangle(copyBtnX, shareRowY, 80, 28, 0x172554, 0.95);
      copyBg.setStrokeStyle(1, 0x3b82f6, 0.7);
      copyBg.setInteractive({ useHandCursor: true });
      copyBg.setDepth(1001);
      const copyTxt = createCenteredText(copyBtnX, shareRowY, 'Copy', {
        fontSize: '12px', color: '#60a5fa', fontStyle: 'bold',
      });
      copyTxt.setDepth(1002);

      copyBg.on('pointerover', () => copyBg.setFillStyle(0x1e3a8a, 0.95));
      copyBg.on('pointerout',  () => copyBg.setFillStyle(0x172554, 0.95));
      copyBg.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        navigator.clipboard?.writeText(roomUrl).catch(() => {});
        copyTxt.setText('Copied!');
        scene.time.delayedCall(1500, () => { if (copyTxt.active) copyTxt.setText('Copy'); });
      });
    }

    // Desktop keyboard fallback
    const keyHandler = () => startGame();
    scene.input.keyboard.once('keydown', keyHandler);
    addCleanup(() => scene.input.keyboard.off('keydown', keyHandler));
  }

  function showWaitingMessage() {
    if (destroyed || _waitingText) return;

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;
    const isMobileDevice = isMobile();
    const mobileOffset = isMobileDevice ? -210 : 0;

    const waitY = centerY - 100 + mobileOffset;

    _waitingText = track(scene.add.text(centerX, waitY, '● Waiting for opponent...', {
      fontSize: '14px', color: '#facc15', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11));

    _waitingTween = scene.tweens.add({
      targets: _waitingText,
      alpha: 0.3,
      yoyo: true,
      repeat: -1,
      duration: 700,
    });
  }

  function hideWaitingMessage() {
    if (_waitingTween) {
      if (_waitingText) scene.tweens.killTweensOf(_waitingText);
      _waitingTween = null;
    }
    if (_waitingText?.active) _waitingText.destroy();
    managedObjects.delete(_waitingText);
    _waitingText = null;
  }

  function showGameOver({ winnerId, onRestart } = {}) {
    clearOverlay();

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    const winnerName = winnerId === 'red' ? 'RIB' : 'BIT';
    const winnerColor = winnerId === 'red' ? 0xef4444 : 0x3b82f6;
    const winnerTextColor = winnerId === 'red' ? '#fee2e2' : '#dbeafe';
    const winnerStroke = winnerId === 'red' ? '#7f1d1d' : '#1e3a8a';
    const ribScore = scene.players?.red?.score ?? 0;
    const bitScore = scene.players?.blue?.score ?? 0;

    const isMobileDevice = isMobile();
    const mobileWinOffset = isMobileDevice ? -210 : 0;

    const tapZone = scene.add.rectangle(centerX, centerY, scene.scale.width, scene.scale.height, 0x000000, 0)
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(1000);

    createTrackedRectangle(centerX, centerY + mobileWinOffset, scene.scale.width, scene.scale.height, 0x020617, 0.96);
    createTrackedRectangle(centerX, 30 + mobileWinOffset, scene.scale.width, 32, 0x020617, 0.98);
    createTrackedRectangle(centerX, 45 + mobileWinOffset, scene.scale.width, 2, 0xfacc15, 0.95);

    const panelY = centerY - 20 + mobileWinOffset;
    createPanel(centerX, panelY, 588, 334, 0.94);

    createTrackedRectangle(centerX, centerY - 130 + mobileWinOffset, 528, 8, 0xfacc15);

    const winnerBar = createTrackedRectangle(centerX, centerY - 64 + mobileWinOffset, 232, 12, winnerColor);
    const onAirDot = track(scene.add.circle(centerX - 226, centerY - 130 + mobileWinOffset, 5, 0xef4444).setDepth(10));

    createCenteredText(centerX - 160, centerY - 130 + mobileWinOffset, 'FINAL RESULT', {
      fontSize: '14px', color: '#fee2e2', fontStyle: 'bold', stroke: '#4A4A4A', strokeThickness: 2, letterSpacing: 1.4,
    });
    createCenteredText(centerX + 168, centerY - 130 + mobileWinOffset, 'FROGWAY ARENA', {
      fontSize: '14px', color: '#fee2e2', fontStyle: 'bold', stroke: '#4A4A4A', strokeThickness: 2, letterSpacing: 1.4,
    });

    const title = createCenteredText(centerX, centerY - 18 + mobileWinOffset, 'RIB vs BIT', {
      fontSize: '52px', color: '#f8fafc', fontStyle: 'bold', stroke: '#111827', strokeThickness: 6,
    });

    createCenteredText(centerX, centerY + 36 + mobileWinOffset, `${winnerName} WINS`, {
      fontSize: '30px', color: winnerTextColor, fontStyle: 'bold', stroke: winnerStroke, strokeThickness: 5,
    });

    createCenteredText(centerX, centerY + 72 + mobileWinOffset, `FINAL SCORE ${ribScore} - ${bitScore}`, {
      fontSize: '18px', color: '#facc15', fontStyle: 'bold', letterSpacing: 1.2,
    });
    createCenteredText(centerX, centerY + 102 + mobileWinOffset, 'Broadcast concluded', {
      fontSize: '18px', color: '#cbd5e1', fontStyle: 'bold',
    });

    scene.tweens.add({ targets: [title, winnerBar], scaleX: 1.06, scaleY: 1.06, yoyo: true, repeat: -1, duration: 850, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: onAirDot, alpha: 0.25, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.inOut' });

    const restartY = centerY + 174 + mobileWinOffset;

    if (scene.localPlayerId) {
      // Network mode: both players must ready up before the match restarts
      let localReady = false;
      const doReady = () => {
        if (localReady) return;
        localReady = true;
        onRestart?.();
      };
      tapZone.on('pointerdown', doReady);

      createCenteredText(centerX, restartY - 36, isMobileDevice ? 'TAP WHEN READY' : 'PRESS R WHEN READY', {
        fontSize: '16px', color: '#94a3b8', fontStyle: 'bold',
      });

      _ribReadyCircle = track(
        scene.add.circle(centerX - 72, restartY - 8, 9, 0xef4444, 0)
          .setStrokeStyle(2, 0xef4444, 1).setDepth(10)
      );
      _ribReadyText = track(
        scene.add.text(centerX - 56, restartY - 8, 'Rib ready?', {
          fontSize: '20px', color: '#ef4444', fontStyle: 'bold',
        }).setOrigin(0, 0.5).setDepth(10)
      );

      _bitReadyCircle = track(
        scene.add.circle(centerX - 72, restartY + 24, 9, 0x3b82f6, 0)
          .setStrokeStyle(2, 0x3b82f6, 1).setDepth(10)
      );
      _bitReadyText = track(
        scene.add.text(centerX - 56, restartY + 24, 'Bit ready?', {
          fontSize: '20px', color: '#3b82f6', fontStyle: 'bold',
        }).setOrigin(0, 0.5).setDepth(10)
      );

      const readyHandler = () => { if (!destroyed) doReady(); };
      scene.input.keyboard.once('keydown-R', readyHandler);
      addCleanup(() => scene.input.keyboard.off('keydown-R', readyHandler));

    } else {
      // Local mode: either player pressing R or tapping restarts immediately
      tapZone.on('pointerdown', () => onRestart?.());

      const restartTextStr = isMobileDevice ? 'TAP ANYWHERE TO RESTART' : 'PRESS R TO RESTART';
      const restartWidth = isMobileDevice ? 340 : 280;

      const restartBox = createTrackedRectangle(centerX, restartY, restartWidth, 40, 0x111827, 0.95);
      restartBox.setStrokeStyle(1.5, 0xfacc15, 0.92);
      const restartText = createCenteredText(centerX, restartY, restartTextStr, {
        fontSize: '20px', color: '#facc15', fontStyle: 'bold',
      });
      scene.tweens.add({ targets: [restartBox, restartText], alpha: 0.45, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });

      const restartHandler = () => { if (destroyed) return; onRestart?.(); };
      scene.input.keyboard.once('keydown-R', restartHandler);
      addCleanup(() => scene.input.keyboard.off('keydown-R', restartHandler));
    }
  }

  function updateReadyState(playerId) {
    const isRib = playerId === 'red';
    const circle = isRib ? _ribReadyCircle : _bitReadyCircle;
    const text   = isRib ? _ribReadyText   : _bitReadyText;
    if (!circle?.active || !text?.active) return;
    circle.setFillStyle(isRib ? 0xef4444 : 0x3b82f6, 1);
    text.setText(isRib ? 'Rib ready!' : 'Bit ready!');
  }

  function destroy() {
    destroyed = true;
    clearOverlay();
  }

  return {
    showTitleScreen,
    showWaitingMessage,
    hideWaitingMessage,
    showGameOver,
    updateReadyState,
    clearOverlay,
    hideOverlay: clearOverlay,
    isShowingOverlay: () => managedObjects.size > 0,
    destroy,
  };
}
