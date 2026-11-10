'use client';

import { create } from 'zustand';

export type CallState =
  | 'idle'
  | 'initiating'
  | 'ringing'
  | 'incoming'
  | 'accepting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ending'
  | 'ended'
  | 'failed';

export type CallType = 'audio' | 'video';

export interface CallPartner {
  id: string;
  name: string;
  username: string;
  avatar?: string;
}

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
  // TURN Relay & Cross-Network Diagnostics
  isRelay?: boolean;
  localCandidateType?: string;
  remoteCandidateType?: string;
  candidatePairState?: string;
  totalBytesSent?: number;
  totalBytesReceived?: number;
}

export type PipPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

interface CallStoreState {
  callState: CallState;
  callType: CallType;
  partner: CallPartner | null;
  conversationId: string | null;
  callId: string | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isMinimized: boolean;
  isScreenSharing: boolean;
  pipPosition: PipPosition;
  isLocalFlipped: boolean;
  selectedAudioInput: string | null;
  selectedAudioOutput: string | null;
  selectedVideoInput: string | null;
  duration: number;
  formattedDuration: string;
  error: string | null;
  endReason: string | null;
  reconnectReason: string | null;
  peerConnectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  networkQuality: NetworkQuality | null;
  qualityStats: QualityStats | null;
  isAudioOnlyDegraded: boolean;
  userQualityPreference: QualityPreference;
  isBackgroundBlurred: boolean;
  isRatingModalOpen: boolean;
  lastEndedCallId: string | null;
  iceTransportPolicy: 'all' | 'relay';

  // State Machine Actions
  setInitiating: (partner: CallPartner, conversationId: string, callType: CallType) => void;
  setRinging: () => void;
  setIncoming: (partner: CallPartner, conversationId: string, callType: CallType, callId?: string) => void;
  setAccepting: () => void;
  setConnecting: () => void;
  setConnected: () => void;
  setReconnecting: (reason?: string) => void;
  setEnding: (reason?: string) => void;
  setEnded: (reason?: string) => void;
  setFailed: (error: string) => void;
  setConnectionStates: (
    peerState: RTCPeerConnectionState | null,
    iceState: RTCIceConnectionState | null
  ) => void;

  // Backward compatibility actions
  setIncomingCall: (partner: CallPartner, conversationId: string, callType: CallType, callId?: string) => void;
  startOutgoingCall: (partner: CallPartner, conversationId: string, callType: CallType) => void;

