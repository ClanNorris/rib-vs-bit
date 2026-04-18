export function createPlayerFeedbackSystem(scene) {
  let destroyed = false;

  function pop(player) {
    if (destroyed || !player?.sprite || !player?.shadow) return;

    const target = player.sprite;
    target.setScale(0.84);
    player.shadow.setScale(0.8);

    scene.tweens.killTweensOf(target);
    scene.tweens.killTweensOf(player.shadow);

    scene.tweens.add({
      targets: target,
      scaleX: 1,
      scaleY: 1,
      duration: 110,
      ease: 'Back.Out',
    });

    scene.tweens.add({
      targets: player.shadow,
      scaleX: 1,
      scaleY: 1,
      duration: 110,
      ease: 'Quad.out',
    });
  }

  function flashAndShake(player) {
    if (destroyed || !player?.sprite) return;

    const sprite = player.sprite;
    const originalX = sprite.x;

    for (const child of sprite.list) {
      if (child.setTint) child.setTint(0xff4d4d);
    }

    scene.tweens.add({
      targets: sprite,
      x: originalX + 5,
      duration: 35,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.inOut',
      onComplete: () => {
        sprite.x = originalX;
      },
    });

    scene.time.delayedCall(140, () => {
      if (destroyed || !sprite.active) return;

      for (const child of sprite.list) {
        if (child.clearTint) child.clearTint();
      }
    });
  }

  function destroy() {
    destroyed = true;
  }

  return {
    pop,
    flashAndShake,
    destroy,
  };
}