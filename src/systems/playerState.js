import {
  PLAYER_STATES,
  isPlayerRespawning,
  isPlayerInvulnerable,
  setPlayerState,
} from './playerLifecycle';

export function createPlayerStateSystem(scene, options = {}) {
  const {
    announcer,
    respawnInvulnMs = 1200,
  } = options;

  let destroyed = false;

  function getSpawnPosition(player) {
    const col = player.startCol;
    const row = player.startRow;

    return {
      col,
      row,
      x: scene.centerX(col),
      y: scene.centerY(row),
    };
  }

  function getRespawnAnnouncement(player, respawnContext) {
    return respawnContext?.deathType?.respawnAnnouncement?.(player) ?? null;
  }

  function showResetMessage(message) {
    if (!message || !announcer) return;

    if (announcer.showMessage) {
      announcer.showMessage(message);
      return;
    }

    if (announcer.showStatus) {
      announcer.showStatus(message);
    }
  }

  function stopPlayerMotion(player) {
    const { sprite } = player;

    scene.tweens.killTweensOf(sprite);
    scene.tweens.killTweensOf(player.shadow);

    if (sprite.body?.setVelocity) {
      sprite.body.setVelocity(0, 0);
    }
  }

  function resetPlayerTransientState(player) {
    player.deathTimer = null;
    player.lastMoveTime = 0;
    player.lastTongueTime = 0;
    player.respawnReadyAt = 0;
    player.respawnInvulnUntil = 0;
  }

  function resetPlayerVisualState(player, spawn) {
    const { sprite, shadow } = player;

    player.col = spawn.col;
    player.row = spawn.row;

    sprite.setActive(true);
    sprite.setVisible(true);
    sprite.setAlpha(1);
    sprite.setAngle(0);
    sprite.setScale(1);
    sprite.setPosition(spawn.x, spawn.y);

    if (shadow) {
      shadow.setVisible(true);
      shadow.setAlpha(1);
    }
  }

  function beginRespawn(player, respawnContext = null, silent = false) {
    if (!player?.sprite || destroyed) return;

    const spawn = getSpawnPosition(player);

    stopPlayerMotion(player);
    resetPlayerTransientState(player);
    resetPlayerVisualState(player, spawn);

    setPlayerState(player, PLAYER_STATES.RESPAWNING);

    player.deathCause = respawnContext?.cause ?? null;
    player.respawnReadyAt = scene.time.now;

    if (!silent) {
      const msg = getRespawnAnnouncement(player, respawnContext);
      showResetMessage(msg);
    }
  }

  function enterInvulnerable(player, now) {
    setPlayerState(player, PLAYER_STATES.INVULNERABLE);
    player.respawnInvulnUntil = now + respawnInvulnMs;

    if (player.sprite) {
      player.sprite.setAlpha(0.82);
    }

    if (player.shadow) {
      player.shadow.setAlpha(0.7);
    }
  }

  function enterAlive(player) {
    setPlayerState(player, PLAYER_STATES.ALIVE);
    player.deathCause = null;
    player.respawnInvulnUntil = 0;

    if (player.sprite) {
      player.sprite.setAlpha(1);
    }

    if (player.shadow) {
      player.shadow.setAlpha(1);
    }
  }

  function updatePlayer(player, time) {
    if (!player) return;

    if (isPlayerRespawning(player) && time >= player.respawnReadyAt) {
      enterInvulnerable(player, time);
      return;
    }

    if (isPlayerInvulnerable(player) && time >= player.respawnInvulnUntil) {
      enterAlive(player);
    }
  }

  function update(time) {
    if (destroyed) return;

    updatePlayer(scene.players?.red, time);
    updatePlayer(scene.players?.blue, time);
  }

  function respawnPlayer(player, respawnContext = null, silent = false) {
    beginRespawn(player, respawnContext, silent);
  }

  function destroy() {
    destroyed = true;
  }

  return {
    update,
    beginRespawn,
    respawnPlayer,
    resetPlayer: respawnPlayer,
    destroy,
  };
}