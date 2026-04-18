import { clamp, dirVector, oppositeFacing } from './helpers';
import { GAME_TUNING } from '../config/gameTuning';
import { isPlayerAlive } from './playerLifecycle';

export function createAbilitiesSystem(scene, options = {}) {
  const {
    actionEffects,
    playerFeedback,
    announcer,
    effects,
  } = options;

  let destroyed = false;

  function tryTongue(attacker, time) {
    if (destroyed || !isPlayerAlive(attacker)) return false;
    if (time - attacker.lastTongueTime < GAME_TUNING.player.tongueCooldownMs) return false;

    attacker.lastTongueTime = time;

    const defender = attacker.id === 'red' ? scene.players.blue : scene.players.red;
    if (!isPlayerAlive(defender)) return false;

    const dir = dirVector(attacker.facing);

    const threatenedTiles = [];
    for (let i = 1; i <= GAME_TUNING.abilities.tongueRangeTiles; i += 1) {
      threatenedTiles.push({
        col: attacker.col + dir.x * i,
        row: attacker.row + dir.y * i,
      });
    }

    const furthestTile = threatenedTiles[threatenedTiles.length - 1];
    actionEffects?.drawTongue(attacker, furthestTile);

    const hit = threatenedTiles.some(
      (tile) => defender.col === tile.col && defender.row === tile.row
    );

    if (!hit) return false;

    const pullCol = clamp(attacker.col + dir.x, 0, scene.cols - 1);
    const pullRow = clamp(attacker.row + dir.y, 0, scene.rowTypes.BOTTOM_PADS);

    if (pullCol === attacker.col && pullRow === attacker.row) return false;

    defender.col = pullCol;
    defender.row = pullRow;
    defender.facing = oppositeFacing(attacker.facing);
    defender.sprite.x = scene.centerX(defender.col);
    defender.sprite.y = scene.centerY(defender.row);

    playerFeedback?.pop(defender);
    playerFeedback?.flashAndShake(defender);

    announcer?.showStatus(attacker.id === 'red' ? 'RIB SNAGS BIT!' : 'BIT SNAGS RIB!');
    effects?.spawnImpact(defender.sprite.x, defender.sprite.y, attacker.accent);

    return true;
  }

  function destroy() {
    destroyed = true;
  }

  return {
    tryTongue,
    destroy,
  };
}