import { GAME_TUNING } from './gameTuning';

const RIVER_LANE_DEFS = [
  {
    row: 2,
    dir: 1,
    speed: 70,
    type: 'turtle',
    length: 3,
    templates: [
      [1, 6, 11],
      [0, 5, 10],
      [2, 7, 12],
    ],
  },
  {
    row: 3,
    dir: -1,
    speed: 48,
    type: 'log',
    length: 4,
    templates: [
      [0, 7, 12],
      [1, 6, 11],
      [2, 8, 13],
    ],
  },
  {
    row: 4,
    dir: 1,
    speed: 95,
    type: 'shortLog',
    length: 2,
    templates: [
      [1, 5, 10, 13],
      [0, 4, 9, 12],
      [2, 6, 11, 14],
    ],
  },
  {
    row: 5,
    dir: -1,
    speed: 70,
    type: 'turtle',
    length: 2,
    templates: [
      [1, 6, 11],
      [0, 5, 10],
      [2, 7, 12],
    ],
  },
];

const ROAD_LANE_DEFS = [
  {
    row: 8,
    dir: -1,
    speed: 120,
    type: 'car',
    altType: 'sportsCar',
    altChance: 0.25,
    length: 1.2,
    templates: [
      [1, 5, 10, 13],
      [0, 4, 9, 12],
      [2, 6, 11, 14],
    ],
  },
  {
    row: 9,
    dir: 1,
    speed: 140,
    type: 'truck',
    altType: 'cyberTruck',
    altChance: 0.25,
    length: 1.8,
    templates: [
      [0, 4, 9, 12],
      [1, 5, 10, 13],
      [2, 6, 11, 14],
    ],
  },
  {
    row: 10,
    dir: -1,
    speed: 160,
    type: 'sportsCar',
    altType: 'car',
    altChance: 0.25,
    length: 1.2,
    templates: [
      [2, 7, 11, 14],
      [1, 6, 10, 13],
      [0, 5, 9, 12],
    ],
  },
  {
    row: 11,
    dir: 1,
    speed: 100,
    type: 'cyberTruck',
    altType: 'truck',
    altChance: 0.25,
    length: 1.8,
    templates: [
      [1, 6, 10, 13],
      [0, 5, 9, 12],
      [2, 7, 11, 14],
    ],
  },
];

