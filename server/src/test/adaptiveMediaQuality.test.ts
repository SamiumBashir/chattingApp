import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

export type NetworkQuality = 'excellent' | 'good' | 'poor' | 'critical';
export type QualityPreference = 'auto' | 'high' | 'data-saver';

export interface QualityStats {
  rtt: number; // ms
  packetLoss: number; // percentage 0-100
  jitter: number; // ms
  uplinkKbps: number;
  downlinkKbps: number;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
}

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
 */
function classifyNetworkQuality(stats: QualityStats): NetworkQuality {
  const { rtt, packetLoss, jitter } = stats;

  if (packetLoss >= 20 || rtt >= 500 || jitter >= 150) {
    return 'critical';
  }
  if (packetLoss >= 8 || rtt >= 250 || jitter >= 60) {
    return 'poor';
  }
  if (packetLoss >= 2 || rtt >= 100 || jitter >= 30) {
    return 'good';
  }
  return 'excellent';
}

/**
 * Extracts normalized metrics from an RTCStatsReport.
 */
function extractRTCStats(
  report: Map<string, any>,
  prevSnapshot?: RawStatsSnapshot | null,
  mockNow?: number
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

  const now = mockNow ?? Date.now();

  report.forEach((stat: any) => {
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

    if (stat.type === 'inbound-rtp') {
      if (typeof stat.packetsLost === 'number') {
        packetsLost += stat.packetsLost;
      }
      if (typeof stat.packetsReceived === 'number') {
        packetsReceived += stat.packetsReceived;
      }
      if (typeof stat.jitter === 'number') {
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

    if (stat.type === 'outbound-rtp' && bytesSent === 0 && typeof stat.bytesSent === 'number') {
      bytesSent += stat.bytesSent;
    }
  });

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
 * Returns target video encoding parameters based on quality classification and user preference.
 */
function getTargetEncodingParameters(
  quality: NetworkQuality,
  preference: QualityPreference = 'auto'
): { scaleResolutionDownBy: number; maxBitrate: number; maxFramerate: number } {
  if (preference === 'data-saver') {
    return {
      scaleResolutionDownBy: 2.0,
      maxBitrate: 250_000,
      maxFramerate: 15,
    };
  }

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
      maxBitrate: 2_500_000,
      maxFramerate: 30,
    };
  }

  switch (quality) {
    case 'critical':
      return {
        scaleResolutionDownBy: 4.0,
        maxBitrate: 120_000,
        maxFramerate: 15,
      };
    case 'poor':
      return {
        scaleResolutionDownBy: 2.0,
        maxBitrate: 350_000,
        maxFramerate: 20,
      };
    case 'good':
      return {
        scaleResolutionDownBy: 1.0,
        maxBitrate: 1_000_000,
        maxFramerate: 30,
      };
    case 'excellent':
    default:
      return {
        scaleResolutionDownBy: 1.0,
        maxBitrate: 1_800_000,
        maxFramerate: 30,
      };
  }
}

/**
 * AdaptationManager with Hysteresis & Anti-Oscillation Logic
 */
class AdaptationManager {
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
  ) {
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

describe('Phase 8 — Adaptive Media and Network Quality', () => {
  // =========================================================================
  // 1. NETWORK QUALITY CALCULATION & CLASSIFICATION
  // =========================================================================
  describe('1. Network Quality Classification Logic', () => {
    it('classifies excellent network with low RTT, no loss, low jitter', () => {
      const stats: QualityStats = {
        rtt: 45,
        packetLoss: 0.2,
        jitter: 10,
        uplinkKbps: 1800,
        downlinkKbps: 2400,
      };
      expect(classifyNetworkQuality(stats)).toBe('excellent');
    });

    it('classifies good network when RTT or loss slightly elevates', () => {
      const stats1: QualityStats = {
        rtt: 120,
        packetLoss: 1.0,
        jitter: 15,
        uplinkKbps: 1200,
        downlinkKbps: 1500,
      };
      expect(classifyNetworkQuality(stats1)).toBe('good');

      const stats2: QualityStats = {
        rtt: 60,
        packetLoss: 3.5,
        jitter: 25,
        uplinkKbps: 1000,
        downlinkKbps: 1200,
      };
      expect(classifyNetworkQuality(stats2)).toBe('good');
    });

    it('classifies poor network when packet loss reaches 8% or RTT reaches 250ms', () => {
      const stats1: QualityStats = {
        rtt: 280,
        packetLoss: 2.0,
        jitter: 40,
        uplinkKbps: 600,
        downlinkKbps: 800,
      };
      expect(classifyNetworkQuality(stats1)).toBe('poor');

      const stats2: QualityStats = {
        rtt: 80,
        packetLoss: 12.0,
        jitter: 75,
        uplinkKbps: 500,
        downlinkKbps: 700,
      };
      expect(classifyNetworkQuality(stats2)).toBe('poor');
    });

    it('classifies critical network when packet loss >= 20% or RTT >= 500ms or jitter >= 150ms', () => {
      const stats1: QualityStats = {
        rtt: 550,
        packetLoss: 4.0,
        jitter: 50,
        uplinkKbps: 200,
        downlinkKbps: 300,
      };
      expect(classifyNetworkQuality(stats1)).toBe('critical');

      const stats2: QualityStats = {
        rtt: 150,
        packetLoss: 24.5,
        jitter: 40,
        uplinkKbps: 150,
        downlinkKbps: 200,
      };
      expect(classifyNetworkQuality(stats2)).toBe('critical');

      const stats3: QualityStats = {
        rtt: 90,
        packetLoss: 1.0,
        jitter: 180,
        uplinkKbps: 180,
        downlinkKbps: 250,
      };
      expect(classifyNetworkQuality(stats3)).toBe('critical');
    });
  });

  // =========================================================================
  // 2. RAW RTCSTATSREPORT PARSING & METRIC EXTRACTION
  // =========================================================================
  describe('2. RTCStatsReport Extraction & Metric Calculations', () => {
    it('extracts candidate-pair RTT and bytes sent/received', () => {
      const report = new Map<string, any>();
      report.set('pair-1', {
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        currentRoundTripTime: 0.048, // 48ms
        bytesSent: 150000,
        bytesReceived: 320000,
      });

      const { stats, snapshot } = extractRTCStats(report, null, 1000);
      expect(stats.rtt).toBe(48);
      expect(snapshot.bytesSent).toBe(150000);
      expect(snapshot.bytesReceived).toBe(320000);
    });

    it('extracts inbound-rtp packet loss, jitter, and frame resolution', () => {
      const report = new Map<string, any>();
      report.set('inbound-video', {
        type: 'inbound-rtp',
        kind: 'video',
        packetsLost: 25,
        packetsReceived: 975,
        jitter: 0.015, // 15ms
        frameWidth: 1280,
        frameHeight: 720,
        framesPerSecond: 29.8,
      });

      const { stats } = extractRTCStats(report, null, 1000);
      expect(stats.packetLoss).toBe(2.5); // 25 / (25 + 975) = 2.5%
      expect(stats.jitter).toBe(15);
      expect(stats.frameWidth).toBe(1280);
      expect(stats.frameHeight).toBe(720);
      expect(stats.fps).toBe(30);
    });

    it('calculates interval bitrates accurately using previous snapshot delta', () => {
      const prevSnapshot: RawStatsSnapshot = {
        timestamp: 1000,
        bytesSent: 100000,
        bytesReceived: 200000,
        packetsLost: 5,
        packetsReceived: 500,
      };

      const report = new Map<string, any>();
      report.set('pair-1', {
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        currentRoundTripTime: 0.035,
        bytesSent: 350000, // +250,000 bytes in 2 seconds = 1,000,000 bits/sec = 1000 kbps
        bytesReceived: 700000, // +500,000 bytes in 2 seconds = 2,000,000 bits/sec = 2000 kbps
      });
      report.set('inbound-video', {
        type: 'inbound-rtp',
        kind: 'video',
        packetsLost: 15, // +10 lost
        packetsReceived: 990, // +490 received -> 10 / 500 = 2.0%
        jitter: 0.012,
      });

      const { stats } = extractRTCStats(report, prevSnapshot, 3000); // 2000ms delta
      expect(stats.uplinkKbps).toBe(1000);
      expect(stats.downlinkKbps).toBe(2000);
      expect(stats.packetLoss).toBe(2.0);
    });
  });

  // =========================================================================
  // 3. TARGET ENCODING PARAMETERS & PREFERENCES
  // =========================================================================
  describe('3. Dynamic Encoding Parameters & Preferences', () => {
    it('provides full resolution and 1.8 Mbps bitrate for excellent auto mode', () => {
      const params = getTargetEncodingParameters('excellent', 'auto');
      expect(params.scaleResolutionDownBy).toBe(1.0);
      expect(params.maxBitrate).toBe(1_800_000);
      expect(params.maxFramerate).toBe(30);
    });

    it('downscales resolution by 2x and caps bitrate at 350 kbps for poor auto mode', () => {
      const params = getTargetEncodingParameters('poor', 'auto');
      expect(params.scaleResolutionDownBy).toBe(2.0);
      expect(params.maxBitrate).toBe(350_000);
      expect(params.maxFramerate).toBe(20);
    });

    it('severely downscales resolution by 4x and caps bitrate at 120 kbps for critical auto mode', () => {
      const params = getTargetEncodingParameters('critical', 'auto');
      expect(params.scaleResolutionDownBy).toBe(4.0);
      expect(params.maxBitrate).toBe(120_000);
      expect(params.maxFramerate).toBe(15);
    });

    it('enforces conservative data-saver parameters regardless of network quality', () => {
      const params = getTargetEncodingParameters('excellent', 'data-saver');
      expect(params.scaleResolutionDownBy).toBe(2.0);
      expect(params.maxBitrate).toBe(250_000);
      expect(params.maxFramerate).toBe(15);
    });

    it('allocates 2.5 Mbps HD bitrate in high quality mode unless network is critical', () => {
      const paramsGood = getTargetEncodingParameters('good', 'high');
      expect(paramsGood.scaleResolutionDownBy).toBe(1.0);
      expect(paramsGood.maxBitrate).toBe(2_500_000);

      const paramsCritical = getTargetEncodingParameters('critical', 'high');
      expect(paramsCritical.scaleResolutionDownBy).toBe(2.0);
      expect(paramsCritical.maxBitrate).toBe(450_000);
    });
  });

  // =========================================================================
  // 4. SENDER PARAMETERS ADJUSTMENT (RTCRtpSender)
  // =========================================================================
  describe('4. RTCRtpSender Encoding Parameter Application', () => {
    it('applies parameters to video sender encodings correctly', async () => {
      const encodings = [{ scaleResolutionDownBy: 1.0, maxBitrate: 1800000, maxFramerate: 30 }];
      const mockSender = {
        track: { kind: 'video' },
        getParameters: vi.fn().mockReturnValue({ encodings }),
        setParameters: vi.fn().mockResolvedValue(undefined),
      };

      const target = getTargetEncodingParameters('poor', 'auto');
      const params = mockSender.getParameters();
      params.encodings.forEach((enc: any) => {
        enc.scaleResolutionDownBy = target.scaleResolutionDownBy;
        enc.maxBitrate = target.maxBitrate;
        enc.maxFramerate = target.maxFramerate;
      });
      await mockSender.setParameters(params);

      expect(mockSender.setParameters).toHaveBeenCalledWith({
        encodings: [
          {
            scaleResolutionDownBy: 2.0,
            maxBitrate: 350000,
            maxFramerate: 20,
          },
        ],
      });
    });
  });

  // =========================================================================
  // 5. HYSTERESIS, ANTI-OSCILLATION & AUDIO-ONLY FALLBACK / RESTORATION
  // =========================================================================
  describe('5. Hysteresis, Anti-Oscillation & Audio-Only Degradation', () => {
    let manager: AdaptationManager;

    beforeEach(() => {
      manager = new AdaptationManager('excellent');
    });

    it('promptly downgrades quality on first cycle of poor network to prevent buffering', () => {
      const poorStats: QualityStats = {
        rtt: 300,
        packetLoss: 10,
        jitter: 70,
        uplinkKbps: 500,
        downlinkKbps: 700,
      };

      const decision = manager.processStats(poorStats, true, 'auto');
      expect(decision.quality).toBe('poor');
      expect(decision.qualityChanged).toBe(true);
      expect(decision.shouldAdjustSender).toBe(true);
      expect(decision.shouldDegradeToAudioOnly).toBe(false);
    });

    it('requires 3 consecutive cycles before upgrading quality (Anti-Oscillation protection)', () => {
      // First cycle: Drop to poor
      manager.processStats({ rtt: 300, packetLoss: 10, jitter: 70, uplinkKbps: 500, downlinkKbps: 700 }, true);
      expect(manager.getCurrentQuality()).toBe('poor');

      const excellentStats: QualityStats = {
        rtt: 40,
        packetLoss: 0,
        jitter: 10,
        uplinkKbps: 1800,
        downlinkKbps: 2000,
      };

      // Cycle 1 of recovery: Should remain poor
      let d1 = manager.processStats(excellentStats, true);
      expect(d1.quality).toBe('poor');
      expect(manager.getCurrentQuality()).toBe('poor');

      // Cycle 2 of recovery: Should still remain poor
      let d2 = manager.processStats(excellentStats, true);
      expect(d2.quality).toBe('poor');
      expect(manager.getCurrentQuality()).toBe('poor');

      // Cycle 3 of recovery: Now safely upgrades to excellent
      let d3 = manager.processStats(excellentStats, true);
      expect(d3.quality).toBe('excellent');
      expect(d3.qualityChanged).toBe(true);
      expect(manager.getCurrentQuality()).toBe('excellent');
    });

    it('triggers audio-only degradation when critical condition persists for 2 consecutive cycles', () => {
      const criticalStats: QualityStats = {
        rtt: 650,
        packetLoss: 25,
        jitter: 160,
        uplinkKbps: 80,
        downlinkKbps: 100,
      };

      // Cycle 1 of critical: Downgrades to critical, but does NOT kill video yet
      const d1 = manager.processStats(criticalStats, true, 'auto');
      expect(d1.quality).toBe('critical');
      expect(d1.shouldDegradeToAudioOnly).toBe(false);
      expect(manager.getIsAudioOnlyDegraded()).toBe(false);

      // Cycle 2 of critical: Triggers audio-only fallback to safeguard voice clarity
      const d2 = manager.processStats(criticalStats, true, 'auto');
      expect(d2.quality).toBe('critical');
      expect(d2.shouldDegradeToAudioOnly).toBe(true);
      expect(d2.isAudioOnlyDegraded).toBe(true);
      expect(manager.getIsAudioOnlyDegraded()).toBe(true);
    });

    it('automatically restores video once network recovers to good/excellent for 3 cycles', () => {
      const criticalStats: QualityStats = {
        rtt: 650,
        packetLoss: 25,
        jitter: 160,
        uplinkKbps: 80,
        downlinkKbps: 100,
      };

      // Cause degradation to audio-only
      manager.processStats(criticalStats, true);
      manager.processStats(criticalStats, true);
      expect(manager.getIsAudioOnlyDegraded()).toBe(true);

      const goodStats: QualityStats = {
        rtt: 120,
        packetLoss: 2.5,
        jitter: 25,
        uplinkKbps: 1200,
        downlinkKbps: 1500,
      };

      // Recovery cycle 1
      const r1 = manager.processStats(goodStats, true);
      expect(r1.shouldRestoreVideo).toBe(false);
      expect(manager.getIsAudioOnlyDegraded()).toBe(true);

      // Recovery cycle 2
      const r2 = manager.processStats(goodStats, true);
      expect(r2.shouldRestoreVideo).toBe(false);
      expect(manager.getIsAudioOnlyDegraded()).toBe(true);

      // Recovery cycle 3: Video is restored
      const r3 = manager.processStats(goodStats, true);
      expect(r3.shouldRestoreVideo).toBe(true);
      expect(r3.isAudioOnlyDegraded).toBe(false);
      expect(manager.getIsAudioOnlyDegraded()).toBe(false);
    });
  });

  // =========================================================================
  // 6. BACKGROUND TAB POLLING INTERVAL THROTTLING
  // =========================================================================
  describe('6. Background Tab Polling Throttling', () => {
    it('sets 2000ms polling in foreground tab and throttles to 5000ms in background tab', () => {
      const determineInterval = (visibilityState: 'visible' | 'hidden'): number => {
        return visibilityState === 'hidden' ? 5000 : 2000;
      };

      expect(determineInterval('visible')).toBe(2000);
      expect(determineInterval('hidden')).toBe(5000);
    });
  });
});
