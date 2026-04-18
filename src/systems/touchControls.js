// src/systems/touchControls.js
import { isMobile } from '../utils/device';

export function createTouchControls(scene, player) {
  if (!isMobile()) return { destroy: () => {} };

  const arrowColor = player.id === 'red' ? 0xef4444 : 0x3b82f6;
  const dpadX = player.id === 'red' ? 110 : scene.scale.width - 110;
  const dpadY = scene.scale.height - 190;
  const arrowSize = 78;

  const tongueOffset = 165;
  const tongueX = player.id === 'red' ? dpadX + tongueOffset : dpadX - tongueOffset;
  const tongueY = scene.scale.height - 65;

  const managed = [];

  const track = (obj) => {
    if (obj) managed.push(obj);
    return obj;
  };

  const create8BitArrow = (x, y, direction) => {
    const g = track(scene.add.graphics().setScrollFactor(0).setDepth(20000));
    g.fillStyle(arrowColor, 1);
    g.lineStyle(8, 0x000000, 1);

    const s = arrowSize / 2;

    if (direction === 'up') {
      g.fillTriangle(x, y - s, x - s, y + s, x + s, y + s);
      g.strokeTriangle(x, y - s, x - s, y + s, x + s, y + s);
    } else if (direction === 'down') {
      g.fillTriangle(x, y + s, x - s, y - s, x + s, y - s);
      g.strokeTriangle(x, y + s, x - s, y - s, x + s, y - s);
    } else if (direction === 'left') {
      g.fillTriangle(x - s, y, x + s, y - s, x + s, y + s);
      g.strokeTriangle(x - s, y, x + s, y - s, x + s, y + s);
    } else if (direction === 'right') {
      g.fillTriangle(x + s, y, x - s, y - s, x - s, y + s);
      g.strokeTriangle(x + s, y, x - s, y - s, x - s, y + s);
    }

    const hitZone = track(
      scene.add.rectangle(x, y, arrowSize * 1.4, arrowSize * 1.4, 0xffffff, 0)
        .setScrollFactor(0)
        .setDepth(20001)
        .setInteractive()
    );

    hitZone.on('pointerdown', () => {
      let dx = 0, dy = 0, facing = 'up';
      if (direction === 'up')    { dy = -1; facing = 'up'; }
      if (direction === 'down')  { dy = 1;  facing = 'down'; }
      if (direction === 'left')  { dx = -1; facing = 'left'; }
      if (direction === 'right') { dx = 1;  facing = 'right'; }

      scene.movement.tryMove(player, dx, dy, facing);

      g.y = 4;
      scene.time.delayedCall(90, () => { if (g.active) g.y = 0; });
    });
  };

  // Create D-Pad
  create8BitArrow(dpadX, dpadY - arrowSize * 0.9, 'up');
  create8BitArrow(dpadX, dpadY + arrowSize * 0.9, 'down');
  create8BitArrow(dpadX - arrowSize * 0.9, dpadY, 'left');
  create8BitArrow(dpadX + arrowSize * 0.9, dpadY, 'right');

  // Create tongue button
  const tongueCircle = track(scene.add.graphics().setScrollFactor(0).setDepth(20000));
  tongueCircle.fillStyle(arrowColor, 1);
  tongueCircle.lineStyle(8, 0x000000, 1);
  tongueCircle.fillCircle(tongueX, tongueY, 42);
  tongueCircle.strokeCircle(tongueX, tongueY, 42);

  const tongueText = track(
    scene.add.text(tongueX, tongueY, 'T', {
      fontSize: '42px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20001)
  );

  const tongueHit = track(
    scene.add.rectangle(tongueX, tongueY, 90, 90, 0xffffff, 0)
      .setScrollFactor(0)
      .setDepth(20002)
      .setInteractive()
  );

  tongueHit.on('pointerdown', () => {
    scene.abilities.tryTongue(player, scene.time.now);

    tongueCircle.y = 4;
    tongueText.y = tongueY + 4;
    scene.time.delayedCall(90, () => {
      if (tongueCircle.active) tongueCircle.y = 0;
      if (tongueText.active) tongueText.y = tongueY;
    });
  });

  // Real destroy function (used by MainScene on restart)
  function destroy() {
    managed.forEach(obj => {
      if (obj?.active) obj.destroy();
    });
    managed.length = 0;
  }

  return { destroy };
}
