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
 * Stops any ongoing ringing sound or interval
 */
export function stopCallSounds() {
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
}

