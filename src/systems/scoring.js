import { isPlayerAlive } from './playerLifecycle';

export function createScoringSystem(scene, options = {}) {
  const {
    winScore = 3,
    onScore,
    onWin,
    onRegularPoint,
  } = options;

  let destroyed = false;

  function updateScoreText() {
    if (destroyed) return;

    if (scene.hud?.updateScores) {
      scene.hud.updateScores();
    }

    if (scene.scoreText) {
      scene.scoreText.setText(`Rib ${scene.players.red.score} - ${scene.players.blue.score} Bit`);
    }
  }

  function pulseScore(scale = 1.12, duration = 140) {
    if (destroyed) return;

    if (scene.hud?.pulseCenter) {
      scene.hud.pulseCenter(scale, duration);
    }

    if (scene.scoreText) {
      scene.scoreText.setScale(1);
      scene.tweens.killTweensOf(scene.scoreText);
      scene.tweens.add({
        targets: scene.scoreText,
        scaleX: scale,
        scaleY: scale,
        yoyo: true,
        duration,
        ease: 'Quad.out',
      });
    }
  }

  function capturePad(playerId, pad) {
    if (destroyed || !pad?.activePad) return;

    const player = scene.players[playerId];
    if (!player || !isPlayerAlive(player)) return;

    const redBefore = scene.players.red.score;
    const blueBefore = scene.players.blue.score;

    pad.activePad = false;
    pad.setVisible(false);

    scene.players[playerId].score += 1;

    const redAfter = scene.players.red.score;
    const blueAfter = scene.players.blue.score;

    const scoreState = {
      playerId,
      pad,
      winScore,
      redBefore,
      blueBefore,
      redAfter,
      blueAfter,
    };

    onScore?.(playerId, pad, scoreState);
    updateScoreText();

    if (scene.players[playerId].score >= winScore) {
      onWin?.(playerId, pad, scoreState);
      return;
    }

    onRegularPoint?.(playerId, pad, scoreState);
  }

  function checkLilyPadCapture() {
    if (destroyed) return;

    const red = scene.players.red;
    const blue = scene.players.blue;

    if (!isPlayerAlive(red) || !isPlayerAlive(blue)) return;

    for (const pad of scene.bluePads) {
      if (pad.activePad && red.row === pad.row && red.col === pad.col) {
        capturePad('red', pad);
        return;
      }
    }

    for (const pad of scene.redPads) {
      if (pad.activePad && blue.row === pad.row && blue.col === pad.col) {
        capturePad('blue', pad);
        return;
      }
    }
  }

  function destroy() {
    destroyed = true;
  }

  return {
    checkLilyPadCapture,
    capturePad,
    updateScoreText,
    pulseScore,
    destroy,
  };
}