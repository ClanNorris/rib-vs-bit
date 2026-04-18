import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { isMobile } from './utils/device';
import './style.css';

const config = {
  type: Phaser.AUTO,
  width: 720,
  height: isMobile() ? 935 : 624,     // ← now uses the shared utility
  parent: 'app',
  backgroundColor: '#0f172a',

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: isMobile() ? 935 : 624,
  },

  scene: [MainScene],
};

new Phaser.Game(config);
