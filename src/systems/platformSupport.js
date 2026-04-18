import { GAME_TUNING } from '../config/gameTuning';
import { isPlayerAlive } from './playerLifecycle';

export function createPlatformSupportSystem(scene, options = {}) {
  const {
    riverRows = GAME_TUNING.board.riverRows,
    supportWidthMultiplier = GAME_TUNING.platformSupport.supportWidthMultiplier,
    minimumOverlapPx = GAME_TUNING.platformSupport.minimumOverlapPx,
  } = options;

  let destroyed = false;
  const riverRowSet = new Set(riverRows);
  const snapshotByPlayerId = Object.create(null);

  function getPlayerId(player) {
    return player?.id ?? 'unknown';
  }

  function ensureSnapshot(player) {
    const playerId = getPlayerId(player);

    if (!snapshotByPlayerId[playerId]) {
      snapshotByPlayerId[playerId] = {
        supported: false,
        platformType: 'none',
        platformRow: null,
        overlapPx: 0,
        footprintPx: 0,
        carriedThisFrame: false,
        unsupportedAfterMove: false,
        unsupportedAfterCarry: false,
      };
    }

    return snapshotByPlayerId[playerId];
  }

  function resetFrameFlags(player) {
    const snapshot = ensureSnapshot(player);
    snapshot.carriedThisFrame = false;
    snapshot.unsupportedAfterMove = false;
    snapshot.unsupportedAfterCarry = false;
  }

  function getPlayerHalfWidth(player) {
    const bodyRadius = player?.body?.radius ?? scene.tileSize * 0.28;
    const strokeWidth = player?.body?.lineWidth ?? 0;
    return bodyRadius + strokeWidth / 2;
  }

  function getSupportHalfWidth(player) {
    return Math.max(1, getPlayerHalfWidth(player) * supportWidthMultiplier);
  }

  function isRiverRow(row) {
    return riverRowSet.has(row);
  }

  function isPlayerWithinPlatformBand(player, platform) {
    const py = player.sprite.y;
    const halfH = platform.height / 2;
    return py > platform.y - halfH && py < platform.y + halfH;
  }

  function getHorizontalSupportOverlap(player, platform) {
    const playerHalfWidth = getSupportHalfWidth(player);
    const playerLeft = player.sprite.x - playerHalfWidth;
    const playerRight = player.sprite.x + playerHalfWidth;
    const platformHalfWidth = platform.width / 2;
    const platformLeft = platform.x - platformHalfWidth;
    const platformRight = platform.x + platformHalfWidth;

    return Math.max(0, Math.min(playerRight, platformRight) - Math.max(playerLeft, platformLeft));
  }

  function updateSnapshot(player, platform, overlapPx) {
    const snapshot = ensureSnapshot(player);
    snapshot.supported = Boolean(platform);
    snapshot.platformType = platform?.lane?.type ?? 'none';
    snapshot.platformRow = platform?.lane?.row ?? null;
    snapshot.overlapPx = Math.round(overlapPx || 0);
    snapshot.footprintPx = Math.round(getSupportHalfWidth(player) * 2);
    return snapshot;
  }

  function findSupportingPlatform(player) {
    if (destroyed || !isPlayerAlive(player) || !isRiverRow(player?.row)) {
      updateSnapshot(player, null, 0);
      return null;
    }

    let bestPlatform = null;
    let bestOverlap = 0;

    for (const platform of scene.platforms) {
      if (!platform.isMainPlatform) continue;
      if (platform.lane.row !== player.row) continue;
      if (!isPlayerWithinPlatformBand(player, platform)) continue;

      const overlapPx = getHorizontalSupportOverlap(player, platform);
      if (overlapPx < minimumOverlapPx) continue;
      if (overlapPx <= bestOverlap) continue;

      bestPlatform = platform;
      bestOverlap = overlapPx;
    }

    updateSnapshot(player, bestPlatform, bestOverlap);
    return bestPlatform;
  }

  function recordPostMove(player) {
    if (destroyed) return null;

    const platform = findSupportingPlatform(player);
    const snapshot = ensureSnapshot(player);
    snapshot.unsupportedAfterMove = isRiverRow(player?.row) && !platform;
    return platform;
  }

  function recordPostCarry(player) {
    if (destroyed) return null;

    const platform = findSupportingPlatform(player);
    const snapshot = ensureSnapshot(player);
    snapshot.unsupportedAfterCarry = isRiverRow(player?.row) && !platform;
    return platform;
  }

  function markCarriedThisFrame(player, value) {
    const snapshot = ensureSnapshot(player);
    snapshot.carriedThisFrame = Boolean(value);
  }

  function getSupportSnapshot(player) {
    return ensureSnapshot(player);
  }

  function destroy() {
    destroyed = true;
  }

  return {
    isRiverRow,
    getPlayerHalfWidth,
    getSupportHalfWidth,
    getHorizontalSupportOverlap,
    isPlayerWithinPlatformBand,
    findSupportingPlatform,
    recordPostMove,
    recordPostCarry,
    markCarriedThisFrame,
    resetFrameFlags,
    getSupportSnapshot,
    destroy,
  };
}