// src/systems/audio.js
export function createAudioSystem(scene) {
  let unlocked = false;

  async function unlock() {
    if (unlocked) return true;

    const ctx = scene.sound.context;
    if (!ctx) return false;

    if (ctx.state === 'running') {
      unlocked = true;
      return true;
    }

    try {
      await ctx.resume();

      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);

      unlocked = true;
      console.log('🎵 Audio unlocked successfully (tone-based)');
      return true;
    } catch (err) {
      console.warn('Audio unlock failed:', err);
      return false;
    }
  }

  function play(key) {
    if (!unlocked) return;
    playToneFallback(key);
  }

  function playToneFallback(key) {
    const tones = {
      jump:    () => { playTone(460, 0.045); playTone(600, 0.035); },
      crash:   () => { playTone(110, 0.1, 'sawtooth'); playTone(75, 0.14, 'triangle'); playTone(55, 0.16, 'square'); },
      splash:  () => { playTone(260, 0.06, 'triangle'); playTone(190, 0.1, 'sine'); playTone(150, 0.12, 'sine'); },
      score:   () => { playTone(740, 0.06); playTone(988, 0.08); },
      winSting:() => { playTone(82.41, 0.24, 'triangle'); playTone(61.74, 0.3, 'sine'); playTone(196, 0.12, 'sawtooth'); playTone(1046.5, 0.16); },
      start:   () => { playTone(392, 0.06); playTone(523.25, 0.08); },
    };
    tones[key]?.();
  }

  function playTone(freq = 440, duration = 0.08, type = 'square', volume = 0.03) {
    const ctx = scene.sound.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  return {
    unlock,
    playJump:   () => play('jump'),
    playCrash:  () => play('crash'),
    playSplash: () => play('splash'),
    playScore:  () => play('score'),
    playWinSting: () => play('winSting'),
    playStart:  () => play('start'),
    playTone,                    // needed for countdown in intro.js
    destroy: () => {},
    playHit: () => play('crash'),
  };
}