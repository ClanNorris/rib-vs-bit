import { PLAYER_STATES } from '../systems/playerLifecycle';

export function createPlayer(scene, config) {
  const container = scene.add.container(
    scene.centerX(config.startCol),
    scene.centerY(config.startRow)
  );
  container.setDepth(5);

  const shadow = scene.add.ellipse(0, 18, 22, 10, 0x000000, 0.22);
  const body = scene.add.circle(0, 0, scene.tileSize * 0.28, config.color);
  body.setStrokeStyle(3, 0x052e16);

  const leftEye = scene.add.circle(-9, -12, 4, 0xffffff);
  const rightEye = scene.add.circle(9, -12, 4, 0xffffff);
  const leftPupil = scene.add.circle(-9, -12, 2, 0x111827);
  const rightPupil = scene.add.circle(9, -12, 2, 0x111827);
  const headband = scene.add.rectangle(0, -6, scene.tileSize * 0.42, 8, config.accent);
  const headbandTail = scene.add.rectangle(12, -5, 10, 3, config.accent);
  const wristL = scene.add.circle(-15, 6, 4, config.accent);
  const wristR = scene.add.circle(15, 6, 4, config.accent);

  container.add([
    shadow,
    body,
    headband,
    headbandTail,
    leftEye,
    rightEye,
    leftPupil,
    rightPupil,
    wristL,
    wristR,
  ]);

  return {
    ...config,
    sprite: container,
    shadow,
    body,
    col: config.startCol,
    row: config.startRow,
    lastMoveTime: 0,
    lastTongueTime: 0,

    respawnReadyAt: 0,
    respawnInvulnUntil: 0,

    state: PLAYER_STATES.ALIVE,
    deathCause: null,
    deathTimer: null,

    controls: null,

    setPupilDirection(facing) {
      const OFFSET = 1.5;
      const map = { up: [0, -OFFSET], down: [0, OFFSET], left: [-OFFSET, 0], right: [OFFSET, 0] };
      const [ox, oy] = map[facing] ?? [0, 0];
      leftPupil.setPosition(-9 + ox, -12 + oy);
      rightPupil.setPosition(9 + ox, -12 + oy);
    },
  };
}