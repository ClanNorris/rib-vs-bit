import { GAME_TUNING } from '../config/gameTuning';
import { GAME_THEME } from '../config/theme';
import { createLilyPad, createTurtleDecoration } from '../entities/platformFactory';

export function buildWorld(scene, options = {}) {
  const { riverLanes, roadLanes, rowTypes } = options;

  const platforms = [];
  const vehicles = [];
  const platformDecorations = [];

  drawBoard(scene, rowTypes);
  drawLaneObjects(scene, {
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
      g.lineStyle(1, colors.grid, 0.35);
      g.strokeRect(col * scene.tileSize, row * scene.tileSize, scene.tileSize, scene.tileSize);
    }
  }

  for (let col = 0; col < scene.cols; col += 1) {
    if (col % 2 === 0) {
      g.fillStyle(colors.centerStripe, 0.45);
      g.fillRect(
        col * scene.tileSize + 10,
        scene.gridY(rowTypes.SAFE) + 18,
        scene.tileSize - 20,
        12
      );
    }
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

function drawLaneObjects(scene, options) {
  const { riverLanes, roadLanes, platforms, vehicles, platformDecorations } = options;

  for (const lane of riverLanes) {
    for (const spawnCol of lane.spawns) {
      const width = lane.length * scene.tileSize;
      const x = spawnCol * scene.tileSize + width / 2;
      const y = scene.centerY(lane.row);

      if (lane.type === 'log') {
        const rect = scene.add.rectangle(x, y, width, scene.tileSize * 0.72, GAME_THEME.objects.log);
        rect.lane = lane;
        rect.isMainPlatform = true;
        platforms.push(rect);
      } else if (lane.type === 'logCircle') {
        const rect = scene.add.rectangle(x, y, width, scene.tileSize * 0.72, GAME_THEME.objects.logCircle);
        rect.lane = lane;
        rect.isMainPlatform = true;
        platforms.push(rect);

        const circleCount = Math.max(2, Math.floor(width / 24));
        for (let i = 0; i < circleCount; i += 1) {
          const offsetX = -width / 2 + 14 + i * ((width - 28) / Math.max(1, circleCount - 1));
          const circle = scene.add.circle(x + offsetX, y, 6, GAME_THEME.objects.logCircleCap);
          circle.host = rect;
          circle.offsetX = offsetX;
          platformDecorations.push(circle);
        }
      } else if (lane.type === 'turtle') {
        const hitbox = scene.add.rectangle(
          x,
          y,
          width,
          scene.tileSize * 0.68,
          GAME_THEME.objects.turtleHitbox,
          GAME_THEME.objects.turtleHitboxAlpha
        );
        hitbox.lane = lane;
        hitbox.isMainPlatform = true;
        platforms.push(hitbox);

        const turtleCount = Math.max(1, lane.length);
        const firstTileCenterOffset = -width / 2 + scene.tileSize / 2;

        for (let i = 0; i < turtleCount; i += 1) {
          const offsetX = firstTileCenterOffset + i * scene.tileSize;
          const deco = createTurtleDecoration(scene, x + offsetX, y, hitbox, offsetX);
          platformDecorations.push(deco);
        }
      }
    }
  }

  for (const lane of roadLanes) {
    for (const spawnCol of lane.spawns) {
      const width = lane.length * scene.tileSize;
      const x = spawnCol * scene.tileSize + width / 2;
      const y = scene.centerY(lane.row);
      const color = lane.type === 'car' ? GAME_THEME.objects.car : GAME_THEME.objects.truck;

      const rect = scene.add.rectangle(x, y, width, scene.tileSize * 0.7, color);
      rect.setStrokeStyle(2, GAME_THEME.objects.vehicleStroke);
      rect.lane = lane;
      rect.isVehicle = true;
      vehicles.push(rect);
    }
  }
}