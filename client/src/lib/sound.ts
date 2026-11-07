/**
 * Web Audio API Notification Bell & Desktop Notification Utilities.
 * Synthesizes a crystalline, pleasant notification bell chime with zero external audio assets.
 */

let cachedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!cachedAudioCtx || cachedAudioCtx.state === 'closed') {
      cachedAudioCtx = new AudioContextClass();
    }
    if (cachedAudioCtx.state === 'suspended') {
      cachedAudioCtx.resume().catch(() => {});
    }
    return cachedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays a pleasant, crystalline notification bell chime (880Hz + 1318Hz + 1760Hz harmonics).
 */
export function playNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Bell Strike 1: Crisp primary bell chime (880 Hz A5 + 1760 Hz A6 overtone)
    const osc1 = ctx.createOscillator();
    const oscHarmonic = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);

    oscHarmonic.type = 'sine';
    oscHarmonic.frequency.setValueAtTime(1760, now);

    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gain1);
    oscHarmonic.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    oscHarmonic.start(now);
    osc1.stop(now + 0.35);
    oscHarmonic.stop(now + 0.35);

    // Bell Strike 2: Sweet harmonic resolution (1318.5 Hz E6)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.51, now + 0.08);

    gain2.gain.setValueAtTime(0.14, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.08);
    osc2.stop(now + 0.55);
  } catch {
    // Autoplay policy fallback
  }
}

/**
 * Request browser desktop notification permission if supported
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Show native desktop notification if user is away or tab is hidden
 */
export function showDesktopNotification(
  title: string,
  body: string,
  onClick?: () => void
) {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      silent: true, // Audio bell is handled cleanly via Web Audio API
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }
  } catch {
    // Notification constructor fallback
  }
}

// ==========================================
// Tab Title Flashing & Alerts for Background Tabs
// ==========================================
let unreadCount = 0;
let titleTimer: NodeJS.Timeout | null = null;
const DEFAULT_TITLE = 'Connectly — Modern Real-Time Messaging Platform';

export function alertTabTitle(senderName: string) {
  if (typeof document === 'undefined') return;
  unreadCount += 1;

  if (titleTimer) clearInterval(titleTimer);

  let toggle = false;
  titleTimer = setInterval(() => {
    toggle = !toggle;
    document.title = toggle
      ? `🔔 (${unreadCount}) New message!`
      : `(${unreadCount}) ${senderName}: Message`;
  }, 1400);
}

export function resetTabTitle() {
  if (typeof document === 'undefined') return;
  unreadCount = 0;
  if (titleTimer) {
    clearInterval(titleTimer);
    titleTimer = null;
  }
  document.title = DEFAULT_TITLE;
}
