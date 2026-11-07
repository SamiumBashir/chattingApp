'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useCallStore, CallPartner, CallType } from '@/store/callStore';
import {
  startOutgoingRinging,
  startIncomingRinging,
  playCallEndSound,
  stopCallSounds,
} from '@/lib/callSounds';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTC() {
  const { user } = useAuthStore();
  const {
    callState,
    callType,
    partner,
    conversationId,
    isMuted,
    isVideoOff,
    formattedDuration,
    error,
    startOutgoingCall,
    setIncomingCall,
    setConnected,
    setDuration,
    setIsMuted,
    setIsVideoOff,
    setError,
    resetCall,
  } = useCallStore();

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ringingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Cleanup helper
  const cleanupMediaAndPeer = useCallback(() => {
    stopCallSounds();

    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    pendingCandidatesRef.current = [];
  }, []);

  // Timer counter when connected
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

  // End active call helper
  const handleEndCall = useCallback(
    (notifyServer = true) => {
      stopCallSounds();
      playCallEndSound();

      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }

      const currentPartner = useCallStore.getState().partner;
      const currentConvId = useCallStore.getState().conversationId;

      if (notifyServer && currentPartner) {
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('call:end', {
            targetUserId: currentPartner.id,
            conversationId: currentConvId,
          });
        }
      }

      cleanupMediaAndPeer();
      resetCall();
    },
    [cleanupMediaAndPeer, resetCall]
  );

  // Create & setup RTCPeerConnection
  const setupPeerConnection = useCallback(
    (targetUserId: string, onRemoteStreamAttached?: (stream: MediaStream) => void) => {
      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.close();
        } catch {}
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      // ICE candidates generated locally -> forward to target
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('webrtc:ice-candidate', {
              targetUserId,
              candidate: event.candidate.toJSON(),
            });
          }
        }
      };

      // Remote stream track arrived
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          if (onRemoteStreamAttached) {
            onRemoteStreamAttached(event.streams[0]);
          }
        } else if (event.track) {
          // Fallback if event.streams is not populated
          setRemoteStream((prev) => {
            const stream = prev || new MediaStream();
            stream.addTrack(event.track);
            if (onRemoteStreamAttached) {
              onRemoteStreamAttached(stream);
            }
            return new MediaStream(stream.getTracks());
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          handleEndCall(false);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          handleEndCall(false);
        }
      };

      return pc;
    },
    [handleEndCall]
  );

  // 1. Initiate outgoing call
  const handleStartCall = useCallback(
    async (targetPartner: CallPartner, targetConversationId: string, type: CallType) => {
      if (!user) return;
      cleanupMediaAndPeer();

      const socket = getSocket();
      if (!socket || !socket.connected) {
        stopCallSounds();
        setError('Cannot initiate call. Real-time connection is offline.');
        setTimeout(() => resetCall(), 2500);
        return;
      }

      // Pre-acquire local audio/video hardware stream
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video',
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err: any) {
        stopCallSounds();
        setError(
          err.name === 'NotAllowedError'
            ? 'Microphone/Camera permission denied. Please allow device access.'
            : 'Could not access audio/video hardware.'
        );
        setTimeout(() => resetCall(), 3000);
        return;
      }

      startOutgoingCall(targetPartner, targetConversationId, type);
      startOutgoingRinging();

      // Auto-cancel if recipient doesn't answer after 15 seconds
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = setTimeout(() => {
        stopCallSounds();
        playCallEndSound();
        setError('No answer (15s timeout).');
        handleEndCall(true);
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
        (response: { success: boolean; reason?: string; error?: string }) => {
          if (!response?.success) {
            stopCallSounds();
            playCallEndSound();
            if (ringingTimeoutRef.current) {
              clearTimeout(ringingTimeoutRef.current);
              ringingTimeoutRef.current = null;
            }
            setError(
              response?.reason === 'offline'
                ? `${targetPartner.name} is currently offline.`
                : response?.reason === 'busy'
                ? `${targetPartner.name} is on another call.`
                : response?.error || 'Could not connect call.'
            );
            cleanupMediaAndPeer();
            setTimeout(() => resetCall(), 2500);
          }
        }
      );
    },
    [user, startOutgoingCall, resetCall, setError, cleanupMediaAndPeer, handleEndCall]
  );

  // 2. Accept incoming call
  const handleAcceptCall = useCallback(async () => {
    stopCallSounds();
    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    const currentPartner = useCallStore.getState().partner;
    const currentConvId = useCallStore.getState().conversationId;
    const currentCallType = useCallStore.getState().callType;
    if (!currentPartner) return;

    try {
      // Get user audio/video permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: currentCallType === 'video',
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = setupPeerConnection(currentPartner.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Emit accepted
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('call:answer', {
          callerId: currentPartner.id,
          conversationId: currentConvId,
          callType: currentCallType,
        });
      }

      setConnected();
    } catch (err: any) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Microphone/Camera permission denied.'
          : 'Could not access audio/video hardware.'
      );
      handleEndCall(true);
    }
  }, [setupPeerConnection, setConnected, setError, handleEndCall]);

  // 3. Reject incoming call
  const handleRejectCall = useCallback(() => {
    stopCallSounds();
    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }
    const currentPartner = useCallStore.getState().partner;
    if (currentPartner) {
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('call:reject', {
          callerId: currentPartner.id,
          reason: 'declined',
        });
      }
    }
    cleanupMediaAndPeer();
    resetCall();
  }, [cleanupMediaAndPeer, resetCall]);

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

  // Socket signaling listeners - persistent lifecycle
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // A. Incoming call offer from another user
    const onCallIncoming = (data: {
      callerId: string;
      caller: CallPartner;
      conversationId: string;
      callType: CallType;
    }) => {
      const currentCallState = useCallStore.getState().callState;
      // If user is already in a call, reject as busy
      if (currentCallState !== 'idle') {
        socket.emit('call:reject', {
          callerId: data.callerId,
          reason: 'busy',
        });
        return;
      }

      setIncomingCall(data.caller, data.conversationId, data.callType);
      startIncomingRinging();

      // Auto-dismiss incoming call after 15 seconds
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = setTimeout(() => {
        stopCallSounds();
        resetCall();
      }, 15000);
    };

    // B. Recipient accepted our call -> Caller creates WebRTC Offer
    const onCallAccepted = async (data: { recipientId: string; callType: CallType }) => {
      stopCallSounds();
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }
      setConnected();

      try {
        let stream = localStreamRef.current;
        if (!stream || stream.getTracks().length === 0) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: data.callType === 'video',
          });
          localStreamRef.current = stream;
          setLocalStream(stream);
        }

        const pc = setupPeerConnection(data.recipientId);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Create and send WebRTC offer
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: data.callType === 'video',
        });
        await pc.setLocalDescription(offer);

        socket.emit('webrtc:offer', {
          targetUserId: data.recipientId,
          sdp: offer,
        });
      } catch (err: any) {
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera/Microphone permission denied.'
            : 'Hardware access error.'
        );
        handleEndCall(true);
      }
    };

    // C. Incoming WebRTC Offer (recipient receives offer and creates answer)
    const onWebRTCOffer = async (data: { senderId: string; sdp: RTCSessionDescriptionInit }) => {
      let pc = peerConnectionRef.current;
      if (!pc) {
        pc = setupPeerConnection(data.senderId);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Drain any pending ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          for (const cand of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.debug('Failed to add queued candidate:', e);
            }
          }
          pendingCandidatesRef.current = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc:answer', {
          targetUserId: data.senderId,
          sdp: answer,
        });
      } catch (err) {
        console.error('Error answering WebRTC offer:', err);
      }
    };

    // D. Incoming WebRTC Answer (caller receives answer from recipient)
    const onWebRTCAnswer = async (data: { senderId: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Drain any pending ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          for (const cand of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.debug('Failed to add queued candidate:', e);
            }
          }
          pendingCandidatesRef.current = [];
        }
      } catch (err) {
        console.error('Error applying WebRTC answer:', err);
      }
    };

    // E. Incoming ICE Candidate
    const onWebRTCIceCandidate = async (data: {
      senderId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const pc = peerConnectionRef.current;
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.debug('Error adding incoming ICE candidate:', e);
        }
      } else {
        pendingCandidatesRef.current.push(data.candidate);
      }
    };

    // F. Call Rejected by recipient
    const onCallRejected = (data: { recipientId: string; reason: string }) => {
      stopCallSounds();
      playCallEndSound();
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }
      setError(
        data.reason === 'busy'
          ? 'User is currently on another call.'
          : 'Call was declined.'
      );
      setTimeout(() => {
        cleanupMediaAndPeer();
        resetCall();
      }, 2500);
    };

    // G. Call Ended by other user or timed out
    const onCallEnded = (data?: { reason?: string }) => {
      if (data?.reason === 'timeout' || data?.reason === 'no_answer') {
        setError('No answer (15s timeout). Call ended.');
      }
      handleEndCall(false);
    };

    socket.on('call:incoming', onCallIncoming);
    socket.on('call:accepted', onCallAccepted);
    socket.on('webrtc:offer', onWebRTCOffer);
    socket.on('webrtc:answer', onWebRTCAnswer);
    socket.on('webrtc:ice-candidate', onWebRTCIceCandidate);
    socket.on('call:rejected', onCallRejected);
    socket.on('call:ended', onCallEnded);

    return () => {
      socket.off('call:incoming', onCallIncoming);
      socket.off('call:accepted', onCallAccepted);
      socket.off('webrtc:offer', onWebRTCOffer);
      socket.off('webrtc:answer', onWebRTCAnswer);
      socket.off('webrtc:ice-candidate', onWebRTCIceCandidate);
      socket.off('call:rejected', onCallRejected);
      socket.off('call:ended', onCallEnded);
    };
  }, [
    setIncomingCall,
    setConnected,
    setupPeerConnection,
    handleEndCall,
    setError,
    cleanupMediaAndPeer,
    resetCall,
  ]);

  return {
    callState,
    callType,
    partner,
    conversationId,
    isMuted,
    isVideoOff,
    formattedDuration,
    error,
    localStream,
    remoteStream,
    startCall: handleStartCall,
    acceptCall: handleAcceptCall,
    rejectCall: handleRejectCall,
    endCall: handleEndCall,
    toggleMute: handleToggleMute,
    toggleVideo: handleToggleVideo,
  };
}
