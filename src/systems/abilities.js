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

    const dir = dirVector(attacker.facing);

    const threatenedTiles = [];
    for (let i = 1; i <= GAME_TUNING.abilities.tongueRangeTiles; i += 1) {
      threatenedTiles.push({
        col: attacker.col + dir.x * i,
        row: attacker.row + dir.y * i,
      });
    }

    const furthestTile = threatenedTiles[threatenedTiles.length - 1];

    if (!isPlayerAlive(defender)) {
      actionEffects?.drawTongue(attacker, furthestTile);
      return true;
    }

    // Find the actual hit tile so the tongue draws to where the hit occurs,
    // not always to the maximum range.
    const hitTile = threatenedTiles.find(
      (tile) => defender.col === tile.col && defender.row === tile.row
    );

    actionEffects?.drawTongue(attacker, hitTile ?? furthestTile);

    if (!hitTile) return true;

    const pullCol = clamp(attacker.col + dir.x, 0, scene.cols - 1);
    const pullRow = clamp(attacker.row + dir.y, 0, scene.rowTypes.BOTTOM_PADS);

    if (pullCol === attacker.col && pullRow === attacker.row) return true;

    // Defender is already at the pull destination — nothing to move.
    if (defender.col === pullCol && defender.row === pullRow) return true;

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

  function canFireTongue(attacker, time) {
    if (destroyed || !isPlayerAlive(attacker)) return false;
    if (time - attacker.lastTongueTime < GAME_TUNING.player.tongueCooldownMs) return false;
    attacker.lastTongueTime = time;
    return true;
  }

  function applyTongueHit(attacker, defender, serverPullCol, serverPullRow, serverAttackerFacing) {
    if (destroyed || !attacker || !defender) return;

    let pullCol, pullRow;
    if (serverPullCol !== undefined && serverPullRow !== undefined) {
      pullCol = serverPullCol;
      pullRow = serverPullRow;
      if (serverAttackerFacing) attacker.facing = serverAttackerFacing;
    } else {
      const dir = dirVector(attacker.facing);
      pullCol = clamp(attacker.col + dir.x, 0, scene.cols - 1);
      pullRow = clamp(attacker.row + dir.y, 0, scene.rowTypes.BOTTOM_PADS);
      if (pullCol === attacker.col && pullRow === attacker.row) return;
    }

    const targetX = scene.centerX(pullCol);
    const targetY = scene.centerY(pullRow);

    // Update tile coords immediately so game logic (collision, scoring) sees
    // the new position right away.
    defender.col    = pullCol;
    defender.row    = pullRow;
    defender.facing = oppositeFacing(attacker.facing);

    // Block server ticks from overwriting until the server confirms the pulled
    // tile. The lock is released by:
    //   1. _applyServerTick when the server echoes back the expected position
    //   2. handlePlayerInput when the defender voluntarily moves
    //   3. resetPlayerTransientState when the player respawns or round resets
    defender.serverPosLocked = true;
    defender.expectedPullCol = pullCol;
    defender.expectedPullRow = pullRow;

    // Visual — pop + red tint immediately, then slide to the pulled tile so
    // the hit animation plays *during* the movement.
    playerFeedback?.pop(defender);
    for (const child of defender.sprite?.list ?? []) {
      if (child.setTint) child.setTint(0xff4d4d);
    }

    scene.tweens.add({
      targets:  defender.sprite,
      x:        targetX,
      y:        targetY,
      duration: 150,
      ease:     'Back.Out',
      onComplete: () => {
        if (defender.sprite?.active) {
          defender.sprite.x = targetX;
          defender.sprite.y = targetY;
        }
        effects?.spawnImpact(targetX, targetY, attacker.accent);
      },
    });

    scene.time.delayedCall(200, () => {
      if (!destroyed && defender.sprite?.active) {
        for (const child of defender.sprite.list ?? []) {
          if (child.clearTint) child.clearTint();
        }
      }
    });

    announcer?.showStatus(attacker.id === 'red' ? 'RIB SNAGS BIT!' : 'BIT SNAGS RIB!');
  }

  function destroy() {
    destroyed = true;
  }

  return {
    tryTongue,
    canFireTongue,
    applyTongueHit,
    destroy,
  };
}