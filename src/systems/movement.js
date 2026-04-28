import { clamp } from './helpers';
import { GAME_TUNING } from '../config/gameTuning';
import { isPlayerAlive } from './playerLifecycle';

export function createMovementSystem(scene, options = {}) {
  const {
    onMove,
    requestPlayerDeath,
    riverRows = GAME_TUNING.board.riverRows,
    platformSupport = null,
  } = options;

  let destroyed = false;
  const riverRowSet = new Set(riverRows);
  const riverAnchorDebugByPlayerId = Object.create(null);

  function getPlayerId(player) {
    return player?.id ?? 'unknown';
  }

  function ensureRiverAnchorDebugSnapshot(player) {
    const playerId = getPlayerId(player);

    if (!riverAnchorDebugByPlayerId[playerId]) {
      riverAnchorDebugByPlayerId[playerId] = {
        supported: false,
        supportedPlatformType: 'none',
        supportedPlatformRow: null,
        platformCenterCol: null,
        nearestVisualCol: null,
        anchoredCol: null,
        baseColUsed: null,
        slotCols: [],
        slotColsText: '-',
      };
    }

    return riverAnchorDebugByPlayerId[playerId];
  }

  function setRiverAnchorDebugSnapshot(player, data = {}) {
    const snapshot = ensureRiverAnchorDebugSnapshot(player);

    snapshot.supported = Boolean(data.supported);
    snapshot.supportedPlatformType = data.supportedPlatformType ?? 'none';
    snapshot.supportedPlatformRow = data.supportedPlatformRow ?? null;
    snapshot.platformCenterCol = Number.isFinite(data.platformCenterCol)
      ? data.platformCenterCol
      : null;
    snapshot.nearestVisualCol = Number.isFinite(data.nearestVisualCol)
      ? data.nearestVisualCol
      : null;
    snapshot.anchoredCol = Number.isFinite(data.anchoredCol)
      ? data.anchoredCol
      : null;
    snapshot.baseColUsed = Number.isFinite(data.baseColUsed)
      ? data.baseColUsed
      : null;
    snapshot.slotCols = Array.isArray(data.slotCols) ? data.slotCols.slice() : [];
    snapshot.slotColsText = snapshot.slotCols.length
      ? `[${snapshot.slotCols.join(',')}]`
      : '-';

    return snapshot;
  }

  function getRiverAnchorDebugSnapshot(player) {
    return ensureRiverAnchorDebugSnapshot(player);
  }

  function clearRiverAnchorDebugSnapshot(player) {
    setRiverAnchorDebugSnapshot(player, {
      supported: false,
      supportedPlatformType: 'none',
      supportedPlatformRow: null,
      platformCenterCol: null,
      nearestVisualCol: null,
      anchoredCol: null,
      baseColUsed: null,
      slotCols: [],
    });
  }

  function getPlayerHalfWidth(player) {
    return platformSupport?.getPlayerHalfWidth?.(player)
      ?? player.body?.radius
      ?? scene.tileSize * 0.28;
  }

  function platformUnderPlayer(player) {
    return platformSupport?.findSupportingPlatform?.(player) ?? null;
  }

  function colToCenterX(col) {
    return scene.centerX(col);
  }

  function xToNearestCol(x) {
    return clamp(
      Math.round((x - scene.tileSize / 2) / scene.tileSize),
      0,
      scene.cols - 1
    );
  }

  function getPlatformLengthInTiles(platform) {
    const laneLength = platform?.lane?.length;
    if (Number.isFinite(laneLength) && laneLength > 0) {
      return laneLength;
    }

    return Math.max(
      1,
      Math.round((platform?.width ?? scene.tileSize) / scene.tileSize)
    );
  }

  function dedupeSortedCols(cols) {
    const unique = Array.from(new Set(cols));
    unique.sort((a, b) => a - b);
    return unique;
  }

  function getPlatformLogicalSlotCols(platform) {
    if (!platform) return [];

    const length = getPlatformLengthInTiles(platform);
    const centerCol = xToNearestCol(platform.x);
    const half = Math.floor(length / 2);
    const cols = [];

    if (length % 2 === 1) {
      for (let i = -half; i <= half; i += 1) {
        cols.push(clamp(centerCol + i, 0, scene.cols - 1));
      }
      return dedupeSortedCols(cols);
    }

    const leftCenterX = platform.x - (scene.tileSize / 2);
    const leftCenterCol = xToNearestCol(leftCenterX);

    for (let i = 0; i < length; i += 1) {
      cols.push(clamp(leftCenterCol + i, 0, scene.cols - 1));
    }

    return dedupeSortedCols(cols);
  }

  function getNearestColInList(targetCol, cols) {
    if (!cols.length) return clamp(targetCol, 0, scene.cols - 1);

    let bestCol = cols[0];
    let bestDistance = Math.abs(targetCol - bestCol);

    for (let i = 1; i < cols.length; i += 1) {
      const distance = Math.abs(targetCol - cols[i]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCol = cols[i];
      }
    }

    return bestCol;
  }

  function refreshRiverAnchorDebug(player, baseColUsed = null) {
    if (!player || destroyed || !isPlayerAlive(player)) {
      clearRiverAnchorDebugSnapshot(player);
      return null;
    }

    if (!riverRowSet.has(player.row)) {
      clearRiverAnchorDebugSnapshot(player);
      return null;
    }

    const platform = platformUnderPlayer(player);
    if (!platform) {
      setRiverAnchorDebugSnapshot(player, {
        supported: false,
        supportedPlatformType: 'none',
        supportedPlatformRow: player.row,
        platformCenterCol: null,
        nearestVisualCol: xToNearestCol(player.sprite.x),
        anchoredCol: null,
        baseColUsed,
        slotCols: [],
      });
      return null;
    }

    const slotCols = getPlatformLogicalSlotCols(platform);
    const nearestVisualCol = xToNearestCol(player.sprite.x);
    const anchoredCol = slotCols.length
      ? getNearestColInList(nearestVisualCol, slotCols)
      : null;

    setRiverAnchorDebugSnapshot(player, {
      supported: true,
      supportedPlatformType: platform?.lane?.type ?? 'unknown',
      supportedPlatformRow: platform?.lane?.row ?? player.row,
      platformCenterCol: xToNearestCol(platform.x),
      nearestVisualCol,
      anchoredCol,
      baseColUsed,
      slotCols,
    });

    return {
      platform,
      slotCols,
      anchoredCol,
      nearestVisualCol,
      platformCenterCol: xToNearestCol(platform.x),
    };
  }

  function shouldAnchorRiverHorizontalMove(player, dx, dy) {
    if (!platformSupport) return false;
    if (dy !== 0) return false;
    if (dx === 0) return false;
    if (!riverRowSet.has(player.row)) return false;
    if (!isPlayerAlive(player)) return false;

    return Boolean(platformUnderPlayer(player));
  }

  function getAnchoredRiverHorizontalBaseCol(player) {
    const debug = refreshRiverAnchorDebug(player);
    if (!debug?.platform) return null;

    return {
      platform: debug.platform,
      slotCols: debug.slotCols,
      anchoredCol: debug.anchoredCol,
      minCol: debug.slotCols[0],
      maxCol: debug.slotCols[debug.slotCols.length - 1],
      nearestVisualCol: debug.nearestVisualCol,
      platformCenterCol: debug.platformCenterCol,
    };
  }

  function tryMove(player, dx, dy, facing) {
    if (destroyed || !isPlayerAlive(player)) return false;
    player.setPupilDirection?.(facing);

    let baseCol = player.col;

    if (shouldAnchorRiverHorizontalMove(player, dx, dy)) {
      const anchor = getAnchoredRiverHorizontalBaseCol(player);

      if (anchor) {
        baseCol = anchor.anchoredCol;
        player.col = baseCol;
        player.sprite.x = colToCenterX(baseCol);
        refreshRiverAnchorDebug(player, baseCol);
      }
    } else if (riverRowSet.has(player.row)) {
      refreshRiverAnchorDebug(player, baseCol);
    } else {
      clearRiverAnchorDebugSnapshot(player);
    }

    const newCol = clamp(baseCol + dx, 0, scene.cols - 1);
    const newRow = clamp(player.row + dy, 0, scene.rowTypes.BOTTOM_PADS);

    if (newCol === player.col && newRow === player.row) {
      return false;
    }

    player.facing = facing;
    player.col = newCol;
    player.row = newRow;
    player.sprite.x = scene.centerX(player.col);
    player.sprite.y = scene.centerY(player.row);

    if (riverRowSet.has(player.row)) {
      platformSupport?.recordPostMove?.(player);
      refreshRiverAnchorDebug(player, baseCol);
    } else {
      clearRiverAnchorDebugSnapshot(player);
    }

    onMove?.(player);
    return true;
  }

  function isPlayerHalfOffscreenX(player) {
    const halfWidth = getPlayerHalfWidth(player);
    const triggerOffset = halfWidth * 0.5;

    return (
      player.sprite.x < 0 + triggerOffset ||
      player.sprite.x > scene.width - triggerOffset
    );
  }

  function applyPlatformCarry(player, dt) {
    if (destroyed || !isPlayerAlive(player)) return;
    if (!riverRowSet.has(player.row)) {
      clearRiverAnchorDebugSnapshot(player);
      return;
    }

    const platform = platformUnderPlayer(player);
    platformSupport?.markCarriedThisFrame?.(player, false);

    if (!platform) {
      refreshRiverAnchorDebug(player, player.col);
      return;
    }

    player.sprite.x += platform.lane.dir * platform.lane.speed * dt;
    platformSupport?.markCarriedThisFrame?.(player, true);

    const derivedCol = Math.round(
      (player.sprite.x - scene.tileSize / 2) / scene.tileSize
    );
    player.col = clamp(derivedCol, 0, scene.cols - 1);

    platformSupport?.recordPostCarry?.(player);
    refreshRiverAnchorDebug(player, player.col);

    if (isPlayerHalfOffscreenX(player)) {
      requestPlayerDeath?.(player, 'river');
    }
  }

  function destroy() {
    destroyed = true;
  }

  return {
    tryMove,
    applyPlatformCarry,
    platformUnderPlayer,
    getRiverAnchorDebugSnapshot,
    destroy,
  };
}