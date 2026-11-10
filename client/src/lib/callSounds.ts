/**
 * Synthesizes call ringtones and audio chimes using HTML5 Web Audio API.
 * Zero external audio files required, runs 100% offline, zero latency.
 */

let activeInterval: NodeJS.Timeout | null = null;
let activeAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!activeAudioCtx || activeAudioCtx.state === 'closed') {
      activeAudioCtx = new AudioContextClass();
    }
    if (activeAudioCtx.state === 'suspended') {
      activeAudioCtx.resume();
    }
    return activeAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Unlocks Web Audio playback during an active user gesture
 */
export function unlockAudioMedia(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/**
 * Plays a single outgoing ringback pulse (440Hz + 480Hz, 1.8s duration)
 */
function playRingbackPulse() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(480, now);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.setValueAtTime(0.04, now + 1.6);
    gain.gain.linearRampToValueAtTime(0.001, now + 1.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.8);
    osc2.stop(now + 1.8);
  } catch {
    // Autoplay policy fallback
  }
}

/**
 * Starts continuous outgoing ringback sound
 */
export function startOutgoingRinging() {
  stopCallSounds();
  playRingbackPulse();
  activeInterval = setInterval(() => {
    playRingbackPulse();
  }, 4000);
}

/**
 * Plays a pleasant marimba/chime sequence for incoming calls
 */
function playIncomingChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { f: 523.25, time: 0, dur: 0.18 }, // C5
      { f: 659.25, time: 0.18, dur: 0.18 }, // E5
      { f: 783.99, time: 0.36, dur: 0.22 }, // G5
      { f: 1046.5, time: 0.58, dur: 0.35 }, // C6
    ];

    const now = ctx.currentTime;
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f, now + n.time);

      gain.gain.setValueAtTime(0.09, now + n.time);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);
    });
  } catch {
    // Autoplay policy fallback
  }
}

/**
 * Starts continuous incoming call ringtone
 */
export function startIncomingRinging() {
  stopCallSounds();
  playIncomingChime();
  activeInterval = setInterval(() => {
    playIncomingChime();
  }, 2500);
}

/**
 * Plays a gentle call-ended sound
 */
export function playCallEndSound() {
  stopCallSounds();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.3);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // ignore
  }
}

/**
 * Plays a pleasant ascending 3-note connected chime (F4 -> A4 -> C5)
 */
export function playCallConnectedSound() {
  stopCallSounds();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { f: 349.23, time: 0, dur: 0.12 }, // F4
      { f: 440.0, time: 0.12, dur: 0.12 }, // A4
      { f: 523.25, time: 0.24, dur: 0.28 }, // C5
    ];

    const now = ctx.currentTime;
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f, now + n.time);

      gain.gain.setValueAtTime(0.08, now + n.time);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);
    });
  } catch {
    // Autoplay fallback
  }
}

/**
 * Plays a standard telecommunication busy tone (480Hz + 620Hz, 3 rapid beeps)
 */
export function playBusySound() {
  stopCallSounds();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const bursts = [0, 0.5, 1.0];
    const duration = 0.25;

    bursts.forEach((startTime) => {
      const now = ctx.currentTime + startTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(480, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(620, now);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.setValueAtTime(0.06, now + duration - 0.02);
      gain.gain.linearRampToValueAtTime(0.001, now + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    });
  } catch {
    // Autoplay fallback
  }
}

/**
 * Plays a gentle, non-disruptive chime notifying user of an active reconnect attempt
 */
export function playReconnectingSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { f: 587.33, time: 0, dur: 0.15 }, // D5
      { f: 440.0, time: 0.15, dur: 0.25 }, // A4
    ];

    const now = ctx.currentTime;
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f, now + n.time);

      gain.gain.setValueAtTime(0.04, now + n.time);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);
    });
  } catch {
    // Autoplay fallback
  }
}

/**
 * Registers one-time user interaction listeners to unlock Web Audio context
 */
export function setupAutoplayUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};

  const unlock = () => {
    unlockAudioMedia();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
  window.addEventListener('touchstart', unlock, { once: true, passive: true });

  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
}

/**
 * Stops any ongoing ringing sound or interval
 */
export function stopCallSounds() {
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
}