  // Media & Controls
  setDuration: (duration: number) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  setIsMuted: (isMuted: boolean) => void;
  setIsVideoOff: (isVideoOff: boolean) => void;
  setIsMinimized: (isMinimized: boolean) => void;
  toggleMinimized: () => void;
  setIsScreenSharing: (isScreenSharing: boolean) => void;
  setPipPosition: (position: PipPosition) => void;
  setIsLocalFlipped: (isLocalFlipped: boolean) => void;
  toggleLocalFlipped: () => void;
  setSelectedAudioInput: (deviceId: string | null) => void;
  setSelectedAudioOutput: (deviceId: string | null) => void;
  setSelectedVideoInput: (deviceId: string | null) => void;
  setNetworkQuality: (quality: NetworkQuality | null, stats?: QualityStats | null) => void;
  setIsAudioOnlyDegraded: (degraded: boolean) => void;
  setUserQualityPreference: (preference: QualityPreference) => void;
  toggleBackgroundBlur: () => void;
  setIsBackgroundBlurred: (isBackgroundBlurred: boolean) => void;
  openRatingModal: (callId: string) => void;
  closeRatingModal: () => void;
  setIceTransportPolicy: (policy: 'all' | 'relay') => void;
  setError: (err: string | null) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  callState: 'idle',
  callType: 'audio',
  partner: null,
  conversationId: null,
  callId: null,
  isMuted: false,
  isVideoOff: false,
  isMinimized: false,
  isScreenSharing: false,
  pipPosition: 'top-right',
  isLocalFlipped: true,
  selectedAudioInput: null,
  selectedAudioOutput: null,
  selectedVideoInput: null,
  duration: 0,
  formattedDuration: '00:00',
  error: null,
  endReason: null,
  reconnectReason: null,
  peerConnectionState: null,
  iceConnectionState: null,
  networkQuality: null,
  qualityStats: null,
  isAudioOnlyDegraded: false,
  userQualityPreference: 'auto',
  isBackgroundBlurred: false,
  isRatingModalOpen: false,
  lastEndedCallId: null,
  iceTransportPolicy:
    typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_FORCE_TURN_RELAY === 'true' ||
      process.env.NEXT_PUBLIC_ICE_TRANSPORT_POLICY === 'relay')
      ? 'relay'
      : 'all',

  setInitiating: (partner, conversationId, callType) =>
    set({
      callState: 'initiating',
      partner,
      conversationId,
      callType,
      error: null,
      endReason: null,
      reconnectReason: null,
      duration: 0,
      formattedDuration: '00:00',
      isMuted: false,
      isVideoOff: false,
      isMinimized: false,
      isScreenSharing: false,
      peerConnectionState: null,
      iceConnectionState: null,
    }),

  setRinging: () =>
    set((state) => ({
      callState: state.callState === 'initiating' ? 'ringing' : state.callState,
      error: null,
    })),

  setIncoming: (partner, conversationId, callType, callId) =>
    set({
      callState: 'incoming',
      partner,
      conversationId,
      callId: callId || null,
      callType,
      error: null,
      endReason: null,
      reconnectReason: null,
      duration: 0,
      formattedDuration: '00:00',
      isMuted: false,
      isVideoOff: false,
      isMinimized: false,
      isScreenSharing: false,
      peerConnectionState: null,
      iceConnectionState: null,
    }),

  setAccepting: () =>
    set({
      callState: 'accepting',
      error: null,
    }),

  setConnecting: () =>
    set((state) => ({
      callState: 'connecting',
      error: null,
    })),

  setConnected: () =>
    set({
      callState: 'connected',
      error: null,
      reconnectReason: null,
    }),

  setReconnecting: (reason) =>
    set((state) => ({
      callState: state.callState === 'connected' ? 'reconnecting' : state.callState,
      reconnectReason: reason || 'Network connection temporarily lost. Reconnecting...',
    })),

  setEnding: (reason) =>
    set({
      callState: 'ending',
      endReason: reason || 'Ending call...',
    }),

  setEnded: (reason) =>
    set({
      callState: 'ended',
      endReason: reason || 'Call ended',
    }),

  setFailed: (error) =>
    set({
      callState: 'failed',
      error,
      endReason: error,
    }),

  setConnectionStates: (peerConnectionState, iceConnectionState) =>
    set({
      peerConnectionState,
      iceConnectionState,
    }),

  // Backward-compatible adapters
  setIncomingCall: (partner, conversationId, callType, callId) =>
    set({
      callState: 'incoming',
      partner,
      conversationId,
      callId: callId || null,
      callType,
      error: null,
      endReason: null,
      reconnectReason: null,
      duration: 0,
      formattedDuration: '00:00',
      isMuted: false,
      isVideoOff: false,
    }),

  startOutgoingCall: (partner, conversationId, callType) =>
    set({
      callState: 'ringing',
      partner,
      conversationId,
      callType,
      error: null,
      endReason: null,
      reconnectReason: null,
      duration: 0,
      formattedDuration: '00:00',
      isMuted: false,
      isVideoOff: false,
    }),

  setDuration: (duration) => {
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const formattedDuration = `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
    set({ duration, formattedDuration });
  },

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleVideo: () => set((state) => ({ isVideoOff: !state.isVideoOff })),
  setIsMuted: (isMuted) => set({ isMuted }),
  setIsVideoOff: (isVideoOff) => set({ isVideoOff }),
  setIsMinimized: (isMinimized) => set({ isMinimized }),
  toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  setIsScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  setPipPosition: (pipPosition) => set({ pipPosition }),
  setIsLocalFlipped: (isLocalFlipped) => set({ isLocalFlipped }),
  toggleLocalFlipped: () => set((state) => ({ isLocalFlipped: !state.isLocalFlipped })),
  setSelectedAudioInput: (selectedAudioInput) => set({ selectedAudioInput }),
  setSelectedAudioOutput: (selectedAudioOutput) => set({ selectedAudioOutput }),
  setSelectedVideoInput: (selectedVideoInput) => set({ selectedVideoInput }),
  setNetworkQuality: (networkQuality, qualityStats) =>
    set({ networkQuality, qualityStats: qualityStats ?? null }),
  setIsAudioOnlyDegraded: (isAudioOnlyDegraded) => set({ isAudioOnlyDegraded }),
  setUserQualityPreference: (userQualityPreference) => set({ userQualityPreference }),
  toggleBackgroundBlur: () => set((state) => ({ isBackgroundBlurred: !state.isBackgroundBlurred })),
  setIsBackgroundBlurred: (isBackgroundBlurred) => set({ isBackgroundBlurred }),
  openRatingModal: (lastEndedCallId) => set({ isRatingModalOpen: true, lastEndedCallId }),
  closeRatingModal: () => set({ isRatingModalOpen: false }),
  setIceTransportPolicy: (iceTransportPolicy) => set({ iceTransportPolicy }),
  setError: (error) => set({ error }),

  resetCall: () =>
    set({
      callState: 'idle',
      partner: null,
      conversationId: null,
      callId: null,
      isMuted: false,
      isVideoOff: false,
      isMinimized: false,
      isScreenSharing: false,
      pipPosition: 'top-right',
      isLocalFlipped: true,
      selectedAudioInput: null,
      selectedAudioOutput: null,
      selectedVideoInput: null,
      duration: 0,
      formattedDuration: '00:00',
      error: null,
      endReason: null,
      reconnectReason: null,
      peerConnectionState: null,
      iceConnectionState: null,
      networkQuality: null,
      qualityStats: null,
      isAudioOnlyDegraded: false,
      isRatingModalOpen: false,
      lastEndedCallId: null,
    }),
}));
