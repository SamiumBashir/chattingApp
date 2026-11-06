'use client';

import React, { createContext, useContext } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { CallModal } from './CallModal';

type CallContextValue = ReturnType<typeof useWebRTC>;

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const call = useWebRTC();

  return (
    <CallContext.Provider value={call}>
      {children}
      <CallModal />
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
