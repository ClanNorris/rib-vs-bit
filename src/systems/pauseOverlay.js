export function createPauseOverlaySystem(scene, options = {}) {
  const {
    width = scene.scale.width,
    height = scene.scale.height,
    depth = 4000,
    title = 'PAUSED',
    subtitle = 'Press P to resume',
  } = options;

  let destroyed = false;
  let visible = false;

  const centerX = width / 2;
  const centerY = height / 2;

  const container = scene.add.container(0, 0);
  container.setScrollFactor(0);
  container.setDepth(depth);
  container.setVisible(false);

  const scrim = scene.add.rectangle(centerX, centerY, width, height, 0x000000, 0.18);

  const panel = scene.add.rectangle(centerX, centerY, 320, 92, 0x000000, 0.62);
  panel.setStrokeStyle(2, 0xf8d66d, 0.9);

  const titleText = scene.add.text(centerX, centerY - 14, title, {
    fontFamily: 'monospace',
    fontSize: '24px',
    color: '#f8fafc',
    fontStyle: 'bold',
  });
  titleText.setOrigin(0.5);

  const subtitleText = scene.add.text(centerX, centerY + 16, subtitle, {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#cbd5e1',
  });
  subtitleText.setOrigin(0.5);

  container.add([scrim, panel, titleText, subtitleText]);

  function show() {
    if (destroyed || visible) return;
    visible = true;
    container.setVisible(true);
  }

  function hide() {
    if (destroyed || !visible) return;
    visible = false;
    container.setVisible(false);
  }

  function toggle(forceValue) {
    if (destroyed) return;

    const nextVisible =
      typeof forceValue === 'boolean' ? forceValue : !visible;

    if (nextVisible) {
      show();
      return;
    }

    hide();
  }

  function isVisible() {
    return visible;
  }

  function destroy() {
    destroyed = true;
    container.destroy(true);
  }

  return {
    show,
    hide,
    toggle,
    isVisible,
    destroy,
  };
}