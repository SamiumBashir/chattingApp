'use client';

import React from 'react';
import { X, Mic, Volume2, Video, Check, Sparkles, Network } from 'lucide-react';
import { useCallStore } from '@/store/callStore';
import { cn } from '@/lib/utils';

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  callType: 'audio' | 'video';
  availableDevices: {
    audioInputs: MediaDeviceInfo[];
    videoInputs: MediaDeviceInfo[];
    audioOutputs: MediaDeviceInfo[];
  };
  selectedAudioInput: string | null;
  selectedAudioOutput: string | null;
  selectedVideoInput: string | null;
  onSelectAudioInput: (id: string) => void;
  onSelectAudioOutput: (id: string) => void;
  onSelectVideoInput: (id: string) => void;
}

export function DeviceSettingsModal({
  isOpen,
  onClose,
  callType,
  availableDevices,
  selectedAudioInput,
  selectedAudioOutput,
  selectedVideoInput,
  onSelectAudioInput,
  onSelectAudioOutput,
  onSelectVideoInput,
}: DeviceSettingsModalProps) {
  const { isBackgroundBlurred, toggleBackgroundBlur, iceTransportPolicy, setIceTransportPolicy } = useCallStore();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-card border border-border/80 shadow-2xl p-6 text-foreground animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            Audio & Video Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 pt-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* 1. Microphone (Audio Input) */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
              <Mic className="h-4 w-4 text-primary" />
              Microphone
            </label>
            <div className="space-y-1.5">
              {availableDevices.audioInputs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pl-1">Default system microphone</p>
              ) : (
                availableDevices.audioInputs.map((device, idx) => {
                  const isSelected =
                    selectedAudioInput === device.deviceId ||
                    (!selectedAudioInput && idx === 0);
                  return (
                    <button
                      key={device.deviceId || idx}
                      type="button"
                      onClick={() => onSelectAudioInput(device.deviceId)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl border transition-all text-left ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border/50 hover:bg-muted text-foreground'
                      }`}
                    >
                      <span className="truncate pr-2">
                        {device.label || `Microphone ${idx + 1}`}
                      </span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. Speaker / Audio Output */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
              <Volume2 className="h-4 w-4 text-primary" />
              Audio Output
            </label>
            <div className="space-y-1.5">
              {availableDevices.audioOutputs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pl-1">Default system audio output</p>
              ) : (
                availableDevices.audioOutputs.map((device, idx) => {
                  const isSelected =
                    selectedAudioOutput === device.deviceId ||
                    (!selectedAudioOutput && idx === 0);
                  return (
                    <button
                      key={device.deviceId || idx}
                      type="button"
                      onClick={() => onSelectAudioOutput(device.deviceId)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl border transition-all text-left ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border/50 hover:bg-muted text-foreground'
                      }`}
                    >
                      <span className="truncate pr-2">
                        {device.label || `Speaker ${idx + 1}`}
                      </span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 3. Camera (Video Input) - if video call */}
          {callType === 'video' && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                <Video className="h-4 w-4 text-primary" />
                Camera
              </label>
              <div className="space-y-1.5">
                {availableDevices.videoInputs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic pl-1">Default system camera</p>
                ) : (
                  availableDevices.videoInputs.map((device, idx) => {
                    const isSelected =
                      selectedVideoInput === device.deviceId ||
                      (!selectedVideoInput && idx === 0);
                    return (
                      <button
                        key={device.deviceId || idx}
                        type="button"
                        onClick={() => onSelectVideoInput(device.deviceId)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl border transition-all text-left ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border/50 hover:bg-muted text-foreground'
                        }`}
                      >
                        <span className="truncate pr-2">
                          {device.label || `Camera ${idx + 1}`}
                        </span>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Virtual Background Blur Toggle */}
              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                <div className="flex flex-col pr-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Background Blur
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Softens your camera background for privacy
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleBackgroundBlur}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                    isBackgroundBlurred ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                      isBackgroundBlurred ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* WebRTC TURN Relay NAT Traversal Testing Toggle */}
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
          <div className="flex flex-col pr-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-primary" />
              Force TURN Relay Testing Mode
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5">
              Routes media through TURN relay servers only (<code className="text-[10px]">relay</code> policy)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIceTransportPolicy(iceTransportPolicy === 'relay' ? 'all' : 'relay')}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
              iceTransportPolicy === 'relay' ? 'bg-amber-500' : 'bg-muted'
            )}
            title="Toggle TURN Relay Only mode (iceTransportPolicy: relay)"
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                iceTransportPolicy === 'relay' ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

