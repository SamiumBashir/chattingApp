'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  WifiOff,
  AlertTriangle,
  ChevronDown,
  Gauge,
  Sliders,
  Check,
} from 'lucide-react';
import { useCallStore, NetworkQuality, QualityPreference } from '@/store/callStore';
import { cn } from '@/lib/utils';

interface NetworkQualityIndicatorProps {
  compact?: boolean;
  onPreferenceChange?: (preference: QualityPreference) => void;
  className?: string;
}

export const NetworkQualityIndicator: React.FC<NetworkQualityIndicatorProps> = ({
  compact = false,
  onPreferenceChange,
  className,
}) => {
  const { networkQuality, qualityStats, userQualityPreference, setUserQualityPreference } = useCallStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close telemetry popup on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectPreference = (pref: QualityPreference) => {
    setUserQualityPreference(pref);
    if (onPreferenceChange) {
      onPreferenceChange(pref);
    }
  };

  // Render signal icon based on quality
  const renderIcon = (quality: NetworkQuality | null) => {
    switch (quality) {
      case 'excellent':
        return <Signal className="h-4 w-4 text-emerald-400" />;
      case 'good':
        return <SignalHigh className="h-4 w-4 text-emerald-400" />;
      case 'poor':
        return <SignalMedium className="h-4 w-4 text-amber-400" />;
      case 'critical':
        return <SignalLow className="h-4 w-4 text-rose-500 animate-pulse" />;
      default:
        return <Signal className="h-4 w-4 text-zinc-400 opacity-60" />;
    }
  };

  const getQualityLabel = (quality: NetworkQuality | null) => {
    switch (quality) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good';
      case 'poor':
        return 'Poor';
      case 'critical':
        return 'Unstable';
      default:
        return 'Analyzing...';
    }
  };

  const getQualityColor = (quality: NetworkQuality | null) => {
    switch (quality) {
      case 'excellent':
      case 'good':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'poor':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'critical':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      default:
        return 'text-zinc-400 bg-zinc-800/40 border-zinc-700/30';
    }
  };

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border backdrop-blur-md cursor-pointer transition-colors',
          getQualityColor(networkQuality),
          className
        )}
        title={`Network Quality: ${getQualityLabel(networkQuality)}${
          qualityStats ? ` (RTT: ${qualityStats.rtt}ms, Loss: ${qualityStats.packetLoss}%)` : ''
        }`}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {renderIcon(networkQuality)}
        <span className="hidden sm:inline">{getQualityLabel(networkQuality)}</span>
      </div>
    );
  }

  return (
    <div className={cn('relative inline-block text-left', className)} ref={containerRef}>
      {/* Indicator Trigger Pill */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm backdrop-blur-md transition-all hover:scale-[1.02] active:scale-[0.98]',
          getQualityColor(networkQuality)
        )}
        title="Click to view network diagnostics & quality settings"
      >
        {renderIcon(networkQuality)}
        <span className="font-semibold">{getQualityLabel(networkQuality)}</span>
        {qualityStats && qualityStats.rtt > 0 && (
          <span className="text-[10px] opacity-80 font-mono hidden sm:inline">
            {qualityStats.rtt}ms
          </span>
        )}
        <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Telemetry and Preference Popover */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full mt-2 left-0 sm:left-auto sm:right-0 w-72 rounded-2xl bg-zinc-900/95 border border-zinc-700/60 shadow-2xl p-4 text-zinc-100 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Call Diagnostics
              </span>
            </div>
            <span
              className={cn(
                'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border',
                getQualityColor(networkQuality)
              )}
            >
              {getQualityLabel(networkQuality)}
            </span>
          </div>

          {/* Telemetry Grid */}
          <div className="grid grid-cols-2 gap-2 my-3 text-xs">
            <div className="rounded-xl bg-zinc-800/50 p-2 border border-zinc-800 flex flex-col">
              <span className="text-[10px] text-zinc-400 uppercase font-medium">Latency (RTT)</span>
              <span className="text-sm font-semibold font-mono text-zinc-100 mt-0.5">
                {qualityStats ? `${qualityStats.rtt} ms` : '—'}
              </span>
            </div>

            <div className="rounded-xl bg-zinc-800/50 p-2 border border-zinc-800 flex flex-col">
              <span className="text-[10px] text-zinc-400 uppercase font-medium">Packet Loss</span>
              <span
                className={cn(
                  'text-sm font-semibold font-mono mt-0.5',
                  qualityStats && qualityStats.packetLoss >= 5
                    ? 'text-rose-400'
                    : 'text-zinc-100'
                )}
              >
                {qualityStats ? `${qualityStats.packetLoss}%` : '0%'}
              </span>
            </div>

            <div className="rounded-xl bg-zinc-800/50 p-2 border border-zinc-800 flex flex-col">
              <span className="text-[10px] text-zinc-400 uppercase font-medium">Jitter</span>
              <span className="text-sm font-semibold font-mono text-zinc-100 mt-0.5">
                {qualityStats ? `${qualityStats.jitter} ms` : '—'}
              </span>
            </div>

            <div className="rounded-xl bg-zinc-800/50 p-2 border border-zinc-800 flex flex-col">
              <span className="text-[10px] text-zinc-400 uppercase font-medium">Bitrate</span>
              <span className="text-[11px] font-mono text-zinc-200 mt-0.5 leading-tight">
                ↑ {qualityStats?.uplinkKbps ?? 0} kbps
                <br />
                ↓ {qualityStats?.downlinkKbps ?? 0} kbps
              </span>
            </div>
          </div>

          {/* Connection Route & Transport Badge (STUN P2P vs TURN Relay) */}
          <div className="mb-3 px-2.5 py-1.5 rounded-xl bg-zinc-800/40 border border-zinc-800/70 flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Route Type</span>
            <span
              className={cn(
                'font-mono font-medium px-2 py-0.5 rounded text-[10px]',
                qualityStats?.isRelay
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              )}
            >
              {qualityStats?.isRelay ? 'TURN Relay' : 'P2P Direct'}
              {qualityStats?.localCandidateType ? ` (${qualityStats.localCandidateType})` : ''}
            </span>
          </div>

          {/* Video Resolution Stats (if available) */}
          {qualityStats && (qualityStats.frameWidth || qualityStats.fps) && (
            <div className="mb-3 px-2.5 py-1.5 rounded-xl bg-zinc-800/30 border border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-300">
              <span className="text-zinc-400">Resolution</span>
              <span className="font-mono font-medium">
                {qualityStats.frameWidth && qualityStats.frameHeight
                  ? `${qualityStats.frameWidth}x${qualityStats.frameHeight}`
                  : 'Auto'}{' '}
                {qualityStats.fps ? `@ ${qualityStats.fps} fps` : ''}
              </span>
            </div>
          )}

          {/* User Video Quality Preference Selector */}
          <div className="pt-2 border-t border-zinc-800">
            <div className="flex items-center gap-1.5 mb-2 text-zinc-400 text-[11px] font-medium">
              <Sliders className="h-3 w-3" />
              <span>Video Quality Mode</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'auto', label: 'Auto', hint: 'Adaptive' },
                  { id: 'high', label: 'High', hint: 'Best HD' },
                  { id: 'data-saver', label: 'Saver', hint: 'Low Data' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleSelectPreference(mode.id)}
                  className={cn(
                    'flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-xs font-medium border transition-all',
                    userQualityPreference === mode.id
                      ? 'bg-primary/20 border-primary text-primary font-bold'
                      : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  )}
                >
                  <span className="leading-tight">{mode.label}</span>
                  <span className="text-[9px] opacity-70 leading-tight">{mode.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

