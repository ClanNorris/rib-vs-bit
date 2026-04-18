import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import './style.css';

const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                 screen.width < 800;

const config = {
  type: Phaser.AUTO,
  width: 720,
  height: isMobile ? 935 : 624,     // ← Mobile gets extra height
  parent: 'app',
  backgroundColor: '#0f172a',

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: isMobile ? 935 : 624,
  },

  scene: [MainScene],
};

new Phaser.Game(config);