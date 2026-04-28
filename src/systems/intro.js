import { GAME_HEIGHT, TILE_SIZE, GAME_WIDTH } from '../config/constants.js';

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
          options.y ?? GAME_HEIGHT / 2,
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

  function createPlayerLabel(player) {
    const x = (8 * TILE_SIZE + GAME_WIDTH) / 2;
    const y = player.sprite.y;
    const color = player.id === 'red' ? '#ef4444' : '#3b82f6';
    const text = player.id === 'red' ? '← YOU ARE RIB' : '← YOU ARE BIT';
    return track(
      scene.add
        .text(x, y, text, {
          fontSize: '36px',
          color,
          fontStyle: 'bold',
          stroke: '#111827',
          strokeThickness: 4,
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(10)
    );
  }

  function playRoundIntro({ onComplete, players, showLabels } = {}) {
    clear();

    let ribLabel, bitLabel;

    addTimer(0, () => {
      pulseText('RIB!', '#ef4444');
      if (players && showLabels && scene.localPlayerId) {
        if (scene.localPlayerId === 'red') {
          ribLabel = createPlayerLabel(players.red);
        } else {
          bitLabel = createPlayerLabel(players.blue);
        }
      }
    });

    addTimer(800, () => {
      pulseText('BIT!', '#3b82f6');
    });

    addTimer(1600, () => {
      pulseText('GO!', '#facc15');
      scene.cameras.main.shake(150, 0.005);
      const activeLabel = ribLabel?.active ? ribLabel : bitLabel?.active ? bitLabel : null;
      if (activeLabel) {
        scene.tweens.add({
          targets: activeLabel,
          alpha: 0,
          duration: 400,
          onComplete: () => {
            if (activeLabel.active) activeLabel.destroy();
          },
        });
      }
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