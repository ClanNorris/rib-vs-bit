export function createIntroSystem(scene, { audio, announcer } = {}) {
  const managedObjects = new Set();
  const activeTimers = new Set();
  let destroyed = false;

  function track(gameObject) {
    if (!gameObject) return gameObject;
    managedObjects.add(gameObject);
    gameObject.once?.('destroy', () => managedObjects.delete(gameObject));
    return gameObject;
  }

  function addTimer(delay, callback) {
    const timer = scene.time.delayedCall(delay, () => {
      activeTimers.delete(timer);
      if (!destroyed) {
        callback();
      }
    });

    activeTimers.add(timer);
    return timer;
  }

  function clearTimers() {
    for (const timer of activeTimers) {
      timer.remove(false);
    }
    activeTimers.clear();
  }

  function clearObjects() {
    for (const gameObject of managedObjects) {
      scene.tweens.killTweensOf(gameObject);
      if (gameObject.active) {
        gameObject.destroy();
      }
    }
    managedObjects.clear();
  }

  function clear() {
    clearTimers();
    clearObjects();
  }

  function pulseText(text, color, options = {}) {
    const message = track(
      scene.add
        .text(
          options.x ?? scene.scale.width / 2,
          options.y ?? scene.scale.height / 2,
          text,
          {
            fontSize: options.fontSize ?? '48px',
            color,
            fontStyle: 'bold',
            stroke: '#111827',
            strokeThickness: options.strokeThickness ?? 6,
            align: 'center',
          }
        )
        .setOrigin(0.5)
    );

    message.setScale(options.startScale ?? 0.85);
    message.setAlpha(1);

    scene.tweens.add({
      targets: message,
      scaleX: options.endScale ?? 1.3,
      scaleY: options.endScale ?? 1.3,
      alpha: 0,
      duration: options.duration ?? 800,
      ease: options.ease ?? 'Cubic.Out',
      onComplete: () => {
        if (message.active) {
          message.destroy();
        }
      },
    });

    return message;
  }

  function playRoundIntro({ onComplete } = {}) {
    clear();

    addTimer(0, () => {
      pulseText('RIB!', '#ef4444');
      audio?.playTone(440, 0.08, 'square', 0.05);
    });

    addTimer(800, () => {
      pulseText('BIT!', '#3b82f6');
      audio?.playTone(520, 0.08, 'square', 0.05);
    });

    addTimer(1600, () => {
      pulseText('GO!', '#facc15');
      audio?.playTone(660, 0.12, 'square', 0.07);
      scene.cameras.main.shake(150, 0.005);
    });

    addTimer(2400, () => {
      announcer?.showStatus('MAKE YOUR MOVE!');
      onComplete?.();
    });
  }

  function destroy() {
    destroyed = true;
    clear();
  }

  return {
    playRoundIntro,
    clear,
    destroy,
  };
}