export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function dirVector(facing) {
  switch (facing) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    default: return { x: 0, y: -1 };
  }
}

export function oppositeFacing(facing) {
  switch (facing) {
    case 'up': return 'down';
    case 'down': return 'up';
    case 'left': return 'right';
    case 'right': return 'left';
    default: return 'up';
  }
}