import { GAME_TUNING } from '../config/gameTuning';
import { GAME_THEME } from '../config/theme';
import {
  createLilyPad,
  createTurtleDecoration,
  createBushCluster,
  createLogDecoration,
  createCarDecoration,
  createSportsCarDecoration,
  createTruckDecoration,
  createCyberTruckDecoration,
} from '../entities/platformFactory';

const VEHICLE_DECORATION_FACTORIES = {
  car: createCarDecoration,
  sportsCar: createSportsCarDecoration,
  truck: createTruckDecoration,
  cyberTruck: createCyberTruckDecoration,
};

export function buildLaneObjects(scene, options = {}) {
  const { riverLanes, roadLanes, platforms, vehicles, platformDecorations } = options;
  _drawLaneObjects(scene, { riverLanes, roadLanes, platforms, vehicles, platformDecorations });
}

export function buildWorld(scene, options = {}) {
  const { riverLanes, roadLanes, rowTypes } = options;

  const platforms = [];
  const vehicles = [];
  const platformDecorations = [];

  drawBoard(scene, rowTypes);
  _drawLaneObjects(scene, {
    riverLanes,
    roadLanes,
    platforms,
    vehicles,
    platformDecorations,
  });

  const topPadCols = [...GAME_TUNING.board.topPadCols];
  const bottomPadCols = [...GAME_TUNING.board.bottomPadCols];

  const bluePads = topPadCols.map((col, i) =>
    createLilyPad(scene, col, rowTypes.TOP_PADS, 'blue', i)
  );

  const redPads = bottomPadCols.map((col, i) =>
    createLilyPad(scene, col, rowTypes.BOTTOM_PADS, 'red', i, {
      offsetY: -2,
    })
  );

  return {
    platforms,
    vehicles,
    platformDecorations,
    bluePads,
    redPads,
    topPadCols,
    bottomPadCols,
  };
}

function drawBoard(scene, rowTypes) {
  const g = scene.add.graphics();
  const colors = GAME_THEME.board;
  const riverRows = new Set(GAME_TUNING.board.riverRows);
  const roadRows = new Set(GAME_TUNING.board.roadRows);

  for (let row = 0; row < scene.rows; row += 1) {
    let color = colors.safe;

    if (row === rowTypes.TOP_PADS) color = colors.topPads;
    else if (row === rowTypes.TOP_START) color = colors.topStart;
    else if (riverRows.has(row)) color = colors.river;
    else if (roadRows.has(row)) color = colors.road;
    else if (row === rowTypes.BOTTOM_START) color = colors.bottomStart;
    else if (row === rowTypes.BOTTOM_PADS) color = colors.bottomPads;
    else if (row === rowTypes.HUD) color = colors.hud;

    for (let col = 0; col < scene.cols; col += 1) {
      g.fillStyle(color, 1);
      g.fillRect(col * scene.tileSize, row * scene.tileSize, scene.tileSize, scene.tileSize);
    }
  }

  const bushY = scene.gridY(rowTypes.SAFE_2);
  for (const bushX of [4 * scene.tileSize, 8 * scene.tileSize, 12 * scene.tileSize]) {
    const bush = createBushCluster(scene, bushX, bushY);
    bush.setDepth(1);
  }

  scene.add.text(12, scene.gridY(rowTypes.TOP_START) + 12, 'BIT SIDE', {
    fontSize: '18px',
    color: GAME_THEME.text.bitSide,
    fontStyle: 'bold',
  });

  scene.add.text(12, scene.gridY(rowTypes.BOTTOM_START) + 12, 'RIB SIDE', {
    fontSize: '18px',
    color: GAME_THEME.text.ribSide,
    fontStyle: 'bold',
  });
}

function _drawLaneObjects(scene, options) {
  const { riverLanes, roadLanes, platforms, vehicles, platformDecorations } = options;

  for (const lane of riverLanes) {
    for (const spawnCol of lane.spawns) {
      const width = lane.length * scene.tileSize;
      const x = spawnCol * scene.tileSize + width / 2;
      const y = scene.centerY(lane.row);

      if (lane.type === 'log' || lane.type === 'shortLog') {
        const hitbox = scene.add.rectangle(
          x,
          y,
          width,
          scene.tileSize * 0.72,
          GAME_THEME.objects.turtleHitbox,
          GAME_THEME.objects.turtleHitboxAlpha
        );
        hitbox.setDepth(2);
        hitbox.lane = lane;
        hitbox.isMainPlatform = true;
        platforms.push(hitbox);

        const deco = createLogDecoration(scene, x, y, hitbox, 0, width, scene.tileSize, lane.dir);
        deco.setDepth(3);
        platformDecorations.push(deco);
      } else if (lane.type === 'turtle') {
        const hitbox = scene.add.rectangle(
          x,
          y,
          width,
          scene.tileSize * 0.68,
          GAME_THEME.objects.turtleHitbox,
          GAME_THEME.objects.turtleHitboxAlpha
        );
        hitbox.setDepth(2);
        hitbox.lane = lane;
        hitbox.isMainPlatform = true;
        platforms.push(hitbox);

        const turtleCount = Math.max(1, lane.length);
        const firstTileCenterOffset = -width / 2 + scene.tileSize / 2;

        for (let i = 0; i < turtleCount; i += 1) {
          const offsetX = firstTileCenterOffset + i * scene.tileSize;
          const deco = createTurtleDecoration(scene, x + offsetX, y, hitbox, offsetX, lane.dir);
          deco.setDepth(3);
          platformDecorations.push(deco);
        }
      }
    }
  }

  for (const lane of roadLanes) {
    lane.spawns.forEach((spawnCol, i) => {
      const width = lane.length * scene.tileSize;
      const x = spawnCol * scene.tileSize + width / 2;
      const y = scene.centerY(lane.row);

      const hitbox = scene.add.rectangle(
        x,
        y,
        width,
        scene.tileSize * 0.7,
        GAME_THEME.objects.turtleHitbox,
        GAME_THEME.objects.turtleHitboxAlpha
      );
      hitbox.setDepth(2);
      hitbox.lane = lane;
      hitbox.isVehicle = true;
      vehicles.push(hitbox);

      const skin = lane.vehicleSkins?.[i] ?? lane.type;
      const decoFactory = VEHICLE_DECORATION_FACTORIES[skin];
      const deco = decoFactory(scene, x, y, hitbox, width, lane.dir);
      deco.setDepth(3);
      platformDecorations.push(deco);
    });
  }
}