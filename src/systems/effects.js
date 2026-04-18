export function createEffectsSystem(scene) {
  const managedObjects = new Set();
  let destroyed = false;

  function track(gameObject) {
    if (!gameObject) return gameObject;
    managedObjects.add(gameObject);
    gameObject.once?.('destroy', () => managedObjects.delete(gameObject));
    return gameObject;
  }

  function spawnImpact(x, y, color) {
    if (destroyed) return;

    const ring = track(
      scene.add.circle(x, y, 10, color, 0.15).setStrokeStyle(3, color, 0.95)
    );
    const flash = track(scene.add.circle(x, y, 6, 0xffffff, 0.9));

    scene.tweens.add({
      targets: [ring, flash],
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 180,
      ease: 'Quad.out',
      onComplete: () => {
        if (ring.active) ring.destroy();
        if (flash.active) flash.destroy();
      },
    });
  }

  function spawnSplash(x, y) {
    if (destroyed) return;

    const topLeft = track(scene.add.circle(x - 8, y, 6, 0xbfdbfe, 0.9));
    const topRight = track(scene.add.circle(x + 8, y, 6, 0x93c5fd, 0.9));
    const topMid = track(scene.add.circle(x, y - 4, 5, 0xe0f2fe, 0.9));
    const bottomLeft = track(scene.add.circle(x - 8, y, 6, 0xbfdbfe, 0.85));
    const bottomRight = track(scene.add.circle(x + 8, y, 6, 0x93c5fd, 0.85));
    const bottomMid = track(scene.add.circle(x, y + 4, 5, 0xe0f2fe, 0.85));

    scene.tweens.add({
      targets: [topLeft, topRight, topMid],
      y: '-=14',
      alpha: 0,
      duration: 220,
      ease: 'Quad.out',
      onComplete: () => {
        if (topLeft.active) topLeft.destroy();
        if (topRight.active) topRight.destroy();
        if (topMid.active) topMid.destroy();
      },
    });

    scene.tweens.add({
      targets: [bottomLeft, bottomRight, bottomMid],
      y: '+=14',
      alpha: 0,
      duration: 220,
      ease: 'Quad.out',
      onComplete: () => {
        if (bottomLeft.active) bottomLeft.destroy();
        if (bottomRight.active) bottomRight.destroy();
        if (bottomMid.active) bottomMid.destroy();
      },
    });
  }

  function cameraPunch(intensity, duration) {
    if (destroyed) return;
    scene.cameras.main.shake(duration, intensity);
  }

  function destroy() {
    destroyed = true;

    for (const gameObject of managedObjects) {
      scene.tweens.killTweensOf(gameObject);
      if (gameObject.active) {
        gameObject.destroy();
      }
    }

    managedObjects.clear();
  }

  return {
    spawnImpact,
    spawnSplash,
    cameraPunch,
    destroy,
  };
}