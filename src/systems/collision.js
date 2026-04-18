import { GAME_TUNING } from '../config/gameTuning';
import { isPlayerHazardVulnerable } from './playerLifecycle';

export function createCollisionSystem(scene, options = {}) {
  const {
    onTrafficHit,
    onWaterFall,
    roadRows = GAME_TUNING.board.roadRows,
    riverRows = GAME_TUNING.board.riverRows,
  } = options;

  let destroyed = false;
  let resolvePlatformUnderPlayer = null;
  const roadRowSet = new Set(roadRows);
  const riverRowSet = new Set(riverRows);

  function setPlatformUnderPlayerResolver(resolver) {
    resolvePlatformUnderPlayer = resolver;
  }

  function overlapPlayerWithRect(player, rect, widthFactor = 1) {
    const px = player.sprite.x;
    const py = player.sprite.y;
    const halfW = (rect.width * widthFactor) / 2;
    const halfH = rect.height / 2;

    return (
      px > rect.x - halfW &&
      px < rect.x + halfW &&
      py > rect.y - halfH &&
      py < rect.y + halfH
    );
  }

  function getPlayerHalfWidth(player) {
    const bodyRadius = player.body?.radius ?? scene.tileSize * 0.28;
    const strokeWidth = player.body?.lineWidth ?? 0;
    return bodyRadius + strokeWidth / 2;
  }

  function isPlayerFullyOffscreenX(player) {
    const halfWidth = getPlayerHalfWidth(player);
    const leftEdge = player.sprite.x - halfWidth;
    const rightEdge = player.sprite.x + halfWidth;

    return rightEdge < 0 || leftEdge > scene.width;
  }

  function isPlayerNearHorizontalEdge(player) {
    const edgeMargin = scene.tileSize * 0.5;

    return (
      player.sprite.x <= edgeMargin ||
      player.sprite.x >= scene.width - edgeMargin
    );
  }

  function checkPlayerHazards(player) {
    if (destroyed || !isPlayerHazardVulnerable(player)) return;

    if (roadRowSet.has(player.row)) {
      for (const vehicle of scene.vehicles) {
        if (vehicle.lane.row !== player.row) continue;

        if (overlapPlayerWithRect(player, vehicle)) {
          onTrafficHit?.(player, vehicle);
          return;
        }
      }
    }

    if (riverRowSet.has(player.row)) {
      const onPlatform = resolvePlatformUnderPlayer?.(player);

      if (onPlatform) return;

      if (isPlayerFullyOffscreenX(player)) {
        onWaterFall?.(player);
        return;
      }

      if (!isPlayerNearHorizontalEdge(player)) {
        onWaterFall?.(player);
      }
    }
  }

  function destroy() {
    destroyed = true;
    resolvePlatformUnderPlayer = null;
  }

  return {
    setPlatformUnderPlayerResolver,
    overlapPlayerWithRect,
    checkPlayerHazards,
    destroy,
  };
}