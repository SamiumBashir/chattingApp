'use client';

import { create } from 'zustand';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';
export type CallType = 'audio' | 'video';

export interface CallPartner {
  id: string;
  name: string;
  username: string;
  avatar?: string;
}

interface CallStoreState {
  callState: CallState;
  callType: CallType;
  partner: CallPartner | null;
  conversationId: string | null;
  isMuted: boolean;
  isVideoOff: boolean;
  duration: number;
  formattedDuration: string;
  error: string | null;

  // Actions
  setIncomingCall: (partner: CallPartner, conversationId: string, callType: CallType) => void;
  startOutgoingCall: (partner: CallPartner, conversationId: string, callType: CallType) => void;
  setConnected: () => void;
  setDuration: (duration: number) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  setIsMuted: (isMuted: boolean) => void;
  setIsVideoOff: (isVideoOff: boolean) => void;
  setError: (err: string | null) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  callState: 'idle',
  callType: 'audio',
  partner: null,
  conversationId: null,
  isMuted: false,
  isVideoOff: false,
  duration: 0,
  formattedDuration: '00:00',
  error: null,

  setIncomingCall: (partner, conversationId, callType) =>
    set({
      callState: 'incoming',
      partner,
      conversationId,
      callType,
      error: null,
      duration: 0,
      formattedDuration: '00:00',
      isMuted: false,
      isVideoOff: false,
    }),

  startOutgoingCall: (partner, conversationId, callType) =>
    set({
      callState: 'calling',
      partner,
      conversationId,
      callType,
      error: null,
      duration: 0,
      formattedDuration: '00:00',
      isMuted: false,
      isVideoOff: false,
    }),

  setConnected: () =>
    set({
      callState: 'connected',
      error: null,
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
  setError: (error) => set({ error }),

  resetCall: () =>
    set({
      callState: 'idle',
      partner: null,
      conversationId: null,
      isMuted: false,
      isVideoOff: false,
      duration: 0,
      formattedDuration: '00:00',
      error: null,
    }),
}));

