// src/systems/audio.js

export function createAudioSystem(scene, options = {}) {
  let masterVolume = options.masterVolume ?? 1.0;
  let destroyed = false;

  function getCtx() {
    return scene.sys.game.sound?.context ?? null;
  }

  function playTone(config) {   // no longer async — no awaiting needed
    if (destroyed) return;
    const context = getCtx();
    if (!context) return;

    const {
      frequency = 440, duration = 0.08, type = 'square',
      volume = 0.05, decay = 0.4, when = 0,
    } = config;

    const startTime = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const finalVolume = Math.min(volume * masterVolume, 0.3);

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

  function initContext() {
    const context = getCtx();
    if (context?.state === 'suspended') {
      context.resume().catch(() => {});
    }
  }

  // ── all your playRoundStart / playStart / playJump / etc. stay exactly as-is ──
  function playRoundStart() {
  // === RIB! === anchor: 0.00
  playTone({ frequency: 98,   duration: 0.22, type: 'triangle', volume: 0.15, decay: 0.10, when: 0.00 });
  playTone({ frequency: 523,  duration: 0.07, type: 'square',   volume: 0.11, decay: 0.04, when: 0.00 });
  playTone({ frequency: 659,  duration: 0.08, type: 'square',   volume: 0.13, decay: 0.05, when: 0.06 });
  playTone({ frequency: 784,  duration: 0.09, type: 'square',   volume: 0.15, decay: 0.06, when: 0.12 });
  playTone({ frequency: 1047, duration: 0.14, type: 'square',   volume: 0.16, decay: 0.12, when: 0.18 });

  // === BIT! === anchor: 0.80
  playTone({ frequency: 82,   duration: 0.24, type: 'triangle', volume: 0.18, decay: 0.12, when: 0.80 });
  playTone({ frequency: 523,  duration: 0.07, type: 'square',   volume: 0.13, decay: 0.04, when: 0.80 });
  playTone({ frequency: 698,  duration: 0.08, type: 'square',   volume: 0.15, decay: 0.05, when: 0.86 });
  playTone({ frequency: 880,  duration: 0.09, type: 'square',   volume: 0.17, decay: 0.06, when: 0.92 });
  playTone({ frequency: 1175, duration: 0.16, type: 'square',   volume: 0.19, decay: 0.14, when: 0.98 });

  // === GO! === anchor: 1.60
  playTone({ frequency: 65,   duration: 0.28, type: 'triangle', volume: 0.22, decay: 0.15, when: 1.60 });
  playTone({ frequency: 523,  duration: 0.07, type: 'square',   volume: 0.15, decay: 0.04, when: 1.60 });
  playTone({ frequency: 740,  duration: 0.08, type: 'square',   volume: 0.17, decay: 0.05, when: 1.66 });
  playTone({ frequency: 988,  duration: 0.09, type: 'square',   volume: 0.19, decay: 0.06, when: 1.72 });
  playTone({ frequency: 1319, duration: 0.18, type: 'square',   volume: 0.22, decay: 0.16, when: 1.78 });
  playTone({ frequency: 1568, duration: 0.14, type: 'square',   volume: 0.20, decay: 0.18, when: 1.86 });
}
function playStart() {
    // Low punchy hit
    playTone({ frequency: 180, duration: 0.12, type: 'triangle', volume: 0.65 });

    // Rising fanfare
    playTone({ frequency: 392, duration: 0.09, type: 'square', volume: 0.07, when: 0.08 });
    playTone({ frequency: 523, duration: 0.10, type: 'square', volume: 0.08, when: 0.16 });
    playTone({ frequency: 659, duration: 0.14, type: 'sawtooth', volume: 0.06, when: 0.24 });

    // Bright sparkle at the top
    playTone({ frequency: 880, duration: 0.18, type: 'sine', volume: 0.05, when: 0.32 });
  }

  function playJump() {
  // Initial pop — the spring releasing
  playTone({ frequency: 120, duration: 0.04, type: 'triangle', volume: 0.12, decay: 0.03 });
  // Fast rise through the arc
  playTone({ frequency: 220, duration: 0.05, type: 'triangle', volume: 0.10, decay: 0.03, when: 0.03 });
  playTone({ frequency: 360, duration: 0.05, type: 'triangle', volume: 0.09, decay: 0.04, when: 0.06 });
  playTone({ frequency: 520, duration: 0.05, type: 'triangle', volume: 0.08, decay: 0.05, when: 0.09 });
  // Overshoot peak — the "oing" part of "boing"
  playTone({ frequency: 680, duration: 0.06, type: 'sine',     volume: 0.06, decay: 0.10, when: 0.12 });
  // Slight tail-off back down — the spring settling
  playTone({ frequency: 480, duration: 0.05, type: 'sine',     volume: 0.03, decay: 0.12, when: 0.17 });
}

  function playTongue() {
  // WHOOSH — tongue extending: low, airy, moving upward slightly
  playTone({ frequency: 160, duration: 0.09, type: 'sawtooth', volume: 0.07, decay: 0.04, when: 0.00 });
  playTone({ frequency: 220, duration: 0.07, type: 'sawtooth', volume: 0.06, decay: 0.04, when: 0.05 });
  // SNAP — whip crack at full extension: sharp high transient, two stacked tones for a "thwack"
  playTone({ frequency: 1600, duration: 0.025, type: 'square', volume: 0.11, decay: 0.03, when: 0.11 });
  playTone({ frequency: 2100, duration: 0.02,  type: 'square', volume: 0.09, decay: 0.04, when: 0.115 });
}

  function playCrash() {
    console.log('[Audio] playing crash');
    playTone({ frequency: 110, duration: 0.1,  type: 'sawtooth', volume: 0.09 });
    playTone({ frequency: 75,  duration: 0.14, type: 'triangle', volume: 0.07, when: 0.018 });
    playTone({ frequency: 55,  duration: 0.16, type: 'square',   volume: 0.04, when: 0.03 });
  }

  function playSplash() {
  // Sharp initial impact
  playTone({ frequency: 440, duration: 0.04, type: 'square',   volume: 0.15, decay: 0.03 });
  // Descending cascade
  playTone({ frequency: 330, duration: 0.05, type: 'triangle', volume: 0.12, decay: 0.05, when: 0.03 });
  playTone({ frequency: 247, duration: 0.07, type: 'triangle', volume: 0.10, decay: 0.07, when: 0.07 });
  playTone({ frequency: 180, duration: 0.09, type: 'sine',     volume: 0.08, decay: 0.10, when: 0.13 });
  // Low underwater gurgle/settle
  playTone({ frequency: 125, duration: 0.12, type: 'sine',     volume: 0.06, decay: 0.15, when: 0.20 });
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
  }

  return {
    initContext,
    playTone,
    playStart,
    playRoundStart,
    playJump,
    playTongue,
    playCrash,
    playSplash,
    playScore,
    playVictory: playWinSting,
    playWinSting,
    destroy,
  };
}