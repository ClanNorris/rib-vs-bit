export const GAME_TUNING = {
  board: {
    riverRows: [2, 3, 4],
    roadRows: [6, 7, 8, 9],
    topPadCols: [3, 7, 11],
    bottomPadCols: [3, 7, 11],
  },

  player: {
    moveCooldownMs: 150,
    tongueCooldownMs: 700,
    respawnInvulnMs: 350,
    resetFadeFromAlpha: 0.35,
    resetFadeDurationMs: 220,
  },

  round: {
    countdownMovesWorld: true,
    countdownInputEnabled: false,
    countdownCarryEnabled: false,
    countdownHazardsEnabled: false,
    countdownScoringEnabled: false,
    goHazardGraceMs: 120,
  },

  laneRandomization: {
    enabled: true,
    randomizePerMatch: true,
  },

  laneSpeedVariance: {
    enabled: true,
    river: {
      defaultMinMultiplier: 0.96,
      defaultMaxMultiplier: 1.04,
      typeOverrides: {
        turtle: {
          minMultiplier: 0.97,
          maxMultiplier: 1.04,
        },
      },
    },
    road: {
      defaultMinMultiplier: 0.94,
      defaultMaxMultiplier: 1.06,
      rowOverrides: {
        8: {
          minMultiplier: 0.95,
          maxMultiplier: 1.05,
        },
      },
      typeOverrides: {
        truck: {
          minMultiplier: 0.95,
          maxMultiplier: 1.06,
        },
      },
    },
  },

  scoring: {
    winScore: 3,
    scorePauseMs: 1000,
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

  platformSupport: {
    supportWidthMultiplier: 0.58,
    minimumOverlapPx: 10,
  },

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
    tongueRangeTiles: 3,
    tongueLineWidth: 6,
    tongueTipRadius: 7,
    tonguePulseRadius: 4,
    tongueFxDurationMs: 120,
    tongueTipScale: 1.35,
  },
};