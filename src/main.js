import * as Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { isMobile } from './utils/device';
import { GAME_WIDTH, GAME_HEIGHT } from './config/constants';
import './style.css';

if (isMobile()) {
  document.getElementById('controls-panel')?.remove();
}

// Fixed touch-UI strip below the board on mobile (see rib-vs-bit-status.md).
// Canvas is derived from the shared grid dims so a future grid resize cascades
// here automatically: desktop = GAME_WIDTH×GAME_HEIGHT (720×720), mobile adds
// the UI strip → 720×1031.
const MOBILE_UI_PX = 311;
const CANVAS_WIDTH = GAME_WIDTH;
const CANVAS_HEIGHT = isMobile() ? GAME_HEIGHT + MOBILE_UI_PX : GAME_HEIGHT;

const config = {
  type: Phaser.AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  parent: 'app',
  backgroundColor: '#0f172a',

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  },

  scene: [MainScene],
};

window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    window.location.reload();
  }
});

new Phaser.Game(config);
