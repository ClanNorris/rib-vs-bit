// Game data (grid/board/lane defs/speed variance/shared timing) is single-sourced
// from server/shared/gameData.json (see CLAUDE.md). The shared fields below read
// from it; everything else is client-only presentation/feel tuning.
import gameData from '../../server/shared/gameData.json';

export const GAME_TUNING = {
  board: { ...gameData.board },

  player: {
    moveCooldownMs: gameData.timing.moveCooldownMs,
    tongueCooldownMs: gameData.timing.tongueCooldownMs,
    respawnInvulnMs: gameData.timing.respawnInvulnMs,
    resetFadeFromAlpha: 0.35,
    resetFadeDurationMs: 220,
  },

  round: {
    countdownMovesWorld: true,
    countdownInputEnabled: false,
    countdownCarryEnabled: false,
    countdownHazardsEnabled: false,
    countdownScoringEnabled: false,
    goHazardGraceMs: gameData.timing.goHazardGraceMs,
  },

  laneRandomization: {
    enabled: true,
    randomizePerMatch: true,
  },

  laneSpeedVariance: gameData.laneSpeedVariance,

  scoring: {
    winScore: gameData.timing.winScore,
    scorePauseMs: gameData.timing.scorePauseMs,
    scorePulseScale: 1.12,
    scorePulseDurationMs: 140,
  },

  camera: {
    hitShakeIntensity: 0.006,
    hitShakeDurationMs: 120,
    scoreShakeIntensity: 0.003,
    scoreShakeDurationMs: 100,
    introShakeIntensity: 0.005,
    introShakeDurationMs: 150,
  },

  zoom: {
    scoreZoomScale: 1.12,
    scoreZoomInMs: 200,
    scoreZoomOutMs: 250,
  },

  carry: {
    edgeBufferTiles: 0.0,
  },

  platformSupport: { ...gameData.platformSupport },

  fx: {
    playerPopScale: 0.84,
    playerShadowPopScale: 0.8,
    playerPopDurationMs: 110,
    playerFlashShakeDistance: 5,
    playerFlashShakeDurationMs: 35,
    playerFlashShakeRepeats: 3,
    playerFlashTintClearDelayMs: 140,
  },

  abilities: {
    tongueRangeTiles: gameData.timing.tongueRangeTiles,
    tongueLineWidth: 6,
    tongueTipRadius: 7,
    tonguePulseRadius: 4,
    tongueFxDurationMs: 120,
    tongueTipScale: 1.35,
  },
};