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
    if (context.state === 'running') {
      unlocked = true;
      return;
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

  // ── Modern object-style playTone ──
  async function playTone(config) {
    if (destroyed || !context) return;

    const {
      frequency = 440,
      duration = 0.08,
      type = 'square',
      volume = 0.05,
      decay = 0.4,
      when = 0
    } = config;

    // Self-resume for stubborn iOS Safari
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch (e) {}
    }

    if (!unlocked) unlocked = true;

    const startTime = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();

    const finalVolume = Math.min(volume * masterVolume, 0.18);

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(finalVolume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + decay);

    osc.connect(gain);
    gain.connect(context.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + decay + 0.02);
  }

  function playStart() {
    console.log('[Audio] playing start');
    playTone({ frequency: 392, duration: 0.06, type: 'square', volume: 0.045 });
    playTone({ frequency: 523.25, duration: 0.08, type: 'square', volume: 0.05, when: 0.07 });
  }

  function playJump() {
    console.log('[Audio] playing jump');
    playTone({ frequency: 460, duration: 0.045, type: 'square', volume: 0.05 });
    playTone({ frequency: 600, duration: 0.035, type: 'square', volume: 0.038, when: 0.028 });
  }

  function playCrash() {
    console.log('[Audio] playing crash');
    playTone({ frequency: 110, duration: 0.1,  type: 'sawtooth', volume: 0.09 });
    playTone({ frequency: 75,  duration: 0.14, type: 'triangle', volume: 0.07, when: 0.018 });
    playTone({ frequency: 55,  duration: 0.16, type: 'square',   volume: 0.04, when: 0.03 });
  }

  function playSplash() {
    console.log('[Audio] playing splash (water fall)');
    playTone({frequency: 360, duration: 0.22, type: 'sine', volume: 0.78, decay: 0}); // Main splash - deeper and longer so it stands out
    playTone({frequency: 240, durcation: 0.18, type: 'triangle', volume: 0.52, decay: 0.04}); // Quick ripple layer
  }

  function playScore() {
    console.log('[Audio] playing score');
    playTone({ frequency: 740, duration: 0.06, type: 'square', volume: 0.055 });
    playTone({ frequency: 988, duration: 0.08, type: 'square', volume: 0.055, when: 0.06 });
  }

  function playWinSting(winnerId = null) {
    console.log('[Audio] playing win sting');
    const teamLeadTone = winnerId === 'red' ? 196 : winnerId === 'blue' ? 220 : 207.65;

    playTone({ frequency: 82.41, duration: 0.24, type: 'triangle', volume: 0.11 });
    playTone({ frequency: 61.74, duration: 0.3,  type: 'sine',     volume: 0.09, when: 0.03 });
    playTone({ frequency: teamLeadTone, duration: 0.12, type: 'sawtooth', volume: 0.06, when: 0.02 });
    playTone({ frequency: 1046.5, duration: 0.16, type: 'sine', volume: 0.055, when: 0.18 });
    playTone({ frequency: 1318.5, duration: 0.2,  type: 'sine', volume: 0.05,  when: 0.3 });
    playTone({ frequency: 1567.98, duration: 0.24, type: 'triangle', volume: 0.045, when: 0.42 });
  }

  function destroy() {
    destroyed = true;
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
