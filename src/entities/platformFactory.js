import * as Phaser from 'phaser';
import { GAME_THEME } from '../config/theme';

export function createLilyPad(scene, col, row, owner, index, options = {}) {
  const { offsetY = 0 } = options;

  const radius = scene.tileSize * 0.39;
  const notchHalf = 0.436; // ~25°, total wedge ~50° (0.87 rad)
  const notchStart = -Math.PI / 2 - notchHalf;
  const notchEnd = -Math.PI / 2 + notchHalf;

  const pad = scene.add.graphics();

  pad.fillStyle(0x22c55e, 1);
  pad.beginPath();
  pad.arc(0, 0, radius, notchEnd, notchStart, false);
  pad.lineTo(0, 0);
  pad.closePath();
  pad.fillPath();

  pad.lineStyle(3, owner === 'blue' ? 0x60a5fa : 0xf87171, 1);
  pad.beginPath();
  pad.arc(0, 0, radius, notchEnd, notchStart, false);
  pad.lineTo(0, 0);
  pad.closePath();
  pad.strokePath();

  pad.scaleY = 0.5 / 0.78;

  pad.x = scene.centerX(col);
  pad.y = scene.centerY(row) + offsetY;
  pad.setDepth(1);
  pad.owner = owner;
  pad.col = col;
  pad.row = row;
  pad.index = index;
  pad.activePad = true;
  pad._homeX = pad.x;
  pad._homeY = pad.y;
  return pad;
}

