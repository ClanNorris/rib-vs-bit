import { clamp } from './helpers';
import { GAME_TUNING } from '../config/gameTuning';

export function createActionEffectsSystem(scene) {
  const managedObjects = new Set();
  let destroyed = false;

  const tongueGraphics = scene.add.graphics();

  function track(gameObject) {
    if (!gameObject) return gameObject;
    managedObjects.add(gameObject);
    gameObject.once?.('destroy', () => managedObjects.delete(gameObject));
    return gameObject;
  }

  function clearTongue() {
    tongueGraphics.clear();
  }

  function drawTongue(attacker, targetTile) {
    if (destroyed) return;

    const startX = scene.centerX(attacker.col);
    const startY = scene.centerY(attacker.row);
    const endX = scene.centerX(clamp(targetTile.col, 0, scene.cols - 1));
    const endY = scene.centerY(clamp(targetTile.row, 0, scene.rowTypes.BOTTOM_PADS));
    const tongueColor = attacker.id === 'red' ? 0xfda4af : 0x93c5fd;

    clearTongue();

    tongueGraphics.lineStyle(GAME_TUNING.abilities.tongueLineWidth, tongueColor, 1);
    tongueGraphics.beginPath();
    tongueGraphics.moveTo(startX, startY);
    tongueGraphics.lineTo(endX, endY);
    tongueGraphics.strokePath();

    const tip = track(
      scene.add.circle(endX, endY, GAME_TUNING.abilities.tongueTipRadius, tongueColor)
    );
    const pulse = track(
      scene.add.circle(endX, endY, GAME_TUNING.abilities.tonguePulseRadius, 0xffffff, 0.9)
    );

    scene.tweens.add({
      targets: [tip, pulse],
      scaleX: GAME_TUNING.abilities.tongueTipScale,
      scaleY: GAME_TUNING.abilities.tongueTipScale,
      alpha: 0,
      duration: GAME_TUNING.abilities.tongueFxDurationMs,
      ease: 'Quad.out',
      onComplete: () => {
        clearTongue();
        if (tip.active) tip.destroy();
        if (pulse.active) pulse.destroy();
      },
    });
  }

  function destroy() {
    destroyed = true;
    clearTongue();

    for (const gameObject of managedObjects) {
      scene.tweens.killTweensOf(gameObject);
      if (gameObject.active) {
        gameObject.destroy();
      }
    }

    managedObjects.clear();
    tongueGraphics.destroy();
  }

  return {
    drawTongue,
    clearTongue,
    destroy,
  };
}