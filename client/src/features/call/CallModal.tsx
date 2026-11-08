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
} from 'lucide-react';
import { useCall } from './CallContext';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CallModal() {
  const {
    callState,
    callType,
    partner,
    isMuted,
    isVideoOff,
    formattedDuration,
    error,
    localStream,
    remoteStream,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCall();

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const hasRemoteVideo = Boolean(
    remoteStream &&
      remoteStream.getVideoTracks().length > 0 &&
      remoteStream.getVideoTracks().some((t) => t.enabled)
  );

  // Dedicated handler to manually unblock audio on user gesture
  const handleUnblockAudio = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current
        .play()
        .then(() => setIsAudioBlocked(false))
        .catch(() => {});
    }
  };

  // Attach remote stream to audio element (handles sound for both voice and video calls)
  useEffect(() => {
    const audioEl = remoteAudioRef.current;
    if (audioEl && remoteStream && callState === 'connected') {
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

  // Attach remote stream to video element for video calls (muted to bypass Autoplay restrictions)
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (videoEl && remoteStream && callType === 'video' && callState === 'connected') {
      if (videoEl.srcObject !== remoteStream) {
        videoEl.srcObject = remoteStream;
      }
      videoEl.play().catch((err) => {
        console.warn('Remote video playback warning:', err);
      });
    }
  }, [remoteStream, callState, callType]);

  // Attach local stream to preview element
  useEffect(() => {
    const localEl = localVideoRef.current;
    if (localEl && localStream) {
      if (localEl.srcObject !== localStream) {
        localEl.srcObject = localStream;
      }
      localEl.play().catch(() => {});
    }
  }, [localStream, callState, isVideoOff]);

  if (callState === 'idle') {
    return null;
  }

  return (
    <div
      onClick={() => {
        if (isAudioBlocked) {
          handleUnblockAudio();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center select-none animate-in fade-in duration-200"
    >
      {/* Remote audio playback for all connected calls (voice and video) */}
      {callState === 'connected' && (
        <audio ref={remoteAudioRef} autoPlay playsInline />
      )}

      {/* Floating browser autoplay unblock notification banner */}
      {callState === 'connected' && isAudioBlocked && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            handleUnblockAudio();
          }}
          className="fixed top-6 z-50 cursor-pointer flex items-center gap-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-5 py-2.5 shadow-2xl animate-bounce transition-all text-xs sm:text-sm"
        >
          <Volume2 className="h-4 w-4 shrink-0" />
          <span>Click here to enable call audio</span>
        </div>
      )}

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
                  onClick={acceptCall}
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
      {/* 2. OUTGOING CALL SCREEN (Calling...) */}
      {/* ============================================================ */}
      {callState === 'calling' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card border shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            {error ? (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 text-destructive px-3 py-2 text-xs font-medium w-full text-left">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

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
              Ringing...
            </p>

            {/* Cancel Call Button */}
            <div className="mt-8 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => endCall(true)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-transform active:scale-95"
                title="Cancel Call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
              <span className="text-xs font-medium text-muted-foreground">End Call</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. CONNECTED VOICE CALL */}
      {/* ============================================================ */}
      {callState === 'connected' && callType === 'audio' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card border shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 text-destructive px-3 py-2 text-xs font-medium w-full text-left">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Call status badge */}
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 text-xs font-semibold mb-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Voice Call · {formattedDuration}</span>
            </div>

            {/* Active Avatar */}
            <div className="relative my-6 flex items-center justify-center">
              <span className="absolute inline-flex h-28 w-28 animate-pulse rounded-full bg-emerald-500/20" />
              <Avatar
                src={partner?.avatar}
                name={partner?.name || 'User'}
                size="xl"
                className="relative h-20 w-20 ring-4 ring-emerald-500/40 shadow-xl"
              />
            </div>

            <h3 className="text-xl font-bold text-foreground">
              {partner?.name || partner?.username || 'User'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {partner?.username ? `@${partner.username}` : 'Connected'}
            </p>

            {/* Controls */}
            <div className="mt-8 flex items-center justify-center gap-5">
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

              {/* End Call */}
              <button
                type="button"
                onClick={() => endCall(true)}
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
      {/* 4. CONNECTED VIDEO CALL */}
      {/* ============================================================ */}
      {callState === 'connected' && callType === 'video' && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center">
          {/* Main Remote Video Container */}
          <div className="relative h-full w-full flex items-center justify-center bg-black overflow-hidden">
            {/* Remote video element always kept in DOM so WebRTC stream and hardware decoders don't get unmounted */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                'h-full w-full object-cover transition-opacity duration-300',
                hasRemoteVideo ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
              )}
            />

            {!hasRemoteVideo && (
              <div className="flex flex-col items-center justify-center gap-4 text-white">
                <Avatar
                  src={partner?.avatar}
                  name={partner?.name || 'User'}
                  size="xl"
                  className="h-24 w-24 ring-4 ring-white/20 shadow-2xl"
                />
                <p className="text-sm font-medium text-zinc-300">
                  Connecting video feed with {partner?.name}...
                </p>
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
            </div>

            {/* Picture-in-Picture Local Video Preview */}
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 w-28 h-40 sm:w-44 sm:h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-zinc-900 z-30">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  'h-full w-full object-cover -scale-x-100',
                  isVideoOff && 'hidden'
                )}
              />
              {isVideoOff && (
                <div className="flex flex-col items-center justify-center h-full w-full bg-zinc-900 text-white gap-2 p-2 text-center">
                  <VideoOff className="h-6 w-6 text-zinc-500" />
                  <span className="text-[11px] text-zinc-400">Camera off</span>
                </div>
              )}
            </div>

            {/* Bottom Floating Glassmorphic Control Bar */}
            <div className="absolute bottom-6 sm:bottom-8 inset-x-0 flex items-center justify-center z-30 px-4">
              <div className="flex items-center gap-4 sm:gap-6 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 px-6 py-3.5 shadow-2xl">
                {/* Mic Toggle */}
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
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
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                    isVideoOff
                      ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive/40'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                >
                  {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </button>

                {/* End Call Button */}
                <button
                  type="button"
                  onClick={() => endCall(true)}
                  className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-transform active:scale-95"
                  title="End Call"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