export function createTurtleDecoration(scene, x, y, host, offsetX, dir) {
  const container = scene.add.container(x, y);

  const leftFoot = scene.add.circle(-9, 7, 3, 0x16a34a);
  const rightFoot = scene.add.circle(9, 7, 3, 0x16a34a);
  const leftHand = scene.add.circle(-9, -7, 3, 0x16a34a);
  const rightHand = scene.add.circle(9, -7, 3, 0x16a34a);
  const head = scene.add.circle(0, -11, 4, 0x16a34a);
  const shell = scene.add.ellipse(0, 0, 18, 14, 0xef4444);

  shell.setStrokeStyle(2, 0x2563eb);

  container.add([leftFoot, rightFoot, leftHand, rightHand, head, shell]);

  // Face direction of travel: +90° = east (dir 1), -90° = west (dir -1).
  // Note: scaleX-based flipping (the pattern used by every other hazard
  // decoration) does NOT work here — the turtle's points are bilaterally
  // symmetric about local x=0 (head at (0,-11), feet/hands at ±9), so
  // mirroring has zero visual effect. Rotation angle must change instead.
  container.setRotation(Phaser.Math.DegToRad(90 * dir));;

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

// ── Static bush decoration ─────────────────────────────────────────────────
// One-time board decoration — never moves, unlike the lane decorations below.
// No .host/.offsetX; not wired into platformDecorations or the per-frame sync.
export function createBushCluster(scene, x, y) {
  const colors = GAME_THEME.objects;
  const container = scene.add.container(x, y);

  const shadeColor = {
    highlight: colors.bushHighlight,
    base: colors.bush,
    shadow: colors.bushShadow,
  };

  // dx, dy, r, shade — two rings of 6 around a center circle, tuned to read
  // as a dense clustered pixel-bush rather than a sparse 5-circle "plus".
  const circles = [
    { dx: 0, dy: 0, r: 9, shade: 'base' },
    { dx: 10, dy: 0, r: 7, shade: 'base' },
    { dx: 5, dy: 9, r: 7, shade: 'shadow' },
    { dx: -5, dy: 9, r: 7, shade: 'shadow' },
    { dx: -10, dy: 0, r: 7, shade: 'base' },
    { dx: -5, dy: -9, r: 7, shade: 'highlight' },
    { dx: 5, dy: -9, r: 7, shade: 'highlight' },
    { dx: 9, dy: 5, r: 6, shade: 'shadow' },
    { dx: 0, dy: 10, r: 6, shade: 'shadow' },
    { dx: -9, dy: 5, r: 6, shade: 'base' },
    { dx: -9, dy: -5, r: 6, shade: 'highlight' },
    { dx: 0, dy: -10, r: 6, shade: 'highlight' },
    { dx: 9, dy: -5, r: 6, shade: 'base' },
  ];

  container.add(circles.map(({ dx, dy, r, shade }) => scene.add.circle(dx, dy, r, shadeColor[shade])));

  return container;
}

// ── Log / shortLog decoration ──────────────────────────────────────────────
// Capsule shape: inset body flanked by a plain back cap and a layered front
// cap. Built facing right (front cap on the right); scaleX = dir flips it
// for leftward-moving lanes. Shared by both 'log' and 'shortLog' lane types —
// only widthPx differs between them.
export function createLogDecoration(scene, x, y, host, offsetX, widthPx, tileSize, dir) {
  const colors = GAME_THEME.objects;
  const container = scene.add.container(x, y);

  const capRadius = (tileSize * 0.72) / 2;
  const halfW = widthPx / 2;
  const backCapX = -halfW + capRadius;
  const frontCapX = halfW - capRadius;
  const bodyHeight = tileSize * 0.72;

  const body = scene.add.rectangle(0, 0, frontCapX - backCapX, bodyHeight, colors.log);

  const backCap = scene.add.circle(backCapX, 0, capRadius, colors.log);

  const grainLineEndX = frontCapX - capRadius * 0.5;
  const grainLineWidth = Math.max(0, grainLineEndX - backCapX);
  const grainLineCenterX = (backCapX + grainLineEndX) / 2;
  const grainLines = [-0.28, 0, 0.28].map((t) =>
    scene.add.rectangle(grainLineCenterX, bodyHeight * t, grainLineWidth, 2, colors.logGrain)
  );

  const frontCapOuter = scene.add.circle(frontCapX, 0, capRadius, colors.logGrain);
  const frontCapMid = scene.add.circle(frontCapX, 0, capRadius * 0.73, colors.log);
  const frontCapCore = scene.add.circle(frontCapX, 0, capRadius * 0.24, colors.logRingCore);

  const highlight = scene.add.rectangle(
    grainLineCenterX,
    -bodyHeight * 0.32,
    grainLineWidth * 0.9,
    3,
    colors.logHighlight
  );

  container.add([body, backCap, ...grainLines, frontCapOuter, frontCapMid, frontCapCore, highlight]);

  container.scaleX = dir;
  container.host = host;
  container.offsetX = offsetX;

  return container;
}

// ── Road vehicle decorations ───────────────────────────────────────────────
// All built facing right by default (front = right edge); scaleX = dir flips
// for leftward-moving lanes. host/offsetX drive the same generic per-frame
// sync as the log/turtle decorations (see laneSystem.updateGenericDecoration).

function addWheelPair(scene, container, xOffset, halfH) {
  const wheelColor = GAME_THEME.objects.wheel;
  container.add(scene.add.rectangle(xOffset, -halfH - 2, 10, 6, wheelColor));
  container.add(scene.add.rectangle(xOffset, halfH + 2, 10, 6, wheelColor));
}

function addLightPair(scene, container, halfW, halfH, frontColor, rearColor) {
  container.add(scene.add.circle(halfW - 4, -halfH * 0.5, 3, frontColor));
  container.add(scene.add.circle(halfW - 4, halfH * 0.5, 3, frontColor));
  container.add(scene.add.circle(-halfW + 4, -halfH * 0.5, 3, rearColor));
  container.add(scene.add.circle(-halfW + 4, halfH * 0.5, 3, rearColor));
}

export function createCarDecoration(scene, x, y, host, tileWidthPx, dir) {
  const colors = GAME_THEME.objects;
  const container = scene.add.container(x, y);

  const bodyWidth = tileWidthPx * 0.9;
  const bodyHeight = scene.tileSize * 0.62;
  const halfW = bodyWidth / 2;
  const halfH = bodyHeight / 2;

  const body = scene.add.rectangle(0, 0, bodyWidth, bodyHeight, colors.car);
  const windshield = scene.add.rectangle(
    halfW * 0.2,
    0,
    bodyWidth * 0.35,
    bodyHeight * 0.6,
    colors.carWindshield
  );

  container.add([body, windshield]);
  addWheelPair(scene, container, -halfW * 0.55, halfH);
  addWheelPair(scene, container, halfW * 0.55, halfH);
  addLightPair(scene, container, halfW, halfH, colors.headlight, colors.taillight);

  container.scaleX = dir;
  container.host = host;
  container.offsetX = 0;

  return container;
}

export function createSportsCarDecoration(scene, x, y, host, tileWidthPx, dir) {
  const colors = GAME_THEME.objects;
  const container = scene.add.container(x, y);

  const bodyWidth = tileWidthPx * 0.9;
  const bodyHeight = scene.tileSize * 0.56;
  const halfW = bodyWidth / 2;
  const halfH = bodyHeight / 2;

  const body = scene.add.polygon(
    0,
    0,
    [
      0, 0,
      0, bodyHeight,
      bodyWidth * 0.7, bodyHeight,
      bodyWidth, bodyHeight / 2,
      bodyWidth * 0.7, 0,
    ],
    colors.sportsCar
  );

  const stripe = scene.add.rectangle(0, 0, bodyWidth * 0.8, bodyHeight * 0.18, colors.sportsCarAccent);
  const windshield = scene.add.rectangle(
    halfW * 0.1,
    halfH * 0.15,
    bodyWidth * 0.22,
    bodyHeight * 0.4,
    colors.carWindshield
  );

  container.add([body, stripe, windshield]);
  addWheelPair(scene, container, -halfW * 0.5, halfH);
  addWheelPair(scene, container, halfW * 0.45, halfH);
  addLightPair(scene, container, halfW, halfH, colors.headlight, colors.taillight);

  container.scaleX = dir;
  container.host = host;
  container.offsetX = 0;

  return container;
}

export function createTruckDecoration(scene, x, y, host, tileWidthPx, dir) {
  const colors = GAME_THEME.objects;
  const container = scene.add.container(x, y);

  const bodyWidth = tileWidthPx * 0.92;
  const bodyHeight = scene.tileSize * 0.66;
  const halfW = bodyWidth / 2;
  const halfH = bodyHeight / 2;

  const cargo = scene.add.rectangle(-bodyWidth * 0.12, 0, bodyWidth * 0.62, bodyHeight, colors.truck);
  const cab = scene.add.rectangle(bodyWidth * 0.33, 0, bodyWidth * 0.3, bodyHeight * 0.9, colors.truckCab);

  container.add([cargo, cab]);
  addWheelPair(scene, container, -halfW * 0.6, halfH);
  addWheelPair(scene, container, 0, halfH);
  addWheelPair(scene, container, halfW * 0.6, halfH);
  addLightPair(scene, container, halfW, halfH, colors.headlight, colors.taillight);

  container.scaleX = dir;
  container.host = host;
  container.offsetX = 0;

  return container;
}

export function createCyberTruckDecoration(scene, x, y, host, tileWidthPx, dir) {
  const colors = GAME_THEME.objects;
  const container = scene.add.container(x, y);

  const bodyWidth = tileWidthPx * 0.92;
  const bodyHeight = scene.tileSize * 0.66;
  const halfW = bodyWidth / 2;
  const halfH = bodyHeight / 2;

  const body = scene.add.polygon(
    0,
    0,
    [
      0, bodyHeight * 0.15,
      0, bodyHeight * 0.85,
      bodyWidth * 0.6, bodyHeight,
      bodyWidth, bodyHeight * 0.65,
      bodyWidth, bodyHeight * 0.35,
      bodyWidth * 0.6, 0,
    ],
    colors.cyberTruck
  );

  const lightBar = scene.add.rectangle(halfW * 0.82, 0, bodyWidth * 0.06, bodyHeight * 0.7, colors.cyberTruckAccent);

  container.add([body, lightBar]);
  addWheelPair(scene, container, -halfW * 0.5, halfH * 0.7);
  addWheelPair(scene, container, halfW * 0.5, halfH * 0.7);

  container.scaleX = dir;
  container.host = host;
  container.offsetX = 0;

  return container;
}