import { NetworkQuality, QualityPreference, QualityStats } from '@/store/callStore';

export interface RawStatsSnapshot {
  timestamp: number;
  rtt?: number;
  packetsLost?: number;
  packetsReceived?: number;
  jitter?: number;
  bytesSent?: number;
  bytesReceived?: number;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
}

/**
 * Classifies network connection quality into 'excellent', 'good', 'poor', or 'critical'
 * based on RTT, packet loss percentage, and jitter.
 */
export function classifyNetworkQuality(stats: QualityStats): NetworkQuality {
  const { rtt, packetLoss, jitter } = stats;

  // Critical conditions: Severe packet loss or massive latency
  if (packetLoss >= 20 || rtt >= 500 || jitter >= 150) {
    return 'critical';
  }

  // Poor conditions: Noticeable degradation
  if (packetLoss >= 8 || rtt >= 250 || jitter >= 60) {
    return 'poor';
  }

  // Good conditions: Minor variance
  if (packetLoss >= 2 || rtt >= 100 || jitter >= 30) {
    return 'good';
  }

  // Excellent: Crisp, near zero loss, low latency
  return 'excellent';
}

/**
 * Extracts normalized metrics from an RTCStatsReport.
 */
export function extractRTCStats(
  report: RTCStatsReport,
  prevSnapshot?: RawStatsSnapshot | null
): { stats: QualityStats; snapshot: RawStatsSnapshot } {
  let rtt = 0;
  let packetsLost = 0;
  let packetsReceived = 0;
  let jitter = 0;
  let bytesSent = 0;
  let bytesReceived = 0;
  let frameWidth: number | undefined;
  let frameHeight: number | undefined;
  let fps: number | undefined;

  const now = Date.now();

  report.forEach((stat: any) => {
    // Active Candidate Pair for RTT and overall bytes
    if (
      stat.type === 'candidate-pair' &&
      (stat.state === 'succeeded' || stat.nominated === true || stat.selected === true)
    ) {
      if (typeof stat.currentRoundTripTime === 'number') {
        rtt = Math.round(stat.currentRoundTripTime * 1000);
      } else if (typeof stat.roundTripTime === 'number') {
        rtt = Math.round(stat.roundTripTime * 1000);
      }
      if (typeof stat.bytesSent === 'number') {
        bytesSent = stat.bytesSent;
      }
      if (typeof stat.bytesReceived === 'number') {
        bytesReceived = stat.bytesReceived;
      }
    }

    // Inbound RTP for audio or video
    if (stat.type === 'inbound-rtp') {
      if (typeof stat.packetsLost === 'number') {
        packetsLost += stat.packetsLost;
      }
      if (typeof stat.packetsReceived === 'number') {
        packetsReceived += stat.packetsReceived;
      }
      if (typeof stat.jitter === 'number') {
        // Report jitter in ms
        const statJitterMs = Math.round(stat.jitter * 1000);
        if (statJitterMs > jitter) {
          jitter = statJitterMs;
        }
      }
      if (stat.kind === 'video') {
        if (typeof stat.frameWidth === 'number') frameWidth = stat.frameWidth;
        if (typeof stat.frameHeight === 'number') frameHeight = stat.frameHeight;
        if (typeof stat.framesPerSecond === 'number') fps = Math.round(stat.framesPerSecond);
      }
    }

    // Outbound RTP if bytesSent wasn't populated by candidate-pair
    if (stat.type === 'outbound-rtp' && bytesSent === 0 && typeof stat.bytesSent === 'number') {
      bytesSent += stat.bytesSent;
    }
  });

  // Calculate packet loss percentage
  let packetLoss = 0;
  if (prevSnapshot && prevSnapshot.packetsLost !== undefined && prevSnapshot.packetsReceived !== undefined) {
    const deltaLost = Math.max(0, packetsLost - prevSnapshot.packetsLost);
    const deltaRecv = Math.max(0, packetsReceived - prevSnapshot.packetsReceived);
    const deltaTotal = deltaLost + deltaRecv;
    if (deltaTotal > 0) {
      packetLoss = Math.round((deltaLost / deltaTotal) * 1000) / 10;
    }
  } else {
    const total = packetsLost + packetsReceived;
    if (total > 0) {
      packetLoss = Math.round((packetsLost / total) * 1000) / 10;
    }
  }

  // Calculate uplink and downlink bitrates in kbps
  let uplinkKbps = 0;
  let downlinkKbps = 0;
  if (prevSnapshot && prevSnapshot.timestamp) {
    const deltaSec = (now - prevSnapshot.timestamp) / 1000;
    if (deltaSec > 0) {
      if (bytesSent >= (prevSnapshot.bytesSent || 0)) {
        const deltaSentBytes = bytesSent - (prevSnapshot.bytesSent || 0);
        uplinkKbps = Math.round((deltaSentBytes * 8) / (deltaSec * 1000));
      }
      if (bytesReceived >= (prevSnapshot.bytesReceived || 0)) {
        const deltaRecvBytes = bytesReceived - (prevSnapshot.bytesReceived || 0);
        downlinkKbps = Math.round((deltaRecvBytes * 8) / (deltaSec * 1000));
      }
    }
  }

  const stats: QualityStats = {
    rtt,
    packetLoss,
    jitter,
    uplinkKbps,
    downlinkKbps,
    ...(frameWidth ? { frameWidth } : {}),
    ...(frameHeight ? { frameHeight } : {}),
    ...(fps !== undefined ? { fps } : {}),
  };

  const snapshot: RawStatsSnapshot = {
    timestamp: now,
    rtt,
    packetsLost,
    packetsReceived,
    jitter,
    bytesSent,
    bytesReceived,
    frameWidth,
    frameHeight,
    fps,
  };

  return { stats, snapshot };
}

/**
 * Target encoding parameters based on quality classification and user preference.
 */
export function getTargetEncodingParameters(
  quality: NetworkQuality,
  preference: QualityPreference = 'auto'
): { scaleResolutionDownBy: number; maxBitrate: number; maxFramerate: number } {
  // If user explicitly selected Data-Saver mode:
  if (preference === 'data-saver') {
    return {
      scaleResolutionDownBy: 2.0,
      maxBitrate: 250_000, // 250 kbps
      maxFramerate: 15,
    };
  }

  // If user selected High Quality mode:
  if (preference === 'high') {
    if (quality === 'critical') {
      return {
        scaleResolutionDownBy: 2.0,
        maxBitrate: 450_000,
        maxFramerate: 20,
      };
    }
    return {
      scaleResolutionDownBy: 1.0,
      maxBitrate: 2_500_000, // 2.5 Mbps
      maxFramerate: 30,
    };
  }

  // Default 'auto' mode: Dynamic adaptation based on network conditions
  switch (quality) {
    case 'critical':
      return {
        scaleResolutionDownBy: 4.0, // Significant resolution drop (e.g. 720p -> 180p)
        maxBitrate: 120_000, // 120 kbps
        maxFramerate: 15,
      };
    case 'poor':
      return {
        scaleResolutionDownBy: 2.0, // Half resolution (e.g. 720p -> 360p)
        maxBitrate: 350_000, // 350 kbps
        maxFramerate: 20,
      };
    case 'good':
      return {
        scaleResolutionDownBy: 1.0,
        maxBitrate: 1_000_000, // 1.0 Mbps
        maxFramerate: 30,
      };
    case 'excellent':
    default:
      return {
        scaleResolutionDownBy: 1.0,
        maxBitrate: 1_800_000, // 1.8 Mbps
        maxFramerate: 30,
      };
  }
}

/**
 * Dynamically adjusts sender parameters using RTCRtpSender.setParameters()
 */
export async function applyAdaptiveBitrate(
  sender: RTCRtpSender,
  quality: NetworkQuality,
  preference: QualityPreference = 'auto'
): Promise<void> {
  if (!sender || !sender.track || sender.track.kind !== 'video') {
    return;
  }

  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    const target = getTargetEncodingParameters(quality, preference);

    params.encodings.forEach((encoding) => {
      encoding.scaleResolutionDownBy = target.scaleResolutionDownBy;
      encoding.maxBitrate = target.maxBitrate;
      encoding.maxFramerate = target.maxFramerate;
    });

    await sender.setParameters(params);
  } catch (err) {
    console.warn('Failed to apply adaptive bitrate to video sender:', err);
  }
}

export interface AdaptationDecision {
  quality: NetworkQuality;
  qualityChanged: boolean;
  shouldDegradeToAudioOnly: boolean;
  shouldRestoreVideo: boolean;
  shouldAdjustSender: boolean;
  isAudioOnlyDegraded: boolean;
}

/**
 * AdaptationManager implements hysteresis and anti-oscillation protection.
 * - Downgrades happen quickly to relieve network congestion (1-2 cycles).
 * - Upgrades require 3 consecutive stable cycles before stepping up.
 * - Degrades to audio-only if critical conditions persist for 2 cycles.
 * - Restores video when connection returns to good or excellent for 3 cycles.
 */
export class AdaptationManager {
  private currentQuality: NetworkQuality = 'excellent';
  private isAudioOnlyDegraded: boolean = false;
  private consecutiveCriticalCycles: number = 0;
  private consecutiveRecoverCycles: number = 0;
  private restoreCounter: number = 0;
  private lastAppliedQuality: NetworkQuality | null = null;
  private lastAppliedPreference: QualityPreference | null = null;

  constructor(initialQuality: NetworkQuality = 'excellent') {
    this.currentQuality = initialQuality;
  }

  public reset(initialQuality: NetworkQuality = 'excellent'): void {
    this.currentQuality = initialQuality;
    this.isAudioOnlyDegraded = false;
    this.consecutiveCriticalCycles = 0;
    this.consecutiveRecoverCycles = 0;
    this.restoreCounter = 0;
    this.lastAppliedQuality = null;
    this.lastAppliedPreference = null;
  }

  public getCurrentQuality(): NetworkQuality {
    return this.currentQuality;
  }

  public getIsAudioOnlyDegraded(): boolean {
    return this.isAudioOnlyDegraded;
  }

  public processStats(
    stats: QualityStats,
    isVideoCall: boolean,
    preference: QualityPreference = 'auto'
  ): AdaptationDecision {
    const instantQuality = classifyNetworkQuality(stats);
    let qualityChanged = false;
    let shouldDegradeToAudioOnly = false;
    let shouldRestoreVideo = false;

    const rank: Record<NetworkQuality, number> = {
      excellent: 4,
      good: 3,
      poor: 2,
      critical: 1,
    };

    const currentRank = rank[this.currentQuality];
    const instantRank = rank[instantQuality];

    // 1. Critical degradation tracking (safeguard audio clarity when congested)
    if (instantQuality === 'critical') {
      this.consecutiveCriticalCycles++;
      if (this.consecutiveCriticalCycles >= 2 && isVideoCall && !this.isAudioOnlyDegraded) {
        this.isAudioOnlyDegraded = true;
        shouldDegradeToAudioOnly = true;
      }
    } else {
      this.consecutiveCriticalCycles = 0;
    }

    // 2. Audio-only recovery tracking (restore video after 3 stable cycles)
    if (this.isAudioOnlyDegraded) {
      if (instantQuality === 'good' || instantQuality === 'excellent') {
        this.consecutiveRecoverCycles++;
        if (this.consecutiveRecoverCycles >= 3) {
          this.isAudioOnlyDegraded = false;
          shouldRestoreVideo = true;
          this.consecutiveRecoverCycles = 0;
        }
      } else {
        this.consecutiveRecoverCycles = 0;
      }
    }

    // 3. Quality Transition with Hysteresis (Anti-Oscillation)
    if (instantRank < currentRank) {
      // Degrading: promptly downscale resolution and throttle bitrate to relieve bufferbloat
      this.currentQuality = instantQuality;
      qualityChanged = true;
      this.restoreCounter = 0;
    } else if (instantRank > currentRank) {
      // Improving: require 3 consecutive stable cycles before stepping up
      this.restoreCounter++;
      if (this.restoreCounter >= 3) {
        this.currentQuality = instantQuality;
        qualityChanged = true;
        this.restoreCounter = 0;
      }
    } else {
      // Stable at current level
      this.restoreCounter = 0;
    }

    const shouldAdjustSender =
      qualityChanged ||
      this.lastAppliedQuality !== this.currentQuality ||
      this.lastAppliedPreference !== preference;

    if (shouldAdjustSender) {
      this.lastAppliedQuality = this.currentQuality;
      this.lastAppliedPreference = preference;
    }

    return {
      quality: this.currentQuality,
      qualityChanged,
      shouldDegradeToAudioOnly,
      shouldRestoreVideo,
      shouldAdjustSender,
      isAudioOnlyDegraded: this.isAudioOnlyDegraded,
    };
  }
}
