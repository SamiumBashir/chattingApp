'use client';

import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Maximize2,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { CallPartner, CallType } from '@/store/callStore';
import { NetworkQualityIndicator } from './NetworkQualityIndicator';

interface CallMinimizedDockProps {
  partner: CallPartner | null;
  callType: CallType;
  formattedDuration: string;
  isMuted: boolean;
  isVideoOff: boolean;
  hasRemoteVideo: boolean;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  onMaximize: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
}

export function CallMinimizedDock({
  partner,
  callType,
  formattedDuration,
  isMuted,
  isVideoOff,
  hasRemoteVideo,
  remoteVideoRef,
  onMaximize,
  onToggleMute,
  onToggleVideo,
  onEndCall,
}: CallMinimizedDockProps) {
  return (
    <aside
      aria-label="Active call controls"
      onClick={onMaximize}
      className="fixed bottom-5 right-5 z-50 cursor-pointer flex items-center gap-3 bg-zinc-950/90 text-white border border-white/15 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl hover:border-primary/50 transition-all duration-200 select-none animate-in fade-in slide-in-from-bottom-5 max-w-[92vw] sm:max-w-sm"
    >
      {/* Mini Video / Avatar preview */}
      <div className="relative h-12 w-12 rounded-xl overflow-hidden shrink-0 bg-zinc-900 border border-white/10 flex items-center justify-center">
        {callType === 'video' && hasRemoteVideo ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        ) : (
          <Avatar
            src={partner?.avatar}
            name={partner?.name || 'User'}
            size="sm"
            className="h-9 w-9"
          />
        )}
        <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      {/* Info: Name and Duration */}
      <div className="flex flex-col min-w-0 pr-1">
        <span className="text-xs font-semibold text-zinc-100 truncate max-w-[110px] sm:max-w-[130px]">
          {partner?.name || partner?.username || 'User'}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] font-mono text-emerald-400 leading-tight">
            {formattedDuration}
          </span>
          <NetworkQualityIndicator compact className="py-0 px-1.5 text-[9px]" />
        </div>
      </div>

      {/* Mini Controls */}
      <div
        className="flex items-center gap-1.5 ml-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mute button */}
        <button
          type="button"
          onClick={onToggleMute}
          className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${
            isMuted
              ? 'bg-rose-600/80 text-white'
              : 'bg-white/10 hover:bg-white/20 text-zinc-200'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        </button>

        {/* Video toggle if video call */}
        {callType === 'video' && (
          <button
            type="button"
            onClick={onToggleVideo}
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${
              isVideoOff
                ? 'bg-rose-600/80 text-white'
                : 'bg-white/10 hover:bg-white/20 text-zinc-200'
            }`}
            title={isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
          >
            {isVideoOff ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
          </button>
        )}

        {/* Maximize button */}
        <button
          type="button"
          onClick={onMaximize}
          className="h-8 w-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-zinc-200 transition-all"
          title="Expand Call"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        {/* End Call button */}
        <button
          type="button"
          onClick={onEndCall}
          className="h-8 w-8 rounded-full flex items-center justify-center bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md ml-0.5"
          title="End Call"
        >
          <PhoneOff className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}

