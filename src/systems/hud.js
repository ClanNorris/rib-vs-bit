export function createHudSystem(scene, options = {}) {
  const { winScore = 3 } = options;

  const managedObjects = new Set();
  let destroyed = false;

  let container = null;
  let centerPanel = null;
  let rightPanel = null;
  let leftPanel = null;
  let leftScoreText = null;
  let rightScoreText = null;
  let centerScoreText = null;
  let centerLabelText = null;
  let leftNameText = null;
  let rightNameText = null;
  let arenaText = null;
  let messageText = null;
  let ribGlow = null;
  let bitGlow = null;
  let centerIdleGlow = null;
  let centerIdleSheen = null;
  let centerIdleMaskGraphics = null;
  let centerPanelWidth = 208;
  let centerPanelHeight = 48;
  let centerPanelY = 0;
  let centerX = 0;

  function track(gameObject) {
    if (!gameObject) return gameObject;
    managedObjects.add(gameObject);
    gameObject.once?.('destroy', () => managedObjects.delete(gameObject));
    return gameObject;
  }

  function createPanel(x, y, width, height, fillColor, alpha = 0.96) {
    const panel = track(scene.add.rectangle(x, y, width, height, fillColor, alpha));
    panel.setStrokeStyle(1.5, 0xfacc15, 0.82);
    return panel;
  }

  function createLabel(x, y, text, style = {}) {
    return track(
      scene.add.text(x, y, text, {
        fontFamily: 'Arial',
        fontSize: style.fontSize ?? '16px',
        color: style.color ?? '#f8fafc',
        fontStyle: style.fontStyle ?? 'bold',
        align: style.align ?? 'center',
        letterSpacing: style.letterSpacing ?? 0,
        stroke: style.stroke,
        strokeThickness: style.strokeThickness,
      }).setOrigin(style.originX ?? 0.5, style.originY ?? 0.5)
    );
  }

  function create() {
    if (destroyed) return;

    const width = scene.scale.width;
    const hudRowTop = scene.gridY(scene.rowTypes.HUD);
    const hudCenterY = hudRowTop + 24;
    centerX = width / 2;
    const leftX = 96;
    const rightX = width - 96;

    container = track(scene.add.container(0, 0));
    container.setDepth(1000);

    const backdrop = track(
      scene.add.rectangle(centerX, hudCenterY, width, scene.tileSize, 0x09101c, 0.9)
    );

    const topEdge = track(
      scene.add.rectangle(centerX, hudRowTop + 1, width, 2, 0xfacc15, 0.95)
    );

    leftPanel = createPanel(leftX, hudCenterY, 168, 40, 0x111827, 0.98);
    rightPanel = createPanel(rightX, hudCenterY, 168, 40, 0x111827, 0.98);

    centerPanelHeight = 48;
    centerPanelY = hudCenterY - 3;
    centerPanelWidth = 208;
    centerPanel = createPanel(centerX, centerPanelY, centerPanelWidth, centerPanelHeight, 0x0b1220, 0.86);
	
	if (centerPanel.postFX?.addGradient) {
      centerPanel.postFX.addGradient(
        0xffffff, 0xffffff,
        0x1e293b, 0x020617,
        0.045, 0.018, 0.02, 0,
        0, -1, 0, 1,
        10
      );
    }

    centerIdleGlow = track(
      scene.add.rectangle(centerX, centerPanelY, centerPanelWidth + 4, centerPanelHeight + 2, 0xfacc15, 0.03)
    );
    centerIdleGlow.setStrokeStyle(1, 0xfacc15, 0.16);

    centerIdleSheen = track(
      scene.add.rectangle(centerX - centerPanelWidth / 2 - 28, centerPanelY - 1, 26, centerPanelHeight - 12, 0xffffff, 0.075)
    );
    centerIdleSheen.setAngle(-11);

    centerIdleMaskGraphics = track(scene.add.graphics());
    centerIdleMaskGraphics.fillStyle(0xffffff, 1);
    centerIdleMaskGraphics.fillRect(
      centerX - centerPanelWidth / 2,
      centerPanelY - centerPanelHeight / 2,
      centerPanelWidth,
      centerPanelHeight
    );
    centerIdleMaskGraphics.setVisible(false);
    centerIdleSheen.setMask(centerIdleMaskGraphics.createGeometryMask());

    ribGlow = track(scene.add.rectangle(leftX, hudCenterY, 176, 44, 0xef4444, 0.05));
    bitGlow = track(scene.add.rectangle(rightX, hudCenterY, 176, 44, 0x3b82f6, 0.05));
    ribGlow.setStrokeStyle(2, 0xef4444, 0.45);
    bitGlow.setStrokeStyle(2, 0x3b82f6, 0.45);

    const ribAccent = track(scene.add.rectangle(leftX, hudCenterY - 18, 168, 3, 0xef4444, 1));
    const centerAccent = track(scene.add.rectangle(centerX, centerPanelY - 22, centerPanelWidth, 3, 0xfacc15, 1));
    const bitAccent = track(scene.add.rectangle(rightX, hudCenterY - 18, 168, 3, 0x3b82f6, 1));

    arenaText = createLabel(centerX, hudRowTop + 10, 'FROGWAY ARENA', {
      fontSize: '12px',
      color: '#cbd5e1',
      letterSpacing: 1.3,
    });

    leftNameText = createLabel(leftX, hudCenterY - 9, 'RIB', {
      fontSize: '11px',
      color: '#fee2e2',
      letterSpacing: 1.2,
    });

    rightNameText = createLabel(rightX, hudCenterY - 9, 'BIT', {
      fontSize: '11px',
      color: '#dbeafe',
      letterSpacing: 1.2,
    });

    leftScoreText = createLabel(leftX, hudCenterY + 2, '0', {
      fontSize: '33px',
      color: '#f8fafc',
      stroke: '#0f172a',
      strokeThickness: 4,
    });

    rightScoreText = createLabel(rightX, hudCenterY + 2, '0', {
      fontSize: '33px',
      color: '#f8fafc',
      stroke: '#0f172a',
      strokeThickness: 4,
    });

    centerLabelText = createLabel(centerX, centerPanelY - 8, `FIRST TO ${winScore}`, {
      fontSize: '12px',
      color: '#facc15',
      letterSpacing: 1.1,
    });

    messageText = createLabel(centerX, centerPanelY - 10, '', {
      fontSize: '11px',
      color: '#93c5fd',
      stroke: '#0f172a',
      strokeThickness: 3,
    });
    messageText.setVisible(false);

    centerScoreText = createLabel(centerX, centerPanelY + 10, '0 - 0', {
      fontSize: '20px',
      color: '#f8fafc',
      stroke: '#0f172a',
      strokeThickness: 3,
    });

    [
      backdrop,
      topEdge,
      ribGlow,
      bitGlow,
      leftPanel,
      centerPanel,
      centerIdleGlow,
      centerIdleSheen,
      rightPanel,
      ribAccent,
      centerAccent,
      bitAccent,
      arenaText,
      leftNameText,
      rightNameText,
      leftScoreText,
      rightScoreText,
      centerLabelText,
      messageText,
      centerScoreText,
    ].forEach((obj) => container.add(obj));

    scene.tweens.add({
      targets: centerIdleGlow,
      alpha: 0.075,
      yoyo: true,
      repeat: -1,
      duration: 2400,
      ease: 'Sine.inOut',
    });

    scene.tweens.add({
      targets: centerIdleSheen,
      x: centerX + centerPanelWidth / 2 + 28,
      alpha: { from: 0.01, to: 0.095 },
      duration: 3200,
      repeat: -1,
      repeatDelay: 1900,
      ease: 'Sine.inOut',
      onRepeat: () => {
        if (centerIdleSheen) {
          centerIdleSheen.x = centerX - centerPanelWidth / 2 - 28;
        }
      },
    });
  }

  function updateScores() {
    if (destroyed || !leftScoreText || !rightScoreText || !centerScoreText || !centerLabelText) {
      return;
    }

    const rib = scene.players.red.score;
    const bit = scene.players.blue.score;

    leftScoreText.setText(String(rib));
    rightScoreText.setText(String(bit));
    centerScoreText.setText(`${rib} - ${bit}`);

    const maxScore = Math.max(rib, bit);
    const matchPointTarget = winScore - 1;
    const isFinalPoint = rib === matchPointTarget && bit === matchPointTarget;
    const isMatchPoint = maxScore === matchPointTarget && rib !== bit;
    const isFinal = maxScore >= winScore;

    if (isFinal) {
      centerLabelText.setText('FINAL');
      centerLabelText.setColor('#f8fafc');
      return;
    }

    if (isFinalPoint) {
      centerLabelText.setText('FINAL POINT');
      centerLabelText.setColor('#facc15');
      return;
    }

    if (isMatchPoint) {
      centerLabelText.setText('MATCH POINT');
      centerLabelText.setColor('#f97316');
      return;
    }

    centerLabelText.setText(`FIRST TO ${winScore}`);
    centerLabelText.setColor('#facc15');
  }

  function showMessage(text) {
    if (destroyed || !messageText) return;

    if (!text) {
      messageText.setText('');
      messageText.setVisible(false);
      return;
    }

    messageText.setText(String(text).toUpperCase());
    messageText.setVisible(true);
  }

  function clearMessage() {
    if (destroyed || !messageText) return;
    messageText.setText('');
    messageText.setVisible(false);
  }

  function pulseCenter(scale = 1.07, duration = 150) {
    if (destroyed || !centerPanel) return;

    const targets = [centerPanel, centerIdleGlow, centerScoreText, centerLabelText, messageText].filter(Boolean);
    scene.tweens.killTweensOf(targets);
    targets.forEach((target) => target.setScale(1));

    scene.tweens.add({
      targets,
      scaleX: scale,
      scaleY: scale,
      yoyo: true,
      duration,
      ease: 'Quad.out',
    });
  }

  function pulseSide(playerId, scale = 1.08, duration = 170) {
    if (destroyed) return;

    const isRed = playerId === 'red';
    const panel = isRed ? leftPanel : rightPanel;
    const glow = isRed ? ribGlow : bitGlow;
    const scoreText = isRed ? leftScoreText : rightScoreText;

    if (!panel || !glow || !scoreText) return;

    scene.tweens.killTweensOf([panel, glow, scoreText]);

    panel.setScale(1);
    glow.setScale(1);
    scoreText.setScale(1);
    glow.setAlpha(0.06);

    scene.tweens.add({
      targets: [panel, scoreText],
      scaleX: scale,
      scaleY: scale,
      yoyo: true,
      duration,
      ease: 'Back.out',
    });

    scene.tweens.add({
      targets: glow,
      alpha: 0.22,
      yoyo: true,
      duration: duration + 60,
      ease: 'Sine.inOut',
    });
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
    create,
    updateScores,
    showMessage,
    clearMessage,
    pulseCenter,
    pulseSide,
    destroy,
  };
}