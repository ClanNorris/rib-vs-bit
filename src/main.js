import * as Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { isMobile } from './utils/device';
import './style.css';

const config = {
  type: Phaser.AUTO,
  width: 720,
  height: isMobile() ? 1031 : 720,     // ← now uses the shared utility
  parent: 'app',
  backgroundColor: '#0f172a',

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: isMobile() ? 1031 : 720,
  },

  scene: [MainScene],
};

window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    window.location.reload();
  }
});

new Phaser.Game(config);
