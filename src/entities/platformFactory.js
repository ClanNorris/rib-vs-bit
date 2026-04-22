import * as Phaser from 'phaser';

export function createLilyPad(scene, col, row, owner, index, options = {}) {
  const { offsetY = 0 } = options;

  const pad = scene.add.ellipse(
    scene.centerX(col),
    scene.centerY(row) + offsetY,
    scene.tileSize * 0.78,
    scene.tileSize * 0.5,
    0x22c55e
  );

  pad.setStrokeStyle(3, owner === 'blue' ? 0x60a5fa : 0xf87171);
  pad.owner = owner;
  pad.col = col;
  pad.row = row;
  pad.index = index;
  pad.activePad = true;
  return pad;
}

export function createTurtleDecoration(scene, x, y, host, offsetX) {
  const container = scene.add.container(x, y);

  const leftFoot = scene.add.circle(-9, 7, 3, 0x16a34a);
  const rightFoot = scene.add.circle(9, 7, 3, 0x16a34a);
  const leftHand = scene.add.circle(-9, -7, 3, 0x16a34a);
  const rightHand = scene.add.circle(9, -7, 3, 0x16a34a);
  const head = scene.add.circle(0, -11, 4, 0x16a34a);
  const shell = scene.add.ellipse(0, 0, 18, 14, 0xef4444);

  shell.setStrokeStyle(2, 0x2563eb);

  container.add([leftFoot, rightFoot, leftHand, rightHand, head, shell]);

  // Face east / right.
  container.setRotation(Phaser.Math.DegToRad(90));

  container.host = host;
  container.offsetX = offsetX;

  // Decorative-only turtle animation metadata.
  // These values are intentionally subtle so readability stays clean.
  container.isTurtleDecoration = true;
  container.turtleBaseScale = 1.3;
  container.turtleBobAmplitude = 3;
  container.turtleBobSpeed = 0.0035;
  container.turtlePulseAmplitude = 0.05;

  // Slight deterministic phase offset so turtles in a group do not move identically.
  container.turtleBobPhase = offsetX * 0.045;

  return container;
}