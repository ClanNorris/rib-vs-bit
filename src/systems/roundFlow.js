export function createRoundFlowSystem(scene, { announcer, effects } = {}) {
  const activeTimers = new Set();
  let destroyed = false;

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

  function cancelPendingTransitions() {
    clearTimers();
  }

  function resetRound({ players, tongueGraphics, resetPlayer, showMessage = false }) {
    if (destroyed) return;

    for (const player of players) {
      resetPlayer(player, null, true);
    }

    tongueGraphics?.clear();

    if (showMessage) {
      announcer?.showStatus('BACK TO POSITIONS!');
    }
  }

  function handlePointScored({
    bannerText,
    scorePauseMs = 1000,
    zoomScale = 1.12,
    zoomInMs = 200,
    zoomOutMs = 250,
    cameraShakeIntensity = 0.003,
    cameraShakeDurationMs = 100,
    onResume,
  }) {
    if (destroyed) return;

    scene.roundPaused = true;
    scene.roundGate?.setScorePause();

    const banner = announcer?.showScoreBanner(bannerText, zoomInMs + 500);
    announcer?.showStatus(bannerText);
    effects?.cameraPunch(cameraShakeIntensity, cameraShakeDurationMs);
    scene.cameras.main.zoomTo(zoomScale, zoomInMs, 'Quad.easeOut');

    addTimer(scorePauseMs, () => {
      if (banner?.active) {
        banner.destroy();
      }

      scene.resetRound(false);
      scene.cameras.main.zoomTo(1.0, zoomOutMs, 'Quad.easeInOut');
      onResume?.();
    });
  }

  function destroy() {
    destroyed = true;
    clearTimers();
  }

  return {
    resetRound,
    handlePointScored,
    cancelPendingTransitions,
    destroy,
  };
}