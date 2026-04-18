// src/systems/audio.js
// src/systems/audio.js
  export function createAudioSystem(scene, options = {}) {
    let context = null;
    let unlocked = false;
    let masterVolume = options.masterVolume ?? 1.0;
    let destroyed = false;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    async function unlock() {
      if (destroyed || !AudioCtx) return;

      if (!context) {
        context = new AudioCtx();
      }

      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch (e) {}
      }

      if (!unlocked) {
        unlocked = true;
        console.log('[Audio] ✅ Unlocked successfully (context state:', context.state, ')');
      }
    }

  function playTone(frequency, duration = 0.08, type = 'square', volume = 0.03, when = 0) {
    if (destroyed || !unlocked || !context) return;
    // ... (rest of playTone unchanged - keep exactly as it is)
    const startTime = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const finalVolume = Math.min(volume * masterVolume, 0.18);

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(finalVolume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(context.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  // playStart, playJump, playCrash, playSplash, playScore, playWinSting stay exactly the same
  function playStart() { playTone(392, 0.06, 'square', 0.045, 0); playTone(523.25, 0.08, 'square', 0.05, 0.07); }
  function playJump() { playTone(460, 0.045, 'square', 0.05, 0); playTone(600, 0.035, 'square', 0.038, 0.028); }
  function playCrash() { playTone(110, 0.1, 'sawtooth', 0.09, 0); playTone(75, 0.14, 'triangle', 0.07, 0.018); playTone(55, 0.16, 'square', 0.04, 0.03); }
  function playSplash() { playTone(260, 0.06, 'triangle', 0.055, 0); playTone(190, 0.1, 'sine', 0.05, 0.02); playTone(150, 0.12, 'sine', 0.035, 0.05); }
  function playScore() { playTone(740, 0.06, 'square', 0.055, 0); playTone(988, 0.08, 'square', 0.055, 0.06); }

  function playWinSting(winnerId = null) {
    const teamLeadTone = winnerId === 'red' ? 196 : winnerId === 'blue' ? 220 : 207.65;
    playTone(82.41, 0.24, 'triangle', 0.11, 0);
    playTone(61.74, 0.3, 'sine', 0.09, 0.03);
    playTone(teamLeadTone, 0.12, 'sawtooth', 0.06, 0.02);
    playTone(1046.5, 0.16, 'sine', 0.055, 0.18);
    playTone(1318.5, 0.2, 'sine', 0.05, 0.3);
    playTone(1567.98, 0.24, 'triangle', 0.045, 0.42);
  }

  function destroy() {
    destroyed = true;
    if (context) {
      context.close().catch(() => {});
      context = null;
    }
    unlocked = false;
  }

  return {
    playTone,
    playStart,
    playJump,
    playCrash,
    playSplash,
    playScore,
    playVictory: playWinSting,
    playWinSting,
    unlock,
    destroy,
  };
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
