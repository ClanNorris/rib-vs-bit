// src/systems/uiOverlay.js
export function createUiOverlaySystem(scene) {
  const managedObjects = new Set();
  const cleanupCallbacks = new Set();
  let destroyed = false;

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
    for (const obj of managedObjects) {
      scene.tweens.killTweensOf(obj);
      if (obj.active) obj.destroy();
    }
    managedObjects.clear();
  }

  function createCenteredText(x, y, text, style) {
    return track(scene.add.text(x, y, text, style).setOrigin(0.5));
  }

  function createTrackedRectangle(x, y, width, height, color, alpha = 1) {
    return track(scene.add.rectangle(x, y, width, height, color, alpha));
  }

  function createPanel(width, height, alpha = 0.94) {
    const panel = createTrackedRectangle(
      scene.scale.width / 2,
      scene.scale.height / 2,
      width,
      height,
      0x0b1220,
      alpha
    );
    panel.setStrokeStyle(2, 0xfacc15, 0.82);
    return panel;
  }

  function showTitleScreen({ onStart } = {}) {
    clearOverlay();

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                           screen.width < 800;

    const mobileTitleOffset = isMobileDevice ? -155 : 0;

    const tapZone = scene.add.rectangle(centerX, centerY, scene.scale.width, scene.scale.height, 0x000000, 0)
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(1000);

    const startGame = () => {
      scene.audio?.unlock();
      if (onStart) onStart();
      clearOverlay();
    };

    tapZone.on('pointerdown', startGame);

    createTrackedRectangle(centerX, centerY + mobileTitleOffset, scene.scale.width, scene.scale.height, 0x020617, 0.88);
    createTrackedRectangle(centerX, 30 + mobileTitleOffset, scene.scale.width, 32, 0x020617, 0.96);
    createTrackedRectangle(centerX, 45 + mobileTitleOffset, scene.scale.width, 2, 0xfacc15, 0.95);
    createPanel(588, 298, 0.88);
    createTrackedRectangle(centerX, centerY - 118 + mobileTitleOffset, 528, 8, 0xfacc15);

    const ribBar = createTrackedRectangle(centerX - 146, centerY - 26 + mobileTitleOffset, 154, 10, 0xef4444);
    const bitBar = createTrackedRectangle(centerX + 146, centerY - 26 + mobileTitleOffset, 154, 10, 0x3b82f6);
    const versusBadge = track(scene.add.circle(centerX, centerY - 26 + mobileTitleOffset, 26, 0x111827));
    versusBadge.setStrokeStyle(3, 0xfacc15, 1);

    const onAirDot = track(scene.add.circle(centerX - 226, centerY - 118 + mobileTitleOffset, 5, 0xef4444));

    createCenteredText(centerX - 184, centerY - 118 + mobileTitleOffset, 'ON AIR', {
      fontSize: '14px',
      color: '#fee2e2',
      fontStyle: 'bold',
      stroke: '#4A4A4A',
      strokeThickness: 2,
      letterSpacing: 1.4,
    });

    createCenteredText(centerX + 168, centerY - 118 + mobileTitleOffset, 'FROGWAY ARENA', {
      fontSize: '14px',
      color: '#fee2e2',
      fontStyle: 'bold',
      stroke: '#4A4A4A',
      strokeThickness: 2,
      letterSpacing: 1.4,
    });

    createCenteredText(centerX - 182, centerY - 58 + mobileTitleOffset, 'RIB', {
      fontSize: '44px',
      color: '#fee2e2',
      fontStyle: 'bold',
      stroke: '#7f1d1d',
      strokeThickness: 5,
    });

    createCenteredText(centerX + 182, centerY - 58 + mobileTitleOffset, 'BIT', {
      fontSize: '44px',
      color: '#dbeafe',
      fontStyle: 'bold',
      stroke: '#1e3a8a',
      strokeThickness: 5,
    });

    createCenteredText(centerX, centerY - 26 + mobileTitleOffset, 'VS', {
      fontSize: '18px',
      color: '#f8fafc',
      fontStyle: 'bold',
    });

    createCenteredText(centerX, centerY + 22 + mobileTitleOffset, 'RIB vs BIT', {
      fontSize: '56px',
      color: '#f8fafc',
      fontStyle: 'bold',
      stroke: '#111827',
      strokeThickness: 6,
    });

    createCenteredText(centerX, centerY + 72 + mobileTitleOffset, 'Broadcast Match Presentation', {
      fontSize: '22px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    });

    createCenteredText(centerX, centerY + 100 + mobileTitleOffset, 'FIRST TO 3 CAPTURES', {
      fontSize: '16px',
      color: '#facc15',
      fontStyle: 'bold',
      letterSpacing: 1.5,
    });

    createCenteredText(centerX, centerY + 185 + mobileTitleOffset, 'an 8-Bit Twist by Eric Norris', {
      fontSize: '14px',
      color: '#94a3b8',
      fontStyle: 'bold',
      fontFamily: 'monospace',
      letterSpacing: 2,
    });

    const promptText = isMobileDevice ? 'TAP ANYWHERE TO START' : 'PRESS ANY KEY TO START';
    const promptBox = createTrackedRectangle(centerX, centerY + 144 + mobileTitleOffset, 292, 40, 0x111827, 0.95);
    promptBox.setStrokeStyle(1.5, 0xfacc15, 0.92);

    const prompt = createCenteredText(centerX, centerY + 144 + mobileTitleOffset, promptText, {
      fontSize: '20px',
      color: '#facc15',
      fontStyle: 'bold'
    });

    scene.tweens.add({
      targets: [prompt, promptBox],
      alpha: 0.45,
      yoyo: true,
      repeat: -1,
      duration: 700,
    });

    const keyHandler = () => startGame();
    scene.input.keyboard.once('keydown', keyHandler);

    addCleanup(() => {
      tapZone.destroy();
      scene.input.keyboard.off('keydown', keyHandler);
    });
  }

  function showGameOver({ winnerId, onRestart } = {}) {
    clearOverlay();

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                           screen.width < 800;

    // Mobile win screen shift: pull everything up so it sits nicely above the D-Pad / HUD
    const mobileWinOffset = isMobileDevice ? -120 : 0;   // ← This is the main adjustment

    const tapZone = scene.add.rectangle(centerX, centerY, scene.scale.width, scene.scale.height, 0x000000, 0)
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(1000);

    const doRestart = () => {
      scene.audio?.unlock();
      onRestart?.();
    };

    tapZone.on('pointerdown', doRestart);

    // ── Win overlay visuals (shifted upward on mobile) ──
    createTrackedRectangle(centerX, centerY + mobileWinOffset, scene.scale.width, scene.scale.height, 0x020617, 0.84);
    createTrackedRectangle(centerX, 30 + mobileWinOffset, scene.scale.width, 32, 0x020617, 0.96);
    createTrackedRectangle(centerX, 45 + mobileWinOffset, scene.scale.width, 2, 0xfacc15, 0.95);
    createPanel(588, 334, 0.89);
    createTrackedRectangle(centerX, centerY - 130 + mobileWinOffset, 528, 8, 0xfacc15);

    const winnerBar = createTrackedRectangle(centerX, centerY - 64 + mobileWinOffset, 232, 12, winnerColor);
    const onAirDot = track(scene.add.circle(centerX - 226, centerY - 130 + mobileWinOffset, 5, 0xef4444));

    createCenteredText(centerX - 160, centerY - 130 + mobileWinOffset, 'FINAL RESULT', {
      fontSize: '14px',
      color: '#fee2e2',
      fontStyle: 'bold',
      stroke: '#4A4A4A',
      strokeThickness: 2,
      letterSpacing: 1.4,
    });
    createCenteredText(centerX + 168, centerY - 130 + mobileWinOffset, 'FROGWAY ARENA', {
      fontSize: '14px',
      color: '#fee2e2',
      fontStyle: 'bold',
      stroke: '#4A4A4A',
      strokeThickness: 2,
      letterSpacing: 1.4,
    });

    const title = createCenteredText(centerX, centerY - 18 + mobileWinOffset, 'RIB vs BIT', {
      fontSize: '52px',
      color: '#f8fafc',
      fontStyle: 'bold',
      stroke: '#111827',
      strokeThickness: 6,
    });

    createCenteredText(centerX, centerY + 36 + mobileWinOffset, `${winnerName} WINS`, {
      fontSize: '30px',
      color: winnerTextColor,
      fontStyle: 'bold',
      stroke: winnerStroke,
      strokeThickness: 5,
    });

    createCenteredText(centerX, centerY + 72 + mobileWinOffset, `FINAL SCORE ${ribScore} - ${bitScore}`, {
      fontSize: '18px',
      color: '#facc15',
      fontStyle: 'bold',
      letterSpacing: 1.2,
    });
    createCenteredText(centerX, centerY + 102 + mobileWinOffset, 'Broadcast concluded', {
      fontSize: '18px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    });

    const restartBox = createTrackedRectangle(centerX, centerY + 148 + mobileWinOffset, 250, 40, 0x111827, 0.95);
    restartBox.setStrokeStyle(1.5, 0xfacc15, 0.92);
    const restartText = createCenteredText(centerX, centerY + 148 + mobileWinOffset, 'TAP ANYWHERE TO RESTART', {
      fontSize: '20px',
      color: '#facc15',
      fontStyle: 'bold',
    });

    scene.tweens.add({
      targets: [title, winnerBar],
      scaleX: 1.06,
      scaleY: 1.06,
      yoyo: true,
      repeat: -1,
      duration: 850,
      ease: 'Sine.inOut',
    });
    scene.tweens.add({
      targets: [restartBox, restartText],
      alpha: 0.45,
      yoyo: true,
      repeat: -1,
      duration: 700,
      ease: 'Sine.inOut',
    });
    scene.tweens.add({
      targets: onAirDot,
      alpha: 0.25,
      yoyo: true,
      repeat: -1,
      duration: 650,
      ease: 'Sine.inOut',
    });

    // Desktop keyboard fallback
    const restartHandler = () => {
      if (destroyed) return;
      console.log('[Audio] R-key gesture → unlocking audio for new round');
      scene.audio?.unlock();
      onRestart?.();
    };
    scene.input.keyboard.once('keydown-R', restartHandler);
    addCleanup(() => {
      scene.input.keyboard.off('keydown-R', restartHandler);
    });
  }

  function destroy() {
    destroyed = true;
    clearOverlay();
  }

  return {
    showTitleScreen,
    showGameOver,
    clearOverlay,
    hideOverlay: clearOverlay,
    isShowingOverlay: () => managedObjects.size > 0,
    destroy,
  };
}
