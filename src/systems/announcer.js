import * as Phaser from 'phaser';

const SCORE_CALLOUTS = {
  red: ['RIB SCORES!', 'RIB SNAGS IT!', 'RIB ON THE BOARD!'],
  blue: ['BIT SCORES!', 'BIT SNAGS IT!', 'BIT ON THE BOARD!'],
};

const MATCH_STATE_EXACT = new Set([
  'TIED MATCH',
  'FINAL POINT',
  'RIB TAKES THE LEAD',
  'BIT TAKES THE LEAD',
  'RIB WINS',
  'BIT WINS',
  'WINNER! RIB!!',
  'WINNER! BIT!!',
]);

export function getScoreCallout(scene, playerId) {
  const options = SCORE_CALLOUTS[playerId] ?? ['SCORE!'];
  return Phaser.Utils.Array.GetRandom(options);
}

export function createAnnouncerSystem(scene) {
  let destroyed = false;
  let statusText = null;
  let bannerPlate = null;
  let bannerGlow = null;
  let bannerShimmer = null;
  let bannerMaskGraphics = null;
  let bannerMask = null;
  let bannerBaseY = 0;

  let statusHideTimer = null;
  let bannerHideTimer = null;

  function clearStatusHideTimer() {
    if (statusHideTimer) {
      statusHideTimer.remove(false);
      statusHideTimer = null;
    }
  }

  function clearBannerHideTimer() {
    if (bannerHideTimer) {
      bannerHideTimer.remove(false);
      bannerHideTimer = null;
    }
  }

  function isWinnerMessage(message) {
    const text = String(message ?? '').toUpperCase();
    return text.includes('WINNER') || text.includes(' WINS');
  }

  function isMatchStateMessage(message) {
    const text = String(message ?? '').toUpperCase();
    return MATCH_STATE_EXACT.has(text) || text.startsWith('MATCH POINT:');
  }

  function getTeamKey(message) {
    const text = String(message ?? '').toUpperCase();

    if (text.includes('RIB')) return 'red';
    if (text.includes('BIT')) return 'blue';

    return 'neutral';
  }

  function getBannerStyle(message) {
    const text = String(message ?? '').toUpperCase();
    const isWinner = isWinnerMessage(text);
    const isMatchState = !isWinner && isMatchStateMessage(text);
    const teamKey = getTeamKey(text);

    if (isWinner) {
      const isRed = teamKey === 'red';

      return {
        textStyle: {
          fontFamily: 'Arial',
          fontSize: '40px',
          color: isRed ? '#ef4444' : '#3b82f6',
          fontStyle: 'bold',
          stroke: '#020617',
          strokeThickness: 5,
          align: 'center',
        },
        glowColor: isRed ? 0xef4444 : 0x3b82f6,
        plateFillColor: 0x0b1220,
        shimmerColor: 0xfde68a,
        paddingX: 84,
        paddingY: 36,
        plateAlpha: 1.00,
        plateStrokeAlpha: 1.5,
        glowAlpha: 0.14,
        shimmerAlpha: 0.60,
        shimmerWidth: 64,
        revealDurationMs: 420,
        settleDelayMs: 200,
        settleDurationMs: 150,
        exitLiftPx: 10,
        exitFadeMs: 260,
        entryPlateScaleX: 0.62,
        entryGlowScaleX: 0.56,
        entryTextScaleX: 0.94,
        overshootScale: 1.08,
        textRevealDelayMs: 90,
        textRevealDurationMs: 220,
        shimmerDelayMs: 110,
        shimmerDurationMs: 560,
      };
    }

    if (isMatchState) {
      return {
        textStyle: {
          fontFamily: 'Arial',
          fontSize: '32px',
          color: '#facc15',
          fontStyle: 'bold',
          stroke: '#020617',
          strokeThickness: 4,
          align: 'center',
        },
        glowColor: 0xfacc15,
        plateFillColor: 0x0f172a,
        shimmerColor: 0xfde68a,
        paddingX: 58,
        paddingY: 24,
        plateAlpha: 1.00,
        plateStrokeAlpha: 1.5,
        glowAlpha: 0.14,
        shimmerAlpha: 0.60,
        shimmerWidth: 56,
        revealDurationMs: 300,
        settleDelayMs: 150,
        settleDurationMs: 110,
        exitLiftPx: 7,
        exitFadeMs: 210,
        entryPlateScaleX: 0.72,
        entryGlowScaleX: 0.68,
        entryTextScaleX: 0.96,
        overshootScale: 1.04,
        textRevealDelayMs: 20,
        textRevealDurationMs: 160,
        shimmerDelayMs: 90,
        shimmerDurationMs: 430,
      };
    }

    const isRed = teamKey === 'red';

    return {
      textStyle: {
        fontFamily: 'Arial',
        fontSize: '30px',
        color: isRed ? '#ef4444' : '#3b82f6',
        fontStyle: 'bold',
        stroke: '#020617',
        strokeThickness: 4,
        align: 'center',
      },
      glowColor: isRed ? 0xef4444 : 0x3b82f6,
      plateFillColor: 0x0f172a,
      shimmerColor: isRed ? 0xf87171 : 0x60a5fa,
      paddingX: 46,
      paddingY: 22,
      plateAlpha: 1.00,
      plateStrokeAlpha: 1.5,
      glowAlpha: 0.14,
      shimmerAlpha: 0.60,
      shimmerWidth: 54,
      revealDurationMs: 280,
      settleDelayMs: 130,
      settleDurationMs: 100,
      exitLiftPx: 6,
      exitFadeMs: 200,
      entryPlateScaleX: 0.78,
      entryGlowScaleX: 0.72,
      entryTextScaleX: 0.96,
      overshootScale: 1.03,
      textRevealDelayMs: 0,
      textRevealDurationMs: 140,
      shimmerDelayMs: 80,
      shimmerDurationMs: 420,
    };
  }

  function createStatusText(x, y) {
    if (destroyed) return null;

    if (statusText?.active) {
      statusText.destroy();
    }

    if (bannerPlate?.active) {
      bannerPlate.destroy();
      bannerPlate = null;
    }

    if (bannerGlow?.active) {
      bannerGlow.destroy();
      bannerGlow = null;
    }

    if (bannerShimmer?.active) {
      bannerShimmer.destroy();
      bannerShimmer = null;
    }

    if (bannerMaskGraphics?.active) {
      bannerMaskGraphics.destroy();
      bannerMaskGraphics = null;
    }

    bannerMask = null;
    bannerBaseY = y;

    statusText = scene.add.text(x, y, '', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#f8fafc',
      fontStyle: 'bold',
      stroke: '#0f172a',
      strokeThickness: 6,
      align: 'center',
    });

    statusText.setOrigin(0.5);
    statusText.setDepth(1002);
    statusText.setAlpha(0);

    return statusText;
  }

  function ensureBannerObjects() {
    if (!statusText) return;

    if (!bannerGlow) {
      bannerGlow = scene.add.rectangle(statusText.x, statusText.y, 10, 10, 0x93c5fd, 0.08);
      bannerGlow.setDepth(1000);
    }

    if (!bannerPlate) {
      bannerPlate = scene.add.rectangle(statusText.x, statusText.y, 10, 10, 0x020617, 0.6);
      bannerPlate.setDepth(1001);
    }

    if (!bannerShimmer) {
      bannerShimmer = scene.add.rectangle(statusText.x, statusText.y, 24, 24, 0xfde68a, 0);
      bannerShimmer.setDepth(1001.5);
      bannerShimmer.setAngle(-12);
    }

    if (!bannerMaskGraphics) {
      bannerMaskGraphics = scene.add.graphics();
      bannerMaskGraphics.setAlpha(0);
      bannerMask = bannerMaskGraphics.createGeometryMask();
      bannerShimmer.setMask(bannerMask);
    }
  }

  function createOrUpdatePlate(message) {
    if (!statusText) return null;

    const style = getBannerStyle(message);
    statusText.setStyle(style.textStyle);

    const width = statusText.width + style.paddingX;
    const height = statusText.height + style.paddingY;

    ensureBannerObjects();

    bannerGlow.setPosition(statusText.x, bannerBaseY);
    bannerGlow.setSize(width + 26, height + 12);
    bannerGlow.setFillStyle(style.glowColor, style.glowAlpha);

    bannerPlate.setPosition(statusText.x, bannerBaseY);
    bannerPlate.setSize(width, height);
    bannerPlate.setFillStyle(style.plateFillColor, style.plateAlpha);
    bannerPlate.setStrokeStyle(2.5, 0xfacc15, 1);
	bannerPlate.setOrigin(0.5);

    if (bannerPlate.postFX?.addGradient) {
      bannerPlate.postFX.clear();
      bannerPlate.postFX.addGradient(
        0xffffff, 0xffffff,
        0x94a3b8, 0x020617,
        0.09, 0.05, 0.03, 0,
        0, -0.9, 0, 0.9,
        10
      );
    }

    bannerShimmer.setPosition(statusText.x - width / 2 - style.shimmerWidth, bannerBaseY);
    bannerShimmer.setSize(style.shimmerWidth, height + 18);
    bannerShimmer.setFillStyle(style.shimmerColor, style.shimmerAlpha);

    bannerMaskGraphics.clear();
    bannerMaskGraphics.fillStyle(0xffffff, 1);
    bannerMaskGraphics.fillRect(
      statusText.x - width / 2,
      bannerBaseY - height / 2,
      width,
      height
    );

    return {
      ...style,
      width,
      height,
    };
  }

  function resetBannerGeometry(style) {
    if (!statusText || !style) return;

    statusText.setPosition(statusText.x, bannerBaseY);
    statusText.setScale(1);

    if (bannerPlate) {
      bannerPlate.setPosition(statusText.x, bannerBaseY);
      bannerPlate.setScale(1);
    }

    if (bannerGlow) {
      bannerGlow.setPosition(statusText.x, bannerBaseY);
      bannerGlow.setScale(1);
    }

    if (bannerShimmer) {
      bannerShimmer.setPosition(
        statusText.x - style.width / 2 - style.shimmerWidth,
        bannerBaseY
      );
      bannerShimmer.setScale(1);
    }
  }

  function hideBannerVisuals() {
    if (statusText) {
      statusText.setAlpha(0);
    }

    if (bannerPlate) {
      bannerPlate.setAlpha(0);
    }

    if (bannerGlow) {
      bannerGlow.setAlpha(0);
    }

    if (bannerShimmer) {
      bannerShimmer.setAlpha(0);
    }
  }

  function showStatus(message, duration = 1200) {
    if (destroyed) return;

    if (scene.hud?.showMessage) {
      scene.hud.showMessage(message);
      clearStatusHideTimer();

      if (duration > 0) {
        statusHideTimer = scene.time.delayedCall(duration, () => {
          if (destroyed) return;
          scene.hud?.clearMessage?.();
          statusHideTimer = null;
        });
      }

      return;
    }

    if (!statusText) return;

    statusText.setText(message);
    statusText.setAlpha(1);

    clearStatusHideTimer();

    if (duration > 0) {
      statusHideTimer = scene.time.delayedCall(duration, () => {
        if (destroyed || !statusText) return;

        scene.tweens.add({
          targets: statusText,
          alpha: 0,
          duration: 180,
          ease: 'Quad.out',
        });

        statusHideTimer = null;
      });
    }
  }

  function showScoreBanner(message, duration = 1200) {
    if (destroyed || !statusText) return;

    statusText.setText(message);
    const style = createOrUpdatePlate(message);
    resetBannerGeometry(style);
    hideBannerVisuals();

    const bannerTargets = [statusText, bannerPlate, bannerGlow, bannerShimmer].filter(Boolean);

    scene.tweens.killTweensOf(bannerTargets);
    clearBannerHideTimer();

    statusText.setAlpha(0);
    statusText.setScale(style.entryTextScaleX, 1);

    if (bannerPlate) {
      bannerPlate.setAlpha(0);
      bannerPlate.setScale(style.entryPlateScaleX, 1);
    }

    if (bannerGlow) {
      bannerGlow.setAlpha(0);
      bannerGlow.setScale(style.entryGlowScaleX, 1);
    }

    if (bannerShimmer) {
      bannerShimmer.setAlpha(0);
      bannerShimmer.setPosition(
        statusText.x - style.width / 2 - style.shimmerWidth,
        bannerBaseY
      );
    }

    scene.tweens.add({
      targets: [bannerPlate, bannerGlow].filter(Boolean),
      alpha: {
        from: 0,
        to: (_, target) => (target === bannerPlate ? style.plateAlpha : style.glowAlpha),
      },
      scaleX: { from: style.entryPlateScaleX, to: style.overshootScale },
      scaleY: { from: 1, to: style.overshootScale },
      duration: style.revealDurationMs,
      ease: 'Expo.out',
    });

    scene.tweens.add({
      targets: statusText,
      alpha: { from: 0, to: 1 },
      scaleX: { from: style.entryTextScaleX, to: style.overshootScale },
      scaleY: { from: 1, to: style.overshootScale },
      duration: style.textRevealDurationMs,
      delay: style.textRevealDelayMs,
      ease: 'Expo.out',
    });

    scene.tweens.add({
      targets: [statusText, bannerPlate, bannerGlow].filter(Boolean),
      scaleX: 1,
      scaleY: 1,
      duration: style.settleDurationMs,
      delay: style.settleDelayMs,
      ease: 'Quad.out',
    });

    if (bannerShimmer) {
      scene.tweens.add({
        targets: bannerShimmer,
        x: statusText.x + style.width / 2 + style.shimmerWidth,
        duration: style.shimmerDurationMs,
        delay: style.shimmerDelayMs,
        ease: 'Sine.out',
        onStart: () => {
          bannerShimmer.setAlpha(style.shimmerAlpha);
        },
        onComplete: () => {
          if (bannerShimmer) {
            bannerShimmer.setAlpha(0);
          }
        },
      });
    }

    if (duration > 0) {
      bannerHideTimer = scene.time.delayedCall(duration, () => {
        if (destroyed || !statusText) return;

        scene.tweens.killTweensOf(bannerTargets);

        scene.tweens.add({
          targets: bannerTargets,
          alpha: 0,
          y: bannerBaseY - style.exitLiftPx,
          duration: style.exitFadeMs,
          ease: 'Quad.out',
          onComplete: () => {
            resetBannerGeometry(style);
            hideBannerVisuals();
          },
        });

        bannerHideTimer = null;
      });
    }
  }

  function destroy() {
    destroyed = true;

    clearStatusHideTimer();
    clearBannerHideTimer();

    if (statusText?.active) {
      statusText.destroy();
    }

    if (bannerPlate?.active) {
      bannerPlate.destroy();
    }

    if (bannerGlow?.active) {
      bannerGlow.destroy();
    }

    if (bannerShimmer?.active) {
      bannerShimmer.destroy();
    }

    if (bannerMaskGraphics?.active) {
      bannerMaskGraphics.destroy();
    }

    statusText = null;
    bannerPlate = null;
    bannerGlow = null;
    bannerShimmer = null;
    bannerMaskGraphics = null;
    bannerMask = null;
  }

  return {
    createStatusText,
    showStatus,
    showScoreBanner,
    destroy,
  };
}