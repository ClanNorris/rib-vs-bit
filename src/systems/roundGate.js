export function createRoundGateSystem(scene, options = {}) {
  const {
    goHazardGraceMs = 0,
    countdownMovesWorld = true,
    countdownInputEnabled = false,
    countdownCarryEnabled = false,
    countdownHazardsEnabled = false,
    countdownScoringEnabled = false,
  } = options;

  let destroyed = false;
  let phase = 'menu';
  let hazardsEnableAt = 0;

  function setPhase(nextPhase, now = scene.time.now) {
    if (destroyed) return;

    phase = nextPhase;

    if (nextPhase === 'live') {
      hazardsEnableAt = now + goHazardGraceMs;
      return;
    }

    hazardsEnableAt = Number.POSITIVE_INFINITY;
  }

  function setMenu() {
    setPhase('menu');
  }

  function setCountdown() {
    setPhase('countdown');
  }

  function setLive() {
    setPhase('live');
  }

  function setScorePause() {
    setPhase('scorePause');
  }

  function setGameOver() {
    setPhase('gameOver');
  }

  function getPhase() {
    return phase;
  }

  function isWorldRunning() {
    switch (phase) {
      case 'countdown':
        return countdownMovesWorld;
      case 'live':
        return true;
      default:
        return false;
    }
  }

  function isInputEnabled() {
    switch (phase) {
      case 'countdown':
        return countdownInputEnabled;
      case 'live':
        return true;
      default:
        return false;
    }
  }

  function isCarryEnabled() {
    switch (phase) {
      case 'countdown':
        return countdownCarryEnabled;
      case 'live':
        return true;
      default:
        return false;
    }
  }

  function isScoringEnabled() {
    switch (phase) {
      case 'countdown':
        return countdownScoringEnabled;
      case 'live':
        return true;
      default:
        return false;
    }
  }

  function areHazardsEnabled(now = scene.time.now) {
    switch (phase) {
      case 'countdown':
        return countdownHazardsEnabled;
      case 'live':
        return now >= hazardsEnableAt;
      default:
        return false;
    }
  }

  function getHazardsEnableAt() {
    return hazardsEnableAt;
  }

  function destroy() {
    destroyed = true;
  }

  return {
    setMenu,
    setCountdown,
    setLive,
    setScorePause,
    setGameOver,
    getPhase,
    isWorldRunning,
    isInputEnabled,
    isCarryEnabled,
    isScoringEnabled,
    areHazardsEnabled,
    getHazardsEnableAt,
    destroy,
  };
}