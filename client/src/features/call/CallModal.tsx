'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  AlertCircle,
  Volume2,
  Loader2,
  RefreshCw,
  Minimize2,
  ScreenShare,
  Settings,
  Move,
  FlipHorizontal,
  PictureInPicture2,
  Sparkles,
} from 'lucide-react';
import { useCall } from './CallContext';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { CallMinimizedDock } from './CallMinimizedDock';
import { DeviceSettingsModal } from './DeviceSettingsModal';
import { CallWaveAnimation } from './CallWaveAnimation';
import { NetworkQualityIndicator } from './NetworkQualityIndicator';
import { PipPosition } from '@/store/callStore';

const PIP_POSITIONS: PipPosition[] = [
  'top-right',
  'bottom-right',
  'bottom-left',
  'top-left',
];

const PIP_CLASSES: Record<PipPosition, string> = {
  'top-right': 'top-4 right-4 sm:top-6 sm:right-6',
  'bottom-right': 'bottom-24 right-4 sm:bottom-28 sm:right-6',
  'bottom-left': 'bottom-24 left-4 sm:bottom-28 sm:left-6',
  'top-left': 'top-4 left-4 sm:top-6 sm:left-6',
};

export function CallModal() {
  const {
    callState,
    callType,
    partner,
    isMuted,
    isVideoOff,
    isMinimized,
    isScreenSharing,
    pipPosition,
    isLocalFlipped,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    availableDevices,
    formattedDuration,
    error,
    endReason,
    reconnectReason,
    localStream,
    remoteStream,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleMinimized,
    toggleScreenShare,
    setPipPosition,
    toggleLocalFlipped,
    switchAudioInput,
    switchVideoInput,
    switchAudioOutput,
    networkQuality,
    qualityStats,
    isAudioOnlyDegraded,
    userQualityPreference,
    changeQualityPreference,
    isBackgroundBlurred,
    toggleBackgroundBlur,
  } = useCall();

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Dedicated helper to prime and unlock audio on user gesture
  const primeAudio = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.play().catch(() => {});
    }
  };

  // Dedicated handler to manually unblock audio on user gesture
  const handleUnblockAudio = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current
        .play()
        .then(() => setIsAudioBlocked(false))
        .catch(() => {});
    }
  };

  // Cycle PiP position
  const cyclePipPosition = () => {
    const currentIdx = PIP_POSITIONS.indexOf(pipPosition);
    const nextIdx = (currentIdx + 1) % PIP_POSITIONS.length;
    setPipPosition(PIP_POSITIONS[nextIdx]);
  };

  // Toggle native browser Picture-in-Picture window
  const handleToggleNativePip = async () => {
    try {
      if (typeof document === 'undefined') return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (remoteVideoRef.current && document.pictureInPictureEnabled) {
        await remoteVideoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('Native Picture-in-Picture error:', err);
    }
  };

  // Track remote video track availability & state changes
  useEffect(() => {
    if (!remoteStream || callType !== 'video') {
      setHasRemoteVideo(false);
      return;
    }

    const checkTracks = () => {
      const vTracks = remoteStream.getVideoTracks();
      const active = vTracks.length > 0 && vTracks.some((t) => t.enabled && !t.muted);
      setHasRemoteVideo(active);
    };

    checkTracks();

    const videoTracks = remoteStream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.addEventListener('unmute', checkTracks);
      track.addEventListener('mute', checkTracks);
      track.addEventListener('ended', checkTracks);
    });

    return () => {
      videoTracks.forEach((track) => {
        track.removeEventListener('unmute', checkTracks);
        track.removeEventListener('mute', checkTracks);
        track.removeEventListener('ended', checkTracks);
      });
    };
  }, [remoteStream, callType]);

  // Attach remote stream to audio element
  useEffect(() => {
    const audioEl = remoteAudioRef.current;
    if (audioEl && remoteStream && (callState === 'connected' || callState === 'reconnecting')) {
      if (audioEl.srcObject !== remoteStream) {
        audioEl.srcObject = remoteStream;
      }
      audioEl
        .play()
        .then(() => {
          setIsAudioBlocked(false);
        })
        .catch((err) => {
          console.warn('Audio playback blocked by browser Autoplay Policy:', err);
          setIsAudioBlocked(true);
        });
    }
  }, [remoteStream, callState]);

  // Attach remote stream to video element for video calls
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (videoEl && remoteStream && callType === 'video' && (callState === 'connected' || callState === 'reconnecting')) {
      videoEl.muted = true;
      if (videoEl.srcObject !== remoteStream) {
        videoEl.srcObject = remoteStream;
      }
      videoEl
        .play()
        .then(() => {
          if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            setHasRemoteVideo(true);
          }
        })
        .catch((err) => {
          console.warn('Remote video playback warning:', err);
        });
    }
  }, [remoteStream, callState, callType]);

  // Attach local stream to preview element
  useEffect(() => {
    const localEl = localVideoRef.current;
    if (localEl && localStream) {
      localEl.muted = true;
      if (localEl.srcObject !== localStream) {
        localEl.srcObject = localStream;
      }
      localEl.play().catch(() => {});
    }
  }, [localStream, callState, isVideoOff]);

  if (callState === 'idle') {
    return (
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="hidden"
        aria-hidden="true"
        data-remote-call-audio="true"
      />
    );
  }

  const isOutgoing = callState === 'initiating' || callState === 'ringing';
  const isConnecting = callState === 'accepting' || callState === 'connecting';
  const isCallActive = callState === 'connected' || callState === 'reconnecting';
  const isTerminal = callState === 'ending' || callState === 'ended' || callState === 'failed';

  // If call is active and user minimized to floating dock
  if (isCallActive && isMinimized) {
    return (
      <>
        {/* Remote audio playback element kept alive in DOM */}
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          className="hidden"
          aria-hidden="true"
          data-remote-call-audio="true"
        />

        {/* Floating browser autoplay unblock banner */}
        {isAudioBlocked && (
          <div
            role="button"
            tabIndex={0}
            onClick={handleUnblockAudio}
            className="fixed top-6 right-6 z-60 cursor-pointer flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-4 py-2 shadow-2xl animate-bounce transition-all text-xs"
          >
            <Volume2 className="h-4 w-4 shrink-0" />
            <span>Enable Call Audio</span>
          </div>
        )}

        <CallMinimizedDock
          partner={partner}
          callType={callType}
          formattedDuration={formattedDuration}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          hasRemoteVideo={hasRemoteVideo}
          remoteVideoRef={remoteVideoRef}
          onMaximize={toggleMinimized}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onEndCall={() => endCall(true, 'user_ended')}
        />
      </>
    );
  }

  return (
    <div
      onClick={() => {
        primeAudio();
        if (isAudioBlocked) {
          handleUnblockAudio();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center select-none animate-in fade-in duration-200"
    >
      {/* Remote audio playback element kept in DOM across entire call lifecycle */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="hidden"
        aria-hidden="true"
        data-remote-call-audio="true"
      />

      {/* Floating browser autoplay unblock notification banner */}
      {isCallActive && isAudioBlocked && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            handleUnblockAudio();
          }}
          className="fixed top-6 z-60 cursor-pointer flex items-center gap-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-5 py-2.5 shadow-2xl animate-bounce transition-all text-xs sm:text-sm"
        >
          <Volume2 className="h-4 w-4 shrink-0" />
          <span>Click here to enable call audio</span>
        </div>
      )}

      {/* Floating Reconnection Alert Banner */}
      {callState === 'reconnecting' && (
        <div className="fixed top-6 z-60 flex items-center gap-2.5 rounded-full bg-amber-500/90 text-zinc-950 font-semibold px-5 py-2.5 shadow-2xl animate-pulse text-xs sm:text-sm backdrop-blur-md">
          <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
          <span>{reconnectReason || 'Connection interrupted. Reconnecting...'}</span>
        </div>
      )}

      {/* Floating Audio-only Congestion Fallback Alert */}
      {isCallActive && isAudioOnlyDegraded && callType === 'video' && (
        <div className="fixed top-6 z-60 flex items-center gap-2.5 rounded-full bg-amber-500 text-zinc-950 font-semibold px-5 py-2.5 shadow-2xl animate-pulse text-xs sm:text-sm backdrop-blur-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Video paused due to poor network connection. Voice call prioritized.</span>
        </div>
      )}

      {/* Floating Unstable Network Warning Banner */}
      {isCallActive && !isAudioOnlyDegraded && callState !== 'reconnecting' && (networkQuality === 'poor' || networkQuality === 'critical') && (
        <div className="fixed top-6 z-60 flex items-center gap-2.5 rounded-full bg-amber-500/90 text-zinc-950 font-semibold px-5 py-2.5 shadow-2xl animate-pulse text-xs sm:text-sm backdrop-blur-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {networkQuality === 'critical'
              ? 'Network critically congested. Reducing video bandwidth.'
              : 'Network connection is unstable. Video quality adjusted.'}
          </span>
        </div>
      )}

      {/* Device Settings Modal */}
      <DeviceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        callType={callType}
        availableDevices={availableDevices}
        selectedAudioInput={selectedAudioInput}
        selectedAudioOutput={selectedAudioOutput}
        selectedVideoInput={selectedVideoInput}
        onSelectAudioInput={switchAudioInput}
        onSelectAudioOutput={switchAudioOutput}
        onSelectVideoInput={switchVideoInput}
      />

      {/* ============================================================ */}
      {/* 1. INCOMING CALL SCREEN */}
      {/* ============================================================ */}
      {callState === 'incoming' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card border shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 text-destructive px-3 py-2 text-xs font-medium w-full text-left">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
              Incoming {callType === 'video' ? 'Video' : 'Voice'} Call
            </span>

            {/* Pulsing Avatar */}
            <div className="relative my-4 flex items-center justify-center">
              <span className="absolute inline-flex h-28 w-28 animate-ping rounded-full bg-primary/20 opacity-75 duration-1000" />
              <span className="absolute inline-flex h-24 w-24 animate-pulse rounded-full bg-primary/30" />
              <Avatar
                src={partner?.avatar}
                name={partner?.name || 'User'}
                size="xl"
                className="relative h-20 w-20 ring-4 ring-primary/40 shadow-xl"
              />
            </div>

            <h3 className="text-xl font-bold text-foreground mt-2">
              {partner?.name || partner?.username || 'Unknown User'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {partner?.username ? `@${partner.username}` : 'Calling you...'}
            </p>

            {/* Action Buttons */}
            <div className="mt-8 flex items-center justify-center gap-8 w-full">
              {/* Decline button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={rejectCall}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-transform active:scale-95"
                  title="Decline"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
                <span className="text-xs font-medium text-muted-foreground">Decline</span>
              </div>

              {/* Accept button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    primeAudio();
                    acceptCall();
                  }}
                  className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transition-transform active:scale-95 ring-4 ring-emerald-500/30"
                  title="Accept"
                >
                  {callType === 'video' ? (
                    <Video className="h-6 w-6" />
                  ) : (
                    <Phone className="h-6 w-6 animate-pulse" />
                  )}
                </button>
                <span className="text-xs font-medium text-muted-foreground">Accept</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. OUTGOING CALL SCREEN (Initiating / Ringing) */}
      {/* ============================================================ */}
      {isOutgoing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card border shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 text-destructive px-3 py-2 text-xs font-medium w-full text-left">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {callType === 'video' ? 'Outgoing Video Call' : 'Outgoing Voice Call'}
            </span>

            {/* Pulsing Avatar or Live Camera Preview */}
            <div className="relative my-4 flex items-center justify-center">
              {callType === 'video' && localStream && !isVideoOff ? (
                <div className="relative h-28 w-28 rounded-full overflow-hidden ring-4 ring-primary/40 shadow-xl border-2 border-primary">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover -scale-x-100"
                  />
                </div>
              ) : (
                <>
                  <span className="absolute inline-flex h-28 w-28 animate-ping rounded-full bg-primary/20 opacity-60 duration-1000" />
                  <span className="absolute inline-flex h-24 w-24 animate-pulse rounded-full bg-primary/30" />
                  <Avatar
                    src={partner?.avatar}
                    name={partner?.name || 'User'}
                    size="xl"
                    className="relative h-20 w-20 ring-4 ring-primary/40 shadow-xl"
                  />
                </>
              )}
            </div>

            <h3 className="text-xl font-bold text-foreground mt-2">
              {partner?.name || partner?.username || 'User'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              {callState === 'initiating' ? 'Connecting media...' : 'Ringing...'}
            </p>

            {/* Cancel Call Button */}
            <div className="mt-8 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => endCall(true, 'cancelled')}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-transform active:scale-95"
                title="Cancel Call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
              <span className="text-xs font-medium text-muted-foreground">Cancel</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. CONNECTING SCREEN (Accepting / WebRTC Connecting) */}
      {/* ============================================================ */}
      {isConnecting && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card border shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
              Establishing {callType === 'video' ? 'Video' : 'Voice'} Call
            </span>

            <div className="relative my-4 flex items-center justify-center">
              <Avatar
                src={partner?.avatar}
                name={partner?.name || 'User'}
                size="xl"
                className="relative h-20 w-20 ring-4 ring-primary/40 shadow-xl"
              />
              <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-xs">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            </div>

            <h3 className="text-xl font-bold text-foreground mt-2">
              {partner?.name || partner?.username || 'User'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              Connecting secure media stream...
            </p>

            {/* Cancel / End Call Button */}
            <div className="mt-8 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => endCall(true, 'cancelled')}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-transform active:scale-95"
                title="Cancel"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
              <span className="text-xs font-medium text-muted-foreground">Cancel</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. CONNECTED VOICE CALL */}
      {/* ============================================================ */}
      {isCallActive && callType === 'audio' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="relative w-full max-w-sm rounded-3xl bg-card border shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            {/* Top Minimize Button */}
            <button
              type="button"
              onClick={toggleMinimized}
              className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Minimize to floating window"
            >
              <Minimize2 className="h-5 w-5" />
            </button>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 text-destructive px-3 py-2 text-xs font-medium w-full text-left">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Call status badge and Network Quality */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Voice Call · {formattedDuration}</span>
              </div>
              <NetworkQualityIndicator onPreferenceChange={changeQualityPreference} />
            </div>

            {/* Active Avatar */}
            <div className="relative my-4 flex items-center justify-center">
              <span className="absolute inline-flex h-28 w-28 animate-pulse rounded-full bg-emerald-500/20" />
              <Avatar
                src={partner?.avatar}
                name={partner?.name || 'User'}
                size="xl"
                className="relative h-20 w-20 ring-4 ring-emerald-500/40 shadow-xl"
              />
            </div>

            {/* Sound Wave Animation */}
            <CallWaveAnimation isMuted={isMuted} />

            <h3 className="text-xl font-bold text-foreground mt-1">
              {partner?.name || partner?.username || 'User'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {callState === 'reconnecting'
                ? 'Reconnecting...'
                : partner?.username
                ? `@${partner.username}`
                : 'Connected'}
            </p>

            {/* Controls */}
            <div className="mt-8 flex items-center justify-center gap-4">
              {/* Mic toggle */}
              <button
                type="button"
                onClick={toggleMute}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-all shadow ${
                  isMuted
                    ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive/40'
                    : 'bg-muted hover:bg-muted/80 text-foreground'
                }`}
                title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              {/* Device Settings */}
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-foreground transition-all shadow"
                title="Audio Device Settings"
              >
                <Settings className="h-5 w-5" />
              </button>

              {/* Minimize Call */}
              <button
                type="button"
                onClick={toggleMinimized}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-foreground transition-all shadow"
                title="Minimize Call"
              >
                <Minimize2 className="h-5 w-5" />
              </button>

              {/* End Call */}
              <button
                type="button"
                onClick={() => endCall(true, 'user_ended')}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-transform active:scale-95"
                title="End Call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. CONNECTED VIDEO CALL */}
      {/* ============================================================ */}
      {isCallActive && callType === 'video' && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center">
          {/* Main Remote Video Container */}
          <div className="relative h-full w-full flex items-center justify-center bg-black overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setHasRemoteVideo(true)}
              onPlaying={() => setHasRemoteVideo(true)}
              className={cn(
                'h-full w-full object-cover transition-opacity duration-300',
                hasRemoteVideo ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
              )}
            />

            {/* Fallback Avatar when remote camera is paused/off */}
            {!hasRemoteVideo && (
              <div className="flex flex-col items-center justify-center gap-4 text-white">
                <div className="relative flex items-center justify-center">
                  <span className="absolute inline-flex h-32 w-32 animate-pulse rounded-full bg-white/10" />
                  <Avatar
                    src={partner?.avatar}
                    name={partner?.name || 'User'}
                    size="xl"
                    className="h-24 w-24 ring-4 ring-white/20 shadow-2xl"
                  />
                </div>
                <div className="flex flex-col items-center text-center">
                  <h3 className="text-lg font-bold text-white">
                    {partner?.name || 'User'}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    {callState === 'reconnecting'
                      ? 'Reconnecting video feed...'
                      : 'Camera is currently paused or inactive'}
                  </p>
                </div>
              </div>
            )}

            {/* Top Bar Header Overlay */}
            <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-3 rounded-full bg-black/50 backdrop-blur-md px-4 py-2 border border-white/10 z-30">
              <Avatar
                src={partner?.avatar}
                name={partner?.name || 'User'}
                size="sm"
                className="h-7 w-7"
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white leading-tight">
                  {partner?.name || 'User'}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono leading-tight">
                  {formattedDuration}
                </span>
              </div>
              <div className="h-4 w-px bg-white/20 mx-0.5" />
              <NetworkQualityIndicator onPreferenceChange={changeQualityPreference} />
            </div>

            {/* Top Right Controls (Native PiP & Minimize) */}
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-40 flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleNativePip}
                className="p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md border border-white/10 transition-colors shadow-lg"
                title="Pop out to floating Picture-in-Picture window"
              >
                <PictureInPicture2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleMinimized}
                className="p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md border border-white/10 transition-colors shadow-lg hidden sm:flex"
                title="Minimize Call"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>

            {/* Picture-in-Picture Local Video Preview */}
            <div
              className={cn(
                'absolute group rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-zinc-900 z-30 transition-all duration-200',
                'w-28 h-40 sm:w-44 sm:h-60',
                PIP_CLASSES[pipPosition]
              )}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={isBackgroundBlurred ? { filter: 'blur(3px) contrast(102%)' } : undefined}
                className={cn(
                  'h-full w-full object-cover transition-transform',
                  isLocalFlipped && '-scale-x-100',
                  isVideoOff && 'hidden'
                )}
              />
              {isVideoOff && (
                <div className="flex flex-col items-center justify-center h-full w-full bg-zinc-900 text-white gap-2 p-2 text-center">
                  <VideoOff className="h-6 w-6 text-zinc-500" />
                  <span className="text-[11px] text-zinc-400">Camera off</span>
                </div>
              )}

              {/* PiP quick overlay actions (Flip, Background Blur, Move corner) */}
              <div className="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-10 px-1 py-1 rounded-xl bg-black/60 backdrop-blur-xs">
                <button
                  type="button"
                  onClick={toggleLocalFlipped}
                  className="p-1 rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                  title="Flip self view"
                >
                  <FlipHorizontal className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={toggleBackgroundBlur}
                  className={cn(
                    'p-1 rounded transition-colors',
                    isBackgroundBlurred
                      ? 'text-primary bg-primary/20'
                      : 'text-white/80 hover:text-white hover:bg-white/20'
                  )}
                  title={isBackgroundBlurred ? 'Disable background blur' : 'Enable background blur'}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cyclePipPosition}
                  className="p-1 rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                  title="Move preview corner"
                >
                  <Move className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Bottom Floating Glassmorphic Control Bar */}
            <div className="absolute bottom-6 sm:bottom-8 inset-x-0 flex items-center justify-center z-30 px-4">
              <div className="flex items-center gap-3 sm:gap-5 rounded-full bg-black/65 backdrop-blur-xl border border-white/15 px-5 sm:px-7 py-3.5 shadow-2xl">
                {/* Mic Toggle */}
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full transition-all ${
                    isMuted
                      ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive/40'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>

                {/* Camera Toggle */}
                <button
                  type="button"
                  onClick={toggleVideo}
                  className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full transition-all ${
                    isVideoOff
                      ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive/40'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                >
                  {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </button>

                {/* Screen Share Toggle */}
                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full transition-all ${
                    isScreenSharing
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-500/40'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
                >
                  <ScreenShare className="h-5 w-5" />
                </button>

                {/* Device Settings */}
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
                  title="Media Device Settings"
                >
                  <Settings className="h-5 w-5" />
                </button>

                {/* Minimize Button */}
                <button
                  type="button"
                  onClick={toggleMinimized}
                  className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
                  title="Minimize Call"
                >
                  <Minimize2 className="h-5 w-5" />
                </button>

                {/* End Call Button */}
                <button
                  type="button"
                  onClick={() => endCall(true, 'user_ended')}
                  className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-transform active:scale-95 ml-1"
                  title="End Call"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. TERMINAL SCREEN (Ending / Ended / Failed) */}
      {/* ============================================================ */}
      {isTerminal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-card border shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center">
            <div
              className={cn(
                'h-16 w-16 rounded-full flex items-center justify-center mb-4',
                callState === 'failed'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {callState === 'failed' ? (
                <AlertCircle className="h-8 w-8" />
              ) : (
                <PhoneOff className="h-8 w-8" />
              )}
            </div>

            <h3 className="text-lg font-bold text-foreground">
              {callState === 'failed' ? 'Call Failed' : 'Call Ended'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {endReason || error || 'The call has concluded.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
