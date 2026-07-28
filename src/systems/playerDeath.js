import {
  PLAYER_STATES,
  canPlayerStartDeath,
  setPlayerState,
} from './playerLifecycle';

export const DEATH_TYPES = {
  river: {
    respawnAnnouncement: (player) =>
      player.id === 'red' ? 'RIB TAKES A DIP!' : 'BIT TAKES A DIP!',

    sfx: ({ audio }) => {
      audio?.playSplash?.();
    },

    start: ({ effects, player }) => {
      effects?.spawnSplash?.(player.sprite.x, player.sprite.y);
    },

    tween: ({ scene, player, finishDeath }) => {
      const { sprite } = player;

      player.deathTimer = scene.tweens.add({
        targets: sprite,
        y: sprite.y + 10,
        alpha: 0,
        duration: 400,
        ease: 'Sine.easeIn',
        onComplete: () => finishDeath(player, 'river'),
      });
    },
  },

  traffic: {
    respawnAnnouncement: (player) =>
      player.id === 'red' ? 'RIB WIPED OUT!' : 'BIT WIPED OUT!',

    sfx: ({ audio }) => {
      audio?.playHit?.();
    },

    tween: ({ scene, player, finishDeath }) => {
      const { sprite } = player;

      player.deathTimer = scene.tweens.add({
        targets: sprite,
        angle: 180,
        alpha: 0,
        duration: 400,
        ease: 'Cubic.easeOut',
        onComplete: () => finishDeath(player, 'traffic'),
      });
    },
  },
};

export function createPlayerDeathSystem(
  scene,
  {
    effects,
    audio,
    playerState,
  } = {}
) {
  let destroyed = false;

  function requestPlayerDeath(player, cause = 'generic', options = {}) {
    if (destroyed || !player?.sprite?.active) return false;
    if (!canPlayerStartDeath(player)) return false;

    beginPlayerDeath(player, cause, options);
    return true;
  }

  function beginPlayerDeath(player, cause, options = {}) {
    const deathType = DEATH_TYPES[cause] || null;

    setPlayerState(player, PLAYER_STATES.DYING);
    player.deathCause = cause;

    clearTimer(player);
    stopPlayerMotion(player);

    if (!deathType) {
      finishDeath(player, cause);
      return;
    }

    deathType.start?.({ scene, effects, audio, player, options });
    deathType.sfx?.({ scene, effects, audio, player, options });
    deathType.tween?.({
      scene,
      effects,
      audio,
      player,
      options,
      finishDeath,
    });
  }

  function stopPlayerMotion(player) {
    const { sprite } = player;

    scene.tweens.killTweensOf(sprite);
    scene.tweens.killTweensOf(player.shadow);

    if (sprite.body?.setVelocity) {
      sprite.body.setVelocity(0, 0);
    }
  }

  function finishDeath(player, cause) {
    clearTimer(player);

    const deathType = DEATH_TYPES[cause] || null;

    playerState?.beginRespawn(player, {
      cause,
      deathType,
    });
  }

  // Network mode: the server owns `state` and position, so this plays death
  // *visuals only* — splash + sfx + a fade on fields the server never writes
  // (alpha; angle for traffic). No finishDeath, no setPlayerState, no position
  // change (the river tween's `y + 10` is dropped — the server owns y). The
  // fade tween is parked on player._netDeathTween so _applyServerTick can end
  // it at the server-driven respawn transition.
  function playDeathEffects(player, cause) {
    if (destroyed || !player?.sprite) return;

    const deathType = DEATH_TYPES[cause] || null;
    if (!deathType) return;

    deathType.start?.({ scene, effects, audio, player });
    deathType.sfx?.({ scene, effects, audio, player });

    if (player._netDeathTween) {
      player._netDeathTween.stop();
      player._netDeathTween = null;
    }

    const cfg = cause === 'traffic'
      ? { targets: player.sprite, angle: 180, alpha: 0, duration: 400, ease: 'Cubic.easeOut' }
      : { targets: player.sprite, alpha: 0, duration: 400, ease: 'Sine.easeIn' };

    player._netDeathTween = scene.tweens.add(cfg);
  }

  function clearTimer(player) {
    if (player.deathTimer) {
      player.deathTimer.stop();
      player.deathTimer = null;
    }
  }

  function destroy() {
    destroyed = true;
  }

  return {
    requestPlayerDeath,
    beginPlayerDeath,
    playDeathEffects,
    destroy,
  };
}