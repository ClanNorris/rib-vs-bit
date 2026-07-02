import { dirVector } from './helpers';
import { GAME_TUNING } from '../config/gameTuning';

export function createActionEffectsSystem(scene) {
  const managedObjects = new Set();
  let destroyed = false;

  const tongueGfxRed  = scene.add.graphics().setDepth(10);
  const tongueGfxBlue = scene.add.graphics().setDepth(10);

  function track(gameObject) {
    if (!gameObject) return gameObject;
    managedObjects.add(gameObject);
    gameObject.once?.('destroy', () => managedObjects.delete(gameObject));
    return gameObject;
  }

  function clearTongue() {
    tongueGfxRed.clear();
    tongueGfxBlue.clear();
  }

  function drawTongue(attacker, targetTile) {
    if (destroyed) return;

    const gfx = attacker.id === 'red' ? tongueGfxRed : tongueGfxBlue;

    const startX = attacker.sprite?.x ?? scene.centerX(attacker.col);
    const startY = attacker.sprite?.y ?? scene.centerY(attacker.row);
    const rawTiles = Math.abs(targetTile.col - attacker.col) + Math.abs(targetTile.row - attacker.row);
    const tiles = Math.min(rawTiles, GAME_TUNING.abilities.tongueRangeTiles);
    const dir = dirVector(attacker.facing);
    const endX = startX + dir.x * tiles * scene.tileSize;
    const endY = startY + dir.y * tiles * scene.tileSize;
    const tongueColor = attacker.id === 'red' ? 0xfda4af : 0x93c5fd;

    gfx.clear();

    gfx.lineStyle(GAME_TUNING.abilities.tongueLineWidth, tongueColor, 1);
    gfx.beginPath();
    gfx.moveTo(startX, startY);
    gfx.lineTo(endX, endY);
    gfx.strokePath();

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
        gfx.clear();
        if (tip.active) tip.destroy();
        if (pulse.active) pulse.destroy();
      },
    });
  }

  function playTongueAnimation(player) {
    if (destroyed) return;

    const TONGUE_LENGTH = 144; // 3 tiles × 48px
    const TONGUE_WIDTH  = 6;
    const BODY_RADIUS   = scene.tileSize * 0.28;
    const TONGUE_COLOR  = player.id === 'red' ? 0xfda4af : 0x93c5fd;
    const DEPTH         = 20;

    const dirMap = {
      up:    { dx:  0, dy: -1, isH: false, ox: 0.5, oy: 1,   rot: -Math.PI / 2 },
      down:  { dx:  0, dy:  1, isH: false, ox: 0.5, oy: 0,   rot:  Math.PI / 2 },
      left:  { dx: -1, dy:  0, isH: true,  ox: 1,   oy: 0.5, rot:  Math.PI     },
      right: { dx:  1, dy:  0, isH: true,  ox: 0,   oy: 0.5, rot:  0           },
    };
    const dir = dirMap[player.facing] ?? dirMap.right;

    const mouthX = player.sprite.x;
    const mouthY = player.sprite.y;

    const mouthGfx = scene.add.graphics();
    mouthGfx.setPosition(mouthX, mouthY);
    mouthGfx.setDepth(DEPTH);
    mouthGfx.setScrollFactor(0);

    mouthGfx.fillStyle(0x1a1a2e, 1);
    mouthGfx.fillRoundedRect(-7, -4, 14, 8, 2);

    mouthGfx.fillStyle(0xffffff, 1);
    mouthGfx.fillRect(-6, -4, 4, 4);
    mouthGfx.fillRect(0, -4, 4, 4);

    const tongueW    = dir.isH ? TONGUE_LENGTH : TONGUE_WIDTH;
    const tongueH    = dir.isH ? TONGUE_WIDTH  : TONGUE_LENGTH;
    const scaleProp  = dir.isH ? 'scaleX'      : 'scaleY';
    const initScaleX = dir.isH ? 0 : 1;
    const initScaleY = dir.isH ? 1 : 0;

    const tongueRect = scene.add.rectangle(mouthX, mouthY, tongueW, tongueH, TONGUE_COLOR);
    tongueRect.setOrigin(dir.ox, dir.oy);
    tongueRect.setScale(initScaleX, initScaleY);
    tongueRect.setDepth(DEPTH - 1);
    tongueRect.setScrollFactor(0);

    track(mouthGfx);
    track(tongueRect);

    scene.tweens.add({
      targets: tongueRect,
      [scaleProp]: 1,
      duration: 100,
      ease: 'Linear',
      onComplete: () => {
        scene.time.delayedCall(50, () => {
          scene.tweens.add({
            targets: tongueRect,
            [scaleProp]: 0,
            duration: 100,
            ease: 'Linear',
            onComplete: () => {
              if (mouthGfx.active)   mouthGfx.destroy();
              if (tongueRect.active) tongueRect.destroy();
            },
          });
        });
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
    tongueGfxRed.destroy();
    tongueGfxBlue.destroy();
  }

  return {
    drawTongue,
    clearTongue,
    playTongueAnimation,
    destroy,
  };
}