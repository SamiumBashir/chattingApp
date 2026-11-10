'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useCallStore, CallPartner, CallType, QualityPreference } from '@/store/callStore';
import {
  startOutgoingRinging,
  startIncomingRinging,
  playCallConnectedSound,
  playCallEndSound,
  playBusySound,
  playReconnectingSound,
  stopCallSounds,
  unlockAudioMedia,
  setupAutoplayUnlock,
} from '@/lib/callSounds';
import { callService } from '@/services/call.service';
import {
  extractRTCStats,
  applyAdaptiveBitrate,
  AdaptationManager,
  RawStatsSnapshot,
} from '@/lib/webrtcStats';

// Secure ICE servers are dynamically fetched from the authenticated backend via callService.


const acquireUserMedia = async (type: CallType): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        type === 'video'
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
    });
  } catch (err) {
    console.warn('Advanced constraints rejected, falling back to basic constraints:', err);
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
    } catch (fallbackErr: any) {
      // If video requested but no camera found (e.g. desktop without webcam), fall back to audio
      if (
        type === 'video' &&
        (fallbackErr?.name === 'NotFoundError' || fallbackErr?.name === 'DevicesNotFoundError')
      ) {
        console.warn('Camera hardware not found, falling back to audio-only stream');
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      }
      throw fallbackErr;
    }
  }
};

export function useWebRTC() {
  const { user } = useAuthStore();
  const {
    callState,
    callType,
    partner,
    conversationId,
    callId,
    isMuted,
    isVideoOff,
    isMinimized,
    isScreenSharing,
    pipPosition,
    isLocalFlipped,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    formattedDuration,
    error,
    endReason,
    reconnectReason,
    peerConnectionState,
    iceConnectionState,
    networkQuality,
    qualityStats,
    isAudioOnlyDegraded,
    userQualityPreference,
    isBackgroundBlurred,
    isRatingModalOpen,
    setInitiating,
    setRinging,
    setIncoming,
    setAccepting,
    setConnecting,
    setConnected,
    setReconnecting,
    setEnding,
    setEnded,
    setFailed,
    setConnectionStates,
    setDuration,
    setIsMuted,
    setIsVideoOff,
    setIsMinimized,
    toggleMinimized,
    setIsScreenSharing,
    setPipPosition,
    setIsLocalFlipped,
    toggleLocalFlipped,
    setSelectedAudioInput,
    setSelectedAudioOutput,
    setSelectedVideoInput,
    setNetworkQuality,
    setIsAudioOnlyDegraded,
    setUserQualityPreference,
    toggleBackgroundBlur,
    openRatingModal,
    closeRatingModal,
    resetCall,
  } = useCallStore();

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const originalCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [availableDevices, setAvailableDevices] = useState<{
    audioInputs: MediaDeviceInfo[];
    videoInputs: MediaDeviceInfo[];
    audioOutputs: MediaDeviceInfo[];
  }>({
    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],
  });
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ringingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const isSettingRemoteDescriptionRef = useRef<boolean>(false);
  const makingOfferRef = useRef<boolean>(false);
  const ignoreOfferRef = useRef<boolean>(false);
  const iceRestartAttemptsRef = useRef<number>(0);
  const isPoliteRef = useRef<boolean>(false);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevStatsSnapshotRef = useRef<RawStatsSnapshot | null>(null);
  const adaptationManagerRef = useRef<AdaptationManager>(new AdaptationManager());

  // Clear any active reconnect timer
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Helper to drain and apply queued candidates in arrival order
  const drainPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (pendingCandidatesRef.current.length === 0) return;
    const candidates = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];
    for (const cand of candidates) {
      try {
        if (cand && (cand.candidate || cand.sdpMid !== undefined)) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      } catch (e) {
        console.debug('Failed to add queued candidate:', e);
      }
    }
  }, []);

  // Attach track ended listeners to detect device disconnects (e.g. unplugging webcam/mic)
  const attachTrackEndedListeners = useCallback(
    (stream: MediaStream) => {
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          console.warn(`Local track ended (${track.kind}) - hardware device removed`);
          if (track.kind === 'video') {
            setIsVideoOff(true);
          }
        };
      });
    },
    [setIsVideoOff]
  );

  // Cleanup helper
  const cleanupMediaAndPeer = useCallback(() => {
    stopCallSounds();
    clearReconnectTimer();

    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    prevStatsSnapshotRef.current = null;
    adaptationManagerRef.current.reset();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      remoteStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      screenStreamRef.current = null;
    }

    if (originalCameraTrackRef.current) {
      try {
        originalCameraTrackRef.current.stop();
      } catch {}
      originalCameraTrackRef.current = null;
    }

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onnegotiationneeded = null;
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    pendingCandidatesRef.current = [];
    isSettingRemoteDescriptionRef.current = false;
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    iceRestartAttemptsRef.current = 0;
  }, [clearReconnectTimer]);

  // Duration timer when connected
  useEffect(() => {
    if (callState === 'connected') {
      let seconds = 0;
      timerIntervalRef.current = setInterval(() => {
        seconds += 1;
        setDuration(seconds);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, [callState, setDuration]);

  // Stop stats polling
  const stopStatsMonitoring = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  }, []);

  // Poll RTCPeerConnection stats and execute adaptive media decisions
  const pollStats = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected')) {
      return;
    }

    try {
      const report = await pc.getStats();
      const { stats, snapshot } = extractRTCStats(report, prevStatsSnapshotRef.current);
      prevStatsSnapshotRef.current = snapshot;

      const currentCallType = useCallStore.getState().callType;
      const currentPref = useCallStore.getState().userQualityPreference;

      const decision = adaptationManagerRef.current.processStats(
        stats,
        currentCallType === 'video',
        currentPref
      );

      setNetworkQuality(decision.quality, stats);
      setIsAudioOnlyDegraded(decision.isAudioOnlyDegraded);

      // Handle video fallback to audio-only if critical
      if (decision.shouldDegradeToAudioOnly) {
        console.warn('Network critically congested: degrading video to audio-only');
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((track) => {
            track.enabled = false;
          });
        }
      }

      // Handle restoring video when network recovers
      if (decision.shouldRestoreVideo) {
        console.info('Network recovered: restoring video track');
        if (!useCallStore.getState().isVideoOff && localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((track) => {
            track.enabled = true;
          });
        }
      }

      // Dynamically apply bitrate / resolution scaling on sender
      if (decision.shouldAdjustSender) {
        const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await applyAdaptiveBitrate(videoSender, decision.quality, currentPref);
        }
      }
    } catch (err) {
      console.debug('Failed to query WebRTC stats:', err);
    }
  }, [setNetworkQuality, setIsAudioOnlyDegraded]);

  // Start stats monitoring with specified interval
  const startStatsMonitoring = useCallback(
    (intervalMs = 2000) => {
      stopStatsMonitoring();
      statsIntervalRef.current = setInterval(pollStats, intervalMs);
    },
    [stopStatsMonitoring, pollStats]
  );

  // Monitor network quality and stats during connected calls
  useEffect(() => {
    if (callState === 'connected') {
      const initialInterval = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 5000 : 2000;
      startStatsMonitoring(initialInterval);
    } else {
      stopStatsMonitoring();
    }
  }, [callState, startStatsMonitoring, stopStatsMonitoring]);

  // Throttle polling in background tabs
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (useCallStore.getState().callState !== 'connected') return;
      if (document.visibilityState === 'hidden') {
        startStatsMonitoring(5000);
      } else {
        startStatsMonitoring(2000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startStatsMonitoring]);

  // Dynamic quality preference handler
  const handleChangeQualityPreference = useCallback(
    async (pref: QualityPreference) => {
      setUserQualityPreference(pref);
      const pc = peerConnectionRef.current;
      if (pc) {
        const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await applyAdaptiveBitrate(videoSender, adaptationManagerRef.current.getCurrentQuality(), pref);
        }
      }
    },
    [setUserQualityPreference]
  );

  // Pre-warm ICE server credentials when authenticated user mounts
  useEffect(() => {
    if (user?.id) {
      callService.getIceServers().catch(() => {});
    }
  }, [user?.id]);

  // One-time user interaction listener to unlock Web Audio context
  useEffect(() => {
    const cleanupAutoplayUnlock = setupAutoplayUnlock();
    return () => {
      cleanupAutoplayUnlock();
    };
  }, []);

  // Enumerate connected audio/video hardware devices
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableDevices({
        audioInputs: devices.filter((d) => d.kind === 'audioinput'),
        videoInputs: devices.filter((d) => d.kind === 'videoinput'),
        audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
      });
    } catch (err) {
      console.warn('Failed to enumerate media devices:', err);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Listen for audio/video hardware device changes (unplugging/plugging headset or webcam)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return;

    const handleDeviceChange = async () => {
      refreshDevices();
      if (localStreamRef.current) {
        const videoTracks = localStreamRef.current.getVideoTracks();
        if (videoTracks.some((t) => t.readyState === 'ended')) {
          console.warn('Active video track ended due to device disconnection');
          setIsVideoOff(true);
        }
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [setIsVideoOff, refreshDevices]);

  // Handle browser tab visibility changes without dropping active calls
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const audioEl = document.querySelector('audio[data-remote-call-audio="true"]') as HTMLAudioElement | null;
        if (audioEl && remoteStreamRef.current && (callState === 'connected' || callState === 'reconnecting')) {
          audioEl.play().catch(() => {});
        }
        const pc = peerConnectionRef.current;
        if (pc) {
          setConnectionStates(pc.connectionState, pc.iceConnectionState);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [callState, setConnectionStates]);

  // End active call helper
  const handleEndCall = useCallback(
    (notifyServer = true, reason = 'ended') => {
      stopCallSounds();
      playCallEndSound();
      clearReconnectTimer();

      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }

      const currentPartner = useCallStore.getState().partner;
      const currentConvId = useCallStore.getState().conversationId;
      const currentCallId = useCallStore.getState().callId;
      const previousState = useCallStore.getState().callState;
      const currentDuration = useCallStore.getState().duration;

      setEnding(reason);

      if (notifyServer && currentPartner) {
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('call:end', {
            callId: currentCallId,
            targetUserId: currentPartner.id,
            conversationId: currentConvId,
            reason,
          });
        }
      }

      cleanupMediaAndPeer();
      setEnded(reason);

      const shouldPromptRating =
        currentCallId &&
        (previousState === 'connected' || currentDuration >= 3) &&
        reason !== 'cancelled';

      setTimeout(() => {
        resetCall();
        if (shouldPromptRating && currentCallId) {
          useCallStore.getState().openRatingModal(currentCallId);
        }
      }, 1000);
    },
    [cleanupMediaAndPeer, clearReconnectTimer, resetCall, setEnding, setEnded]
  );

  // Create & setup RTCPeerConnection with strict state event binding & Perfect Negotiation
  const setupPeerConnection = useCallback(
    (
      targetUserId: string,
      customIceServers?: RTCIceServer[],
      onRemoteStreamAttached?: (stream: MediaStream) => void
    ) => {
      // Deterministic politeness based on stable user ID comparison
      if (user?.id && targetUserId) {
        isPoliteRef.current = user.id.localeCompare(targetUserId) < 0;
      }

      // Rule: Prevent multiple peer connections for the same call
      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.onconnectionstatechange = null;
          peerConnectionRef.current.oniceconnectionstatechange = null;
          peerConnectionRef.current.onicecandidate = null;
          peerConnectionRef.current.ontrack = null;
          peerConnectionRef.current.onnegotiationneeded = null;
          peerConnectionRef.current.close();
        } catch {}
        peerConnectionRef.current = null;
      }

      const iceServers = customIceServers || callService.getCachedIceServers();
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
      });
      peerConnectionRef.current = pc;

      // Controlled ICE restart trigger
      const triggerIceRestart = async () => {
        if (!peerConnectionRef.current || peerConnectionRef.current.connectionState === 'closed') {
          return;
        }

        if (iceRestartAttemptsRef.current >= 3) {
          console.warn('Max ICE restart attempts (3) reached. Awaiting network grace timeout...');
          return;
        }

        iceRestartAttemptsRef.current += 1;
        console.log(`Initiating WebRTC ICE restart (attempt ${iceRestartAttemptsRef.current}/3)...`);

        try {
          if (typeof peerConnectionRef.current.restartIce === 'function') {
            peerConnectionRef.current.restartIce();
          }

          // Impolite peer proactively negotiates the ICE restart offer
          const currentCallId = useCallStore.getState().callId;
          if (!isPoliteRef.current && currentCallId && peerConnectionRef.current.signalingState === 'stable') {
            makingOfferRef.current = true;
            const offer = await peerConnectionRef.current.createOffer({ iceRestart: true });
            await peerConnectionRef.current.setLocalDescription(offer);
            const socket = getSocket();
            if (socket && socket.connected) {
              socket.emit('webrtc:offer', {
                callId: currentCallId,
                targetUserId,
                sdp: offer,
              });
            }
          }
        } catch (err) {
          console.warn('Error during ICE restart attempt:', err);
        } finally {
          makingOfferRef.current = false;
        }
      };

      // Forward local ICE candidate to peer
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('webrtc:ice-candidate', {
              callId: useCallStore.getState().callId,
              targetUserId,
              candidate: event.candidate.toJSON(),
            });
          }
        }
      };

      // Remote track arrived
      pc.ontrack = (event) => {
        let stream = event.streams && event.streams[0] ? event.streams[0] : remoteStreamRef.current;
        if (!stream) {
          stream = new MediaStream();
        }
        if (!stream.getTracks().some((t) => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        remoteStreamRef.current = stream;
        setRemoteStream(stream);

        if (onRemoteStreamAttached) {
          onRemoteStreamAttached(stream);
        }
      };

      // Perfect Negotiation: Renegotiation on track modifications or ICE restarts
      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('webrtc:offer', {
              callId: useCallStore.getState().callId,
              targetUserId,
              sdp: offer,
            });
          }
        } catch (err) {
          console.error('Error in onnegotiationneeded:', err);
        } finally {
          makingOfferRef.current = false;
        }
      };

      // Peer Connection State Change: Single Authoritative Truth
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        const iceState = pc.iceConnectionState;
        setConnectionStates(state, iceState);

        if (state === 'connected') {
          // Rule 10: Call only enters connected when WebRTC connection is verified
          clearReconnectTimer();
          iceRestartAttemptsRef.current = 0;
          if (useCallStore.getState().callState !== 'connected') {
            stopCallSounds();
            playCallConnectedSound();
            setConnected();
          }
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('call:connected', { callId: useCallStore.getState().callId });
          }
        } else if (state === 'connecting') {
          setConnecting();
        } else if (state === 'disconnected') {
          // Rule 11: Do NOT terminate immediately on temporary disconnect!
          setReconnecting('Connection interrupted. Attempting to recover...');
          playReconnectingSound();
          if (!reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== 'connected') {
                handleEndCall(false, 'Connection timeout after network loss');
              }
            }, 15000);
          }
          triggerIceRestart();
        } else if (state === 'failed') {
          if (iceRestartAttemptsRef.current < 3) {
            setReconnecting('Media link failed. Re-establishing route...');
            triggerIceRestart();
          } else {
            handleEndCall(false, 'Media connection failed');
          }
        } else if (state === 'closed') {
          cleanupMediaAndPeer();
        }
      };

      // ICE Connection State Change
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        const state = pc.connectionState;
        setConnectionStates(state, iceState);

        if (iceState === 'connected' || iceState === 'completed') {
          clearReconnectTimer();
          iceRestartAttemptsRef.current = 0;
          if (useCallStore.getState().callState !== 'connected' && state !== 'failed') {
            stopCallSounds();
            playCallConnectedSound();
            setConnected();
          }
        } else if (iceState === 'disconnected') {
          setReconnecting('Network route degraded. Reconnecting...');
          playReconnectingSound();
          if (!reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              if (
                peerConnectionRef.current &&
                peerConnectionRef.current.iceConnectionState !== 'connected' &&
                peerConnectionRef.current.iceConnectionState !== 'completed'
              ) {
                handleEndCall(false, 'ICE connection timeout');
              }
            }, 15000);
          }
          triggerIceRestart();
        } else if (iceState === 'failed') {
          if (iceRestartAttemptsRef.current < 3) {
            setReconnecting('Candidate negotiation failed. Re-initiating ICE...');
            triggerIceRestart();
          } else {
            handleEndCall(false, 'ICE candidate negotiation failed');
          }
        }
      };

      return pc;
    },
    [user?.id, clearReconnectTimer, setConnected, setConnecting, setReconnecting, setConnectionStates, handleEndCall, cleanupMediaAndPeer]
  );

  // 1. Initiate outgoing call
  const handleStartCall = useCallback(
    async (targetPartner: CallPartner, targetConversationId: string, type: CallType) => {
      if (!user) return;
      cleanupMediaAndPeer();
      unlockAudioMedia();

      try {
        const audioEl = document.querySelector('audio[data-remote-call-audio="true"]') as HTMLAudioElement | null;
        if (audioEl) {
          audioEl.play().catch(() => {});
        }
      } catch {}

      const socket = getSocket();
      if (!socket || !socket.connected) {
        stopCallSounds();
        setFailed('Cannot initiate call. Real-time connection is offline.');
        setTimeout(() => resetCall(), 2500);
        return;
      }

      setInitiating(targetPartner, targetConversationId, type);
      callService.getIceServers().catch(() => {});

      // Pre-acquire local audio/video hardware stream
      let stream: MediaStream;
      try {
        stream = await acquireUserMedia(type);
        localStreamRef.current = stream;
        attachTrackEndedListeners(stream);
        setLocalStream(stream);
      } catch (err: any) {
        stopCallSounds();
        setFailed(
          err.name === 'NotAllowedError'
            ? 'Microphone/Camera permission denied. Please allow device access in browser settings.'
            : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
            ? 'Audio/Video hardware device not found.'
            : 'Could not access audio/video hardware.'
        );
        setTimeout(() => resetCall(), 3000);
        return;
      }

      setRinging();
      startOutgoingRinging();

      // Auto-cancel if recipient doesn't answer after 15 seconds
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = setTimeout(() => {
        stopCallSounds();
        playCallEndSound();
        setEnded('No answer (15s timeout).');
        handleEndCall(true, 'timeout');
      }, 15000);

      socket.emit(
        'call:initiate',
        {
          recipientId: targetPartner.id,
          conversationId: targetConversationId,
          callType: type,
          caller: {
            id: user.id,
            name: user.name || user.username,
            avatar: user.avatar,
            username: user.username,
          },
        },
        (response: { success: boolean; callId?: string; reason?: string; error?: string }) => {
          if (!response?.success) {
            stopCallSounds();
            playCallEndSound();
            if (ringingTimeoutRef.current) {
              clearTimeout(ringingTimeoutRef.current);
              ringingTimeoutRef.current = null;
            }
            const failReason =
              response?.reason === 'offline'
                ? `${targetPartner.name} is currently offline.`
                : response?.reason === 'busy'
                ? `${targetPartner.name} is on another call.`
                : response?.error || 'Could not connect call.';
            setFailed(failReason);
            cleanupMediaAndPeer();
            setTimeout(() => resetCall(), 2500);
          } else if (response.callId) {
            useCallStore.setState({ callId: response.callId });
          }
        }
      );
    },
    [user, attachTrackEndedListeners, cleanupMediaAndPeer, setInitiating, setRinging, setFailed, setEnded, resetCall, handleEndCall]
  );

  // 2. Accept incoming call
  const handleAcceptCall = useCallback(async () => {
    stopCallSounds();
    unlockAudioMedia();
    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    const currentCallState = useCallStore.getState().callState;
    // Prevent duplicate answers
    if (currentCallState !== 'incoming') {
      return;
    }

    const currentPartner = useCallStore.getState().partner;
    const currentConvId = useCallStore.getState().conversationId;
    const currentCallType = useCallStore.getState().callType;
    const currentCallId = useCallStore.getState().callId;
    if (!currentPartner) return;

    setAccepting();

    try {
      const stream = await acquireUserMedia(currentCallType);
      localStreamRef.current = stream;
      attachTrackEndedListeners(stream);
      setLocalStream(stream);

      // Transition to connecting while negotiating WebRTC
      setConnecting();

      const iceServers = await callService.getIceServers();
      const pc = setupPeerConnection(currentPartner.id, iceServers);
      stream.getTracks().forEach((track) => {
        track.enabled = true;
        pc.addTrack(track, stream);
      });

      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('call:answer', {
          callId: currentCallId,
          callerId: currentPartner.id,
          conversationId: currentConvId,
          callType: currentCallType,
        });
      }
    } catch (err: any) {
      setFailed(
        err.name === 'NotAllowedError'
          ? 'Microphone/Camera permission denied. Please allow device access in browser settings.'
          : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
          ? 'Audio/Video hardware device not found.'
          : 'Could not access audio/video hardware.'
      );
      handleEndCall(true, 'hardware_error');
    }
  }, [setupPeerConnection, attachTrackEndedListeners, setAccepting, setConnecting, setFailed, handleEndCall]);

  // 3. Reject incoming call
  const handleRejectCall = useCallback(() => {
    stopCallSounds();
    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }
    const currentPartner = useCallStore.getState().partner;
    const currentCallId = useCallStore.getState().callId;
    if (currentPartner) {
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('call:reject', {
          callId: currentCallId,
          callerId: currentPartner.id,
          reason: 'declined',
        });
      }
    }
    setEnded('Call declined');
    cleanupMediaAndPeer();
    setTimeout(() => {
      resetCall();
    }, 800);
  }, [cleanupMediaAndPeer, resetCall, setEnded]);

  // 4. Toggle Microphone
  const handleToggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !audioTracks[0].enabled;
        audioTracks.forEach((t) => (t.enabled = nextState));
        setIsMuted(!nextState);
      }
    }
  }, [setIsMuted]);

  // 5. Toggle Camera (Video)
  const handleToggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !videoTracks[0].enabled;
        videoTracks.forEach((t) => (t.enabled = nextState));
        setIsVideoOff(!nextState);
      }
    }
  }, [setIsVideoOff]);

  // 6. Switch Audio Input (Microphone)
  const handleSwitchAudioInput = useCallback(
    async (deviceId: string) => {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        const newTrack = newStream.getAudioTracks()[0];
        if (!newTrack) return;

        if (localStreamRef.current) {
          const oldTrack = localStreamRef.current.getAudioTracks()[0];
          if (oldTrack) {
            localStreamRef.current.removeTrack(oldTrack);
            oldTrack.stop();
          }
          localStreamRef.current.addTrack(newTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }

        const pc = peerConnectionRef.current;
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) {
            await sender.replaceTrack(newTrack);
          }
        }
        setSelectedAudioInput(deviceId);
      } catch (err) {
        console.error('Failed to switch audio input device:', err);
      }
    },
    [setSelectedAudioInput]
  );

  // 7. Switch Video Input (Camera)
  const handleSwitchVideoInput = useCallback(
    async (deviceId: string) => {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        const newTrack = newStream.getVideoTracks()[0];
        if (!newTrack) return;

        if (localStreamRef.current) {
          const oldTrack = localStreamRef.current.getVideoTracks()[0];
          if (oldTrack) {
            localStreamRef.current.removeTrack(oldTrack);
            oldTrack.stop();
          }
          localStreamRef.current.addTrack(newTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }

        const pc = peerConnectionRef.current;
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(newTrack);
          }
        }
        setSelectedVideoInput(deviceId);
      } catch (err) {
        console.error('Failed to switch video input device:', err);
      }
    },
    [setSelectedVideoInput]
  );

  // 8. Switch Audio Output (Speaker / Headphones) via setSinkId
  const handleSwitchAudioOutput = useCallback(
    async (deviceId: string) => {
      try {
        const audioEl = document.querySelector(
          'audio[data-remote-call-audio="true"]'
        ) as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
        if (audioEl && typeof audioEl.setSinkId === 'function') {
          await audioEl.setSinkId(deviceId);
          setSelectedAudioOutput(deviceId);
          return true;
        }
        return false;
      } catch (err) {
        console.warn('Browser failed to switch audio output device:', err);
        return false;
      }
    },
    [setSelectedAudioOutput]
  );

  // 9. Stop Screen Share
  const handleStopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    const cameraTrack = originalCameraTrackRef.current;
    if (cameraTrack && localStreamRef.current) {
      const pc = peerConnectionRef.current;
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(cameraTrack);
        }
      }
      localStreamRef.current.addTrack(cameraTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    }
    originalCameraTrackRef.current = null;
    setIsScreenSharing(false);
  }, [setIsScreenSharing]);

  // 10. Start Screen Share
  const handleStartScreenShare = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      console.warn('Screen sharing not supported on this platform');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrack.onended = () => {
        handleStopScreenShare();
      };

      if (localStreamRef.current) {
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) {
          originalCameraTrackRef.current = oldVideoTrack;
          localStreamRef.current.removeTrack(oldVideoTrack);
        }
        localStreamRef.current.addTrack(screenTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      const pc = peerConnectionRef.current;
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else if (localStreamRef.current) {
          pc.addTrack(screenTrack, localStreamRef.current);
        }
      }

      setIsScreenSharing(true);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        console.error('Failed to start screen share:', err);
      }
    }
  }, [handleStopScreenShare, setIsScreenSharing]);

  // 11. Toggle Screen Share
  const handleToggleScreenShare = useCallback(async () => {
    if (useCallStore.getState().isScreenSharing) {
      await handleStopScreenShare();
    } else {
      await handleStartScreenShare();
    }
  }, [handleStartScreenShare, handleStopScreenShare]);

  // Socket signaling listeners - authoritative lifecycle
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // A. Incoming call offer from another user
    const onCallIncoming = (data: {
      callId?: string;
      callerId: string;
      caller: CallPartner;
      conversationId: string;
      callType: CallType;
    }) => {
      const currentCallState = useCallStore.getState().callState;
      const currentPartner = useCallStore.getState().partner;

      // Glare handling: Both users call each other simultaneously
      if (
        (currentCallState === 'initiating' || currentCallState === 'ringing') &&
        currentPartner?.id === data.callerId &&
        user
      ) {
        // Deterministic tie-break based on user IDs
        if (user.id.localeCompare(data.callerId) > 0) {
          // Current user takes caller role; ignore incoming invite
          return;
        } else {
          // Remote user takes caller role; drop our outgoing call and accept incoming invite
          stopCallSounds();
          if (ringingTimeoutRef.current) {
            clearTimeout(ringingTimeoutRef.current);
            ringingTimeoutRef.current = null;
          }
        }
      } else if (currentCallState !== 'idle') {
        // User is busy in another call
        socket.emit('call:reject', {
          callId: data.callId,
          callerId: data.callerId,
          reason: 'busy',
        });
        return;
      }

      setIncoming(data.caller, data.conversationId, data.callType, data.callId);
      startIncomingRinging();

      // Auto-dismiss incoming call after 15 seconds
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = setTimeout(() => {
        stopCallSounds();
        setEnded('Missed call');
        setTimeout(() => resetCall(), 1000);
      }, 15000);
    };

    // B. Recipient accepted our call -> Caller creates WebRTC Offer
    const onCallAccepted = async (data: { callId?: string; recipientId: string; callType: CallType }) => {
      stopCallSounds();
      unlockAudioMedia();
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }

      // Caller enters connecting state while negotiating WebRTC
      setConnecting();
      if (data.callId) {
        useCallStore.setState({ callId: data.callId });
      }

      try {
        let stream = localStreamRef.current;
        if (!stream || stream.getTracks().length === 0) {
          stream = await acquireUserMedia(data.callType);
          localStreamRef.current = stream;
          attachTrackEndedListeners(stream);
          setLocalStream(stream);
        }

        const iceServers = await callService.getIceServers();
        const pc = setupPeerConnection(data.recipientId, iceServers);
        stream.getTracks().forEach((track) => {
          track.enabled = true;
          pc.addTrack(track, stream!);
        });

        // Create and send WebRTC offer
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: data.callType === 'video',
        });
        await pc.setLocalDescription(offer);

        socket.emit('webrtc:offer', {
          callId: data.callId,
          targetUserId: data.recipientId,
          sdp: offer,
        });
      } catch (err: any) {
        setFailed(
          err.name === 'NotAllowedError'
            ? 'Camera/Microphone permission denied.'
            : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
            ? 'Audio/Video hardware device not found.'
            : 'Hardware access error.'
        );
        handleEndCall(true, 'hardware_error');
      }
    };

    // C. Incoming WebRTC Offer (recipient receives offer and creates answer, or renegotiation)
    const onWebRTCOffer = async (data: { callId?: string; senderId: string; sdp: RTCSessionDescriptionInit }) => {
      let pc = peerConnectionRef.current;
      if (!pc) {
        const iceServers = await callService.getIceServers();
        pc = setupPeerConnection(data.senderId, iceServers);
      }

      // Perfect Negotiation collision detection
      const offerCollision =
        data.sdp.type === 'offer' &&
        (makingOfferRef.current || pc.signalingState !== 'stable');

      ignoreOfferRef.current = !isPoliteRef.current && offerCollision;
      if (ignoreOfferRef.current) {
        console.warn('Impolite peer: ignored colliding offer');
        return;
      }

      if (offerCollision && isPoliteRef.current) {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (e) {
          console.warn('Rollback failed on polite peer:', e);
        }
      }

      // Ensure local tracks are attached before answering
      let stream = localStreamRef.current;
      if (!stream || stream.getTracks().length === 0) {
        const currentCallType = useCallStore.getState().callType;
        try {
          stream = await acquireUserMedia(currentCallType);
          localStreamRef.current = stream;
          attachTrackEndedListeners(stream);
          setLocalStream(stream);
        } catch (err) {
          console.warn('Could not acquire local stream before answering WebRTC offer:', err);
        }
      }

      if (stream) {
        const senders = pc.getSenders();
        stream.getTracks().forEach((track) => {
          track.enabled = true;
          const exists = senders.some((s) => s.track?.id === track.id);
          if (!exists) {
            pc!.addTrack(track, stream!);
          }
        });
      }

      try {
        isSettingRemoteDescriptionRef.current = true;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        isSettingRemoteDescriptionRef.current = false;

        // Drain any pending ICE candidates received before remote description
        await drainPendingCandidates(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc:answer', {
          callId: data.callId,
          targetUserId: data.senderId,
          sdp: answer,
        });
      } catch (err) {
        isSettingRemoteDescriptionRef.current = false;
        console.error('Error answering WebRTC offer:', err);
      }
    };

    // D. Incoming WebRTC Answer (caller receives answer from recipient)
    const onWebRTCAnswer = async (data: { callId?: string; senderId: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      if (pc.signalingState !== 'have-local-offer') {
        console.warn(`Ignoring answer received in unexpected signalingState: ${pc.signalingState}`);
        return;
      }

      try {
        isSettingRemoteDescriptionRef.current = true;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        isSettingRemoteDescriptionRef.current = false;

        // Drain any pending ICE candidates received before remote description
        await drainPendingCandidates(pc);
      } catch (err) {
        isSettingRemoteDescriptionRef.current = false;
        console.error('Error applying WebRTC answer:', err);
      }
    };

    // E. Incoming ICE Candidate
    const onWebRTCIceCandidate = async (data: {
      callId?: string;
      senderId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const pc = peerConnectionRef.current;
      if (
        pc &&
        pc.remoteDescription &&
        pc.remoteDescription.type &&
        !isSettingRemoteDescriptionRef.current
      ) {
        try {
          if (data.candidate && (data.candidate.candidate || data.candidate.sdpMid !== undefined)) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        } catch (e) {
          console.debug('Error adding incoming ICE candidate:', e);
        }
      } else {
        pendingCandidatesRef.current.push(data.candidate);
      }
    };

    // F. Call Rejected by recipient
    const onCallRejected = (data: { callId?: string; recipientId: string; reason: string }) => {
      stopCallSounds();
      if (data.reason === 'busy') {
        playBusySound();
      } else {
        playCallEndSound();
      }
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }
      const reasonMsg =
        data.reason === 'busy'
          ? 'User is currently on another call.'
          : 'Call was declined.';
      setFailed(reasonMsg);
      setTimeout(() => {
        cleanupMediaAndPeer();
        resetCall();
      }, 2500);
    };

    // G. Call Ended by other user or timed out
    const onCallEnded = (data?: { callId?: string; reason?: string }) => {
      const endMsg =
        data?.reason === 'timeout' || data?.reason === 'no_answer'
          ? 'No answer (15s timeout).'
          : 'Call ended by remote user.';
      setEnded(endMsg);
      handleEndCall(false, data?.reason || 'remote_ended');
    };

    // H. Multi-device sync: Call answered elsewhere
    const onCallAnsweredElsewhere = () => {
      stopCallSounds();
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }
      resetCall();
    };

    // I. Multi-device sync: Call declined elsewhere
    const onCallRejectedElsewhere = () => {
      stopCallSounds();
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }
      resetCall();
    };

    socket.on('call:incoming', onCallIncoming);
    socket.on('call:accepted', onCallAccepted);
    socket.on('webrtc:offer', onWebRTCOffer);
    socket.on('webrtc:answer', onWebRTCAnswer);
    socket.on('webrtc:ice-candidate', onWebRTCIceCandidate);
    socket.on('call:rejected', onCallRejected);
    socket.on('call:ended', onCallEnded);
    socket.on('call:answered-elsewhere', onCallAnsweredElsewhere);
    socket.on('call:rejected-elsewhere', onCallRejectedElsewhere);

    return () => {
      socket.off('call:incoming', onCallIncoming);
      socket.off('call:accepted', onCallAccepted);
      socket.off('webrtc:offer', onWebRTCOffer);
      socket.off('webrtc:answer', onWebRTCAnswer);
      socket.off('webrtc:ice-candidate', onWebRTCIceCandidate);
      socket.off('call:rejected', onCallRejected);
      socket.off('call:ended', onCallEnded);
      socket.off('call:answered-elsewhere', onCallAnsweredElsewhere);
      socket.off('call:rejected-elsewhere', onCallRejectedElsewhere);
    };
  }, [
    user,
    setIncoming,
    setConnecting,
    setFailed,
    setEnded,
    setupPeerConnection,
    attachTrackEndedListeners,
    drainPendingCandidates,
    handleEndCall,
    cleanupMediaAndPeer,
    resetCall,
  ]);

  return {
    callState,
    callType,
    partner,
    conversationId,
    callId,
    isMuted,
    isVideoOff,
    isMinimized,
    isScreenSharing,
    pipPosition,
    isLocalFlipped,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    formattedDuration,
    error,
    endReason,
    reconnectReason,
    peerConnectionState,
    iceConnectionState,
    localStream,
    remoteStream,
    availableDevices,
    startCall: handleStartCall,
    acceptCall: handleAcceptCall,
    rejectCall: handleRejectCall,
    endCall: handleEndCall,
    toggleMute: handleToggleMute,
    toggleVideo: handleToggleVideo,
    setIsMinimized,
    toggleMinimized,
    toggleScreenShare: handleToggleScreenShare,
    setPipPosition,
    setIsLocalFlipped,
    toggleLocalFlipped,
    refreshDevices,
    switchAudioInput: handleSwitchAudioInput,
    switchVideoInput: handleSwitchVideoInput,
    switchAudioOutput: handleSwitchAudioOutput,
    networkQuality,
    qualityStats,
    isAudioOnlyDegraded,
    userQualityPreference,
    changeQualityPreference: handleChangeQualityPreference,
    isBackgroundBlurred,
    toggleBackgroundBlur,
    isRatingModalOpen,
    openRatingModal,
    closeRatingModal,
    submitCallRating: callService.submitCallRating,
  };
}