function cloneSpawns(spawns) {
  return spawns.slice();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFixedNumber(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function chooseTemplate(templates, randomFn) {
  if (!templates?.length) return { templateId: 'static', spawns: [] };

  const index = Math.floor(randomFn() * templates.length);
  const clampedIndex = Math.max(0, Math.min(index, templates.length - 1));

  return {
    templateId: String.fromCharCode(65 + clampedIndex),
    spawns: cloneSpawns(templates[clampedIndex]),
  };
}

function getLaneSpeedVarianceFamily(def) {
  return GAME_TUNING.board.riverRows.includes(def.row) ? 'river' : 'road';
}

function getLaneSpeedVarianceBounds(def) {
  const varianceConfig = GAME_TUNING.laneSpeedVariance;

  if (!varianceConfig?.enabled) {
    return {
      minMultiplier: 1,
      maxMultiplier: 1,
      family: getLaneSpeedVarianceFamily(def),
    };
  }

  const family = getLaneSpeedVarianceFamily(def);
  const familyConfig = varianceConfig[family] ?? {};
  const rowOverride = familyConfig.rowOverrides?.[def.row] ?? null;
  const typeOverride = familyConfig.typeOverrides?.[def.type] ?? null;

  const minMultiplier =
    rowOverride?.minMultiplier ??
    typeOverride?.minMultiplier ??
    familyConfig.defaultMinMultiplier ??
    1;

  const maxMultiplier =
    rowOverride?.maxMultiplier ??
    typeOverride?.maxMultiplier ??
    familyConfig.defaultMaxMultiplier ??
    1;

  return {
    minMultiplier: Math.min(minMultiplier, maxMultiplier),
    maxMultiplier: Math.max(minMultiplier, maxMultiplier),
    family,
  };
}

function rollLaneSpeedMultiplier(def, randomFn, varianceEnabled) {
  if (!varianceEnabled) {
    const family = getLaneSpeedVarianceFamily(def);

    return {
      family,
      minMultiplier: 1,
      maxMultiplier: 1,
      speedMultiplier: 1,
    };
  }

  const bounds = getLaneSpeedVarianceBounds(def);
  const randomUnit = clamp(randomFn(), 0, 0.999999);
  const speedMultiplier = toFixedNumber(
    bounds.minMultiplier +
      (bounds.maxMultiplier - bounds.minMultiplier) * randomUnit,
    3
  );

  return {
    ...bounds,
    speedMultiplier,
  };
}

function materializeLane(def, randomFn, options = {}) {
  const {
    randomizationEnabled = true,
    speedVarianceEnabled = GAME_TUNING.laneSpeedVariance.enabled,
  } = options;

  const chosen = randomizationEnabled
    ? chooseTemplate(def.templates, randomFn)
    : {
        templateId: 'A',
        spawns: cloneSpawns(def.templates[0]),
      };

  const speedRoll = rollLaneSpeedMultiplier(def, randomFn, speedVarianceEnabled);
  const baseSpeed = def.speed;
  const speed = Math.max(0.001, toFixedNumber(baseSpeed * speedRoll.speedMultiplier, 3));

  return {
    row: def.row,
    dir: def.dir,
    baseSpeed,
    speedMultiplier: speedRoll.speedMultiplier,
    speed,
    type: def.type,
    length: def.length,
    spawns: chosen.spawns,
    templateId: chosen.templateId,
    speedVarianceFamily: speedRoll.family,
    speedVarianceMinMultiplier: speedRoll.minMultiplier,
    speedVarianceMaxMultiplier: speedRoll.maxMultiplier,
  };
}

function formatLaneSummaryToken(prefix, lane) {
  const multiplierText = lane.speedMultiplier.toFixed(2);
  const speedText = Math.round(lane.speed);

  return `${prefix}${lane.row}:${lane.templateId}@${multiplierText}(${speedText})`;
}

function summarizeLanePlan(riverLanes, roadLanes) {
  const river = riverLanes
    .map((lane) => formatLaneSummaryToken('R', lane))
    .join(' ');
  const road = roadLanes
    .map((lane) => formatLaneSummaryToken('D', lane))
    .join(' ');

  return `${river} | ${road}`;
}

export function createRiverLanes(options = {}) {
  const {
    random = Math.random,
    speedVarianceEnabled = false,
  } = options;

  return RIVER_LANE_DEFS.map((def) =>
    materializeLane(def, random, {
      randomizationEnabled: false,
      speedVarianceEnabled,
    })
  );
}

export function createRoadLanes(options = {}) {
  const {
    random = Math.random,
    speedVarianceEnabled = false,
  } = options;

  return ROAD_LANE_DEFS.map((def) =>
    materializeLane(def, random, {
      randomizationEnabled: false,
      speedVarianceEnabled,
    })
  );
}

export function createMatchLanePlan(options = {}) {
  const {
    random = Math.random,
    randomizationEnabled = GAME_TUNING.laneRandomization.enabled,
    speedVarianceEnabled = GAME_TUNING.laneSpeedVariance.enabled,
  } = options;

  const riverLanes = RIVER_LANE_DEFS.map((def) =>
    materializeLane(def, random, {
      randomizationEnabled,
      speedVarianceEnabled,
    })
  );

  const roadLanes = ROAD_LANE_DEFS.map((def) =>
    materializeLane(def, random, {
      randomizationEnabled,
      speedVarianceEnabled,
    })
  );

  return {
    riverLanes,
    roadLanes,
    debugSummary: summarizeLanePlan(riverLanes, roadLanes),
  };
}