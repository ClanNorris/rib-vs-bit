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

  function createPanel(x, y, width, height, alpha = 0.94) {
    const panel = createTrackedRectangle(x, y, width, height, 0x0b1220, alpha);
    panel.setStrokeStyle(2, 0xfacc15, 0.82);
    return panel;
  }

  function showTitleScreen({ onStart } = {}) {
    clearOverlay();

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                           screen.width < 800;

    const mobileOffset = isMobileDevice ? -210 : 0;
    const mobileBottomOffset = isMobileDevice ? 10 : 0;   // ← your +10px request for TAP + credit

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

    // Background
    createTrackedRectangle(centerX, centerY + mobileOffset, scene.scale.width, scene.scale.height, 0x020617, 0.88);
    createTrackedRectangle(centerX, 30 + mobileOffset, scene.scale.width, 32, 0x020617, 0.96);
    createTrackedRectangle(centerX, 45 + mobileOffset, scene.scale.width, 2, 0xfacc15, 0.95);

    // Gold-edged panel (main box)
    const panelY = centerY - 20 + mobileOffset;
    createPanel(centerX, panelY, 588, 298, 0.88);

    createTrackedRectangle(centerX, centerY - 118 + mobileOffset, 528, 8, 0xfacc15);

    const ribBar = createTrackedRectangle(centerX - 146, centerY - 26 + mobileOffset, 154, 10, 0xef4444);
    const bitBar = createTrackedRectangle(centerX + 146, centerY - 26 + mobileOffset, 154, 10, 0x3b82f6);
    const versusBadge = track(scene.add.circle(centerX, centerY - 26 + mobileOffset, 26, 0x111827));
    versusBadge.setStrokeStyle(3, 0xfacc15, 1);

    const onAirDot = track(scene.add.circle(centerX - 226, centerY - 118 + mobileOffset, 5, 0xef4444));

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
      fontSize: '16px', color
