export const PLAYER_STATES = Object.freeze({
  ALIVE: 'alive',
  DYING: 'dying',
  RESPAWNING: 'respawning',
  INVULNERABLE: 'invulnerable',
});

export function getPlayerState(player) {
  return player?.state ?? PLAYER_STATES.ALIVE;
}

/**
 * Compatibility helper for existing gameplay systems.
 * "Alive" here means the player is in active gameplay and can act:
 * - alive
 * - invulnerable
 */
export function isPlayerAlive(player) {
  const state = getPlayerState(player);

  return (
    state === PLAYER_STATES.ALIVE ||
    state === PLAYER_STATES.INVULNERABLE
  );
}

export function isPlayerDying(player) {
  return getPlayerState(player) === PLAYER_STATES.DYING;
}

export function isPlayerRespawning(player) {
  return getPlayerState(player) === PLAYER_STATES.RESPAWNING;
}

export function isPlayerInvulnerable(player) {
  return getPlayerState(player) === PLAYER_STATES.INVULNERABLE;
}

export function isPlayerHazardVulnerable(player) {
  return getPlayerState(player) === PLAYER_STATES.ALIVE;
}

export function canPlayerAct(player) {
  return isPlayerAlive(player);
}

export function canPlayerStartDeath(player) {
  return getPlayerState(player) === PLAYER_STATES.ALIVE;
}

export function setPlayerState(player, nextState) {
  if (!player) return;

  player.state = nextState;
}