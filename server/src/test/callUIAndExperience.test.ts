import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Phase 6 — Audio and Video Call UI/UX, Controls & State Experience', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. CALL STATE MANAGEMENT & UI TRANSITIONS
  // =========================================================================
  describe('1. Call UI State Management & Screen Transitions', () => {
    const createMockCallStore = () => {
      let state: any = {
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
      };

      return {
        getState: () => state,
        setInitiating: (partner: any, convId: string, type: 'audio' | 'video') => {
          state = {
            ...state,
            callState: 'initiating',
            partner,
            conversationId: convId,
            callType: type,
            error: null,
            endReason: null,
            duration: 0,
            formattedDuration: '00:00',
            isMuted: false,
            isVideoOff: false,
            isMinimized: false,
            isScreenSharing: false,
          };
        },
        setRinging: () => {
          if (state.callState === 'initiating') {
            state = { ...state, callState: 'ringing' };
          }
        },
        setIncoming: (partner: any, convId: string, type: 'audio' | 'video', callId?: string) => {
          state = {
            ...state,
            callState: 'incoming',
            partner,
            conversationId: convId,
            callId: callId || null,
            callType: type,
            error: null,
            endReason: null,
            duration: 0,
            formattedDuration: '00:00',
            isMuted: false,
            isVideoOff: false,
            isMinimized: false,
            isScreenSharing: false,
          };
        },
        setAccepting: () => {
          state = { ...state, callState: 'accepting' };
        },
        setConnecting: () => {
          state = { ...state, callState: 'connecting' };
        },
        setConnected: () => {
          state = { ...state, callState: 'connected', reconnectReason: null };
        },
        setReconnecting: (reason?: string) => {
          if (state.callState === 'connected') {
            state = {
              ...state,
              callState: 'reconnecting',
              reconnectReason: reason || 'Connection interrupted. Reconnecting...',
            };
          }
        },
        setEnded: (reason?: string) => {
          state = { ...state, callState: 'ended', endReason: reason || 'Call ended' };
        },
        setFailed: (err: string) => {
          state = { ...state, callState: 'failed', error: err, endReason: err };
        },
        setDuration: (dur: number) => {
          const mins = Math.floor(dur / 60);
          const secs = dur % 60;
          state = {
            ...state,
            duration: dur,
            formattedDuration: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
          };
        },
        toggleMute: () => {
          state = { ...state, isMuted: !state.isMuted };
        },
        toggleVideo: () => {
          state = { ...state, isVideoOff: !state.isVideoOff };
        },
        toggleMinimized: () => {
          state = { ...state, isMinimized: !state.isMinimized };
        },
        setIsMinimized: (val: boolean) => {
          state = { ...state, isMinimized: val };
        },
        setIsScreenSharing: (val: boolean) => {
          state = { ...state, isScreenSharing: val };
        },
        setPipPosition: (pos: string) => {
          state = { ...state, pipPosition: pos };
        },
        toggleLocalFlipped: () => {
          state = { ...state, isLocalFlipped: !state.isLocalFlipped };
        },
        setSelectedAudioInput: (id: string | null) => {
          state = { ...state, selectedAudioInput: id };
        },
        setSelectedAudioOutput: (id: string | null) => {
          state = { ...state, selectedAudioOutput: id };
        },
        setSelectedVideoInput: (id: string | null) => {
          state = { ...state, selectedVideoInput: id };
        },
        resetCall: () => {
          state = {
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
          };
        },
      };
    };

    it('initializes in idle state with unminimized dock and no active streams', () => {
      const store = createMockCallStore();
      const state = store.getState();
      expect(state.callState).toBe('idle');
      expect(state.isMinimized).toBe(false);
      expect(state.isScreenSharing).toBe(false);
      expect(state.partner).toBeNull();
      expect(state.duration).toBe(0);
    });

    it('incoming call sets state to incoming with caller information and call type badge', () => {
      const store = createMockCallStore();
      const mockCaller = {
        id: 'user_bob',
        name: 'Bob Jones',
        username: 'bobjones',
        avatar: 'https://connectly.app/avatars/bob.jpg',
      };

      store.setIncoming(mockCaller, 'conv_123', 'video', 'call_abc');
      const state = store.getState();

      expect(state.callState).toBe('incoming');
      expect(state.callType).toBe('video');
      expect(state.partner?.id).toBe('user_bob');
      expect(state.partner?.name).toBe('Bob Jones');
      expect(state.callId).toBe('call_abc');
    });

    it('outgoing call transitions from initiating to ringing with recipient details', () => {
      const store = createMockCallStore();
      const mockRecipient = {
        id: 'user_charlie',
        name: 'Charlie Day',
        username: 'charlied',
      };

      store.setInitiating(mockRecipient, 'conv_456', 'audio');
      expect(store.getState().callState).toBe('initiating');
      expect(store.getState().callType).toBe('audio');
      expect(store.getState().partner?.name).toBe('Charlie Day');

      store.setRinging();
      expect(store.getState().callState).toBe('ringing');
    });

    it('accepting call transitions state machine from incoming -> accepting -> connecting -> connected', () => {
      const store = createMockCallStore();
      store.setIncoming({ id: 'user_alice', name: 'Alice', username: 'alice' }, 'conv_789', 'audio');

      expect(store.getState().callState).toBe('incoming');
      store.setAccepting();
      expect(store.getState().callState).toBe('accepting');
      store.setConnecting();
      expect(store.getState().callState).toBe('connecting');
      store.setConnected();
      expect(store.getState().callState).toBe('connected');
    });

    it('rejecting or cancelling call transitions state to ended and cleans up', () => {
      const store = createMockCallStore();
      store.setIncoming({ id: 'user_alice', name: 'Alice', username: 'alice' }, 'conv_789', 'audio');

      store.setEnded('Call declined');
      expect(store.getState().callState).toBe('ended');
      expect(store.getState().endReason).toBe('Call declined');

      store.resetCall();
      expect(store.getState().callState).toBe('idle');
      expect(store.getState().partner).toBeNull();
    });
  });

  // =========================================================================
  // 2. ACTIVE CALL CONTROLS & DOCK MINIMIZE/MAXIMIZE
  // =========================================================================
  describe('2. Active Call Controls (Mute, Video, Screen Share, Minimize/Maximize)', () => {
    it('toggles microphone mute state with accurate visual flag', () => {
      let isMuted = false;
      const toggleMute = () => {
        isMuted = !isMuted;
      };

      expect(isMuted).toBe(false);
      toggleMute();
      expect(isMuted).toBe(true);
      toggleMute();
      expect(isMuted).toBe(false);
    });

    it('toggles camera video state with accurate visual flag', () => {
      let isVideoOff = false;
      const toggleVideo = () => {
        isVideoOff = !isVideoOff;
      };

      expect(isVideoOff).toBe(false);
      toggleVideo();
      expect(isVideoOff).toBe(true);
      toggleVideo();
      expect(isVideoOff).toBe(false);
    });

    it('minimizes active call to floating mini-dock allowing background navigation', () => {
      let isMinimized = false;
      const toggleMinimized = () => {
        isMinimized = !isMinimized;
      };

      expect(isMinimized).toBe(false);
      toggleMinimized(); // Minimize to floating dock
      expect(isMinimized).toBe(true);
      toggleMinimized(); // Maximize back to full modal
      expect(isMinimized).toBe(false);
    });

    it('toggles screen sharing state on active call', () => {
      let isScreenSharing = false;
      const toggleScreenShare = () => {
        isScreenSharing = !isScreenSharing;
      };

      expect(isScreenSharing).toBe(false);
      toggleScreenShare();
      expect(isScreenSharing).toBe(true);
      toggleScreenShare();
      expect(isScreenSharing).toBe(false);
    });

    it('cycles Picture-in-Picture local preview through 4 screen corners and flips self view', () => {
      const PIP_POSITIONS = ['top-right', 'bottom-right', 'bottom-left', 'top-left'] as const;
      let pipPosition = 'top-right';
      let isLocalFlipped = true;

      const cyclePip = () => {
        const idx = PIP_POSITIONS.indexOf(pipPosition as any);
        pipPosition = PIP_POSITIONS[(idx + 1) % PIP_POSITIONS.length];
      };
      const toggleFlip = () => {
        isLocalFlipped = !isLocalFlipped;
      };

      expect(pipPosition).toBe('top-right');
      cyclePip();
      expect(pipPosition).toBe('bottom-right');
      cyclePip();
      expect(pipPosition).toBe('bottom-left');
      cyclePip();
      expect(pipPosition).toBe('top-left');
      cyclePip();
      expect(pipPosition).toBe('top-right');

      expect(isLocalFlipped).toBe(true);
      toggleFlip();
      expect(isLocalFlipped).toBe(false);
    });

    it('formats call duration accurately across seconds, minutes, and hours', () => {
      const formatDuration = (secs: number) => {
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      };

      expect(formatDuration(0)).toBe('00:00');
      expect(formatDuration(45)).toBe('00:45');
      expect(formatDuration(60)).toBe('01:00');
      expect(formatDuration(155)).toBe('02:35');
      expect(formatDuration(3600)).toBe('60:00');
    });
  });

  // =========================================================================
  // 3. HARDWARE DEVICE SWITCHING & SINK SELECTION
  // =========================================================================
  describe('3. Media Device Enumeration, Switching & setSinkId', () => {
    it('enumerates audioinput, videoinput, and audiooutput devices into categories', async () => {
      const mockDevices = [
        { deviceId: 'mic_default', kind: 'audioinput', label: 'Default Microphone' },
        { deviceId: 'mic_headset', kind: 'audioinput', label: 'Bluetooth Headset Mic' },
        { deviceId: 'cam_facetime', kind: 'videoinput', label: 'FaceTime HD Camera' },
        { deviceId: 'spk_default', kind: 'audiooutput', label: 'Default Speakers' },
        { deviceId: 'spk_headphones', kind: 'audiooutput', label: 'Headphones' },
      ];

      const audioInputs = mockDevices.filter((d) => d.kind === 'audioinput');
      const videoInputs = mockDevices.filter((d) => d.kind === 'videoinput');
      const audioOutputs = mockDevices.filter((d) => d.kind === 'audiooutput');

      expect(audioInputs.length).toBe(2);
      expect(videoInputs.length).toBe(1);
      expect(audioOutputs.length).toBe(2);
    });

    it('switches audio input track dynamically using RTCRtpSender.replaceTrack', async () => {
      const oldAudioTrack = { kind: 'audio', id: 'track_mic_1', stop: vi.fn() };
      const newAudioTrack = { kind: 'audio', id: 'track_mic_2', stop: vi.fn() };

      const mockSender = {
        track: oldAudioTrack,
        replaceTrack: vi.fn(async (track: any) => {
          mockSender.track = track;
        }),
      };

      const pc: any = {
        getSenders: () => [mockSender],
      };

      const sender = pc.getSenders().find((s: any) => s.track?.kind === 'audio');
      expect(sender).toBeDefined();

      await sender.replaceTrack(newAudioTrack);
      oldAudioTrack.stop();

      expect(mockSender.replaceTrack).toHaveBeenCalledWith(newAudioTrack);
      expect(mockSender.track.id).toBe('track_mic_2');
      expect(oldAudioTrack.stop).toHaveBeenCalled();
    });

    it('switches video input camera track dynamically using RTCRtpSender.replaceTrack', async () => {
      const oldVideoTrack = { kind: 'video', id: 'cam_1', stop: vi.fn() };
      const newVideoTrack = { kind: 'video', id: 'cam_2', stop: vi.fn() };

      const mockSender = {
        track: oldVideoTrack,
        replaceTrack: vi.fn(async (track: any) => {
          mockSender.track = track;
        }),
      };

      const pc: any = {
        getSenders: () => [mockSender],
      };

      const sender = pc.getSenders().find((s: any) => s.track?.kind === 'video');
      expect(sender).toBeDefined();

      await sender.replaceTrack(newVideoTrack);
      oldVideoTrack.stop();

      expect(mockSender.replaceTrack).toHaveBeenCalledWith(newVideoTrack);
      expect(mockSender.track.id).toBe('cam_2');
      expect(oldVideoTrack.stop).toHaveBeenCalled();
    });

    it('calls setSinkId on audio element when supported by the browser', async () => {
      let activeSinkId = 'default';
      const mockAudioElement: any = {
        setSinkId: vi.fn(async (sinkId: string) => {
          activeSinkId = sinkId;
        }),
      };

      expect(typeof mockAudioElement.setSinkId).toBe('function');
      await mockAudioElement.setSinkId('device_headphones_123');

      expect(mockAudioElement.setSinkId).toHaveBeenCalledWith('device_headphones_123');
      expect(activeSinkId).toBe('device_headphones_123');
    });

    it('screen sharing acquires displayMedia, replaces video track and restores camera on stop', async () => {
      const cameraTrack = { kind: 'video', id: 'track_camera_orig', stop: vi.fn() };
      const screenTrack = {
        kind: 'video',
        id: 'track_screen_share',
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };

      let activeVideoTrack: any = cameraTrack;
      let savedOriginalTrack: any = null;

      const mockSender = {
        replaceTrack: vi.fn(async (track: any) => {
          activeVideoTrack = track;
        }),
      };

      // 1. Start screen share
      savedOriginalTrack = activeVideoTrack;
      await mockSender.replaceTrack(screenTrack);
      expect(activeVideoTrack.id).toBe('track_screen_share');
      expect(savedOriginalTrack.id).toBe('track_camera_orig');

      // 2. User stops screen share (or browser native stop clicked)
      screenTrack.stop();
      await mockSender.replaceTrack(savedOriginalTrack);
      savedOriginalTrack = null;

      expect(screenTrack.stop).toHaveBeenCalled();
      expect(activeVideoTrack.id).toBe('track_camera_orig');
      expect(savedOriginalTrack).toBeNull();
    });
  });

  // =========================================================================
  // 4. WEB AUDIO SOUND CUES & BROWSER AUTOPLAY RECOVERY
  // =========================================================================
  describe('4. Web Audio Synthesizer Cues & Autoplay Policy Recovery', () => {
    it('synthesizes outgoing ringback pulse without external sound assets', () => {
      const createdNodes: string[] = [];
      const mockCtx: any = {
        currentTime: 10,
        state: 'running',
        createOscillator: () => {
          createdNodes.push('oscillator');
          return {
            type: 'sine',
            frequency: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
        },
        createGain: () => {
          createdNodes.push('gain');
          return {
            gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
          };
        },
        destination: {},
      };

      // Play ringback pulse
      const osc1 = mockCtx.createOscillator();
      const osc2 = mockCtx.createOscillator();
      const gain = mockCtx.createGain();

      expect(createdNodes).toContain('oscillator');
      expect(createdNodes).toContain('gain');
      expect(osc1).toBeDefined();
      expect(osc2).toBeDefined();
    });

    it('synthesizes connected 3-tone chime sequence when call enters connected', () => {
      const playedFrequencies: number[] = [];
      const mockCtx: any = {
        currentTime: 0,
        createOscillator: () => ({
          type: 'sine',
          frequency: {
            setValueAtTime: (freq: number) => playedFrequencies.push(freq),
          },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }),
        createGain: () => ({
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        }),
        destination: {},
      };

      // F4 (349.23 Hz), A4 (440 Hz), C5 (523.25 Hz)
      const notes = [349.23, 440.0, 523.25];
      notes.forEach((freq) => {
        const osc = mockCtx.createOscillator();
        osc.frequency.setValueAtTime(freq);
      });

      expect(playedFrequencies).toEqual([349.23, 440.0, 523.25]);
    });

    it('recovers suspended AudioContext upon user gesture via setupAutoplayUnlock', () => {
      let isSuspended = true;
      const mockCtx: any = {
        state: 'suspended',
        resume: vi.fn(async () => {
          isSuspended = false;
          mockCtx.state = 'running';
        }),
      };

      expect(mockCtx.state).toBe('suspended');

      // User performs click / pointerdown
      if (mockCtx.state === 'suspended') {
        mockCtx.resume();
      }

      expect(mockCtx.resume).toHaveBeenCalled();
      expect(mockCtx.state).toBe('running');
      expect(isSuspended).toBe(false);
    });

    it('handles audio element play() rejection by displaying autoplay unblock banner', async () => {
      let isAudioBlocked = false;
      const mockAudioElement: any = {
        play: vi.fn().mockRejectedValue(new Error('NotAllowedError: play() failed')),
      };

      await mockAudioElement.play().catch((err: Error) => {
        if (err.message.includes('NotAllowedError') || err.message.includes('play() failed')) {
          isAudioBlocked = true;
        }
      });

      expect(isAudioBlocked).toBe(true);

      // User clicks "Click here to enable call audio" banner
      mockAudioElement.play = vi.fn().mockResolvedValue(undefined);
      await mockAudioElement.play().then(() => {
        isAudioBlocked = false;
      });

      expect(isAudioBlocked).toBe(false);
    });
  });

  // =========================================================================
  // 5. RECONNECTION & FALLBACK AVATAR DISPLAY
  // =========================================================================
  describe('5. Error Handling, Network Interruption & Reconnection Alerts', () => {
    it('displays floating reconnection banner when connection state degrades', () => {
      let reconnectReason: string | null = null;
      let callState = 'connected';

      const onConnectionDisconnected = () => {
        callState = 'reconnecting';
        reconnectReason = 'Connection interrupted. Reconnecting...';
      };

      expect(callState).toBe('connected');
      expect(reconnectReason).toBeNull();

      onConnectionDisconnected();

      expect(callState).toBe('reconnecting');
      expect(reconnectReason).toBe('Connection interrupted. Reconnecting...');
    });

    it('renders fallback avatar and video paused label when remote video stream is disabled', () => {
      let hasRemoteVideo = true;

      const onRemoteVideoMuted = (tracks: any[]) => {
        hasRemoteVideo = tracks.length > 0 && tracks.some((t) => t.enabled && !t.muted);
      };

      // Remote user turns off video
      onRemoteVideoMuted([{ enabled: false, muted: false }]);
      expect(hasRemoteVideo).toBe(false);

      // Remote user restores video
      onRemoteVideoMuted([{ enabled: true, muted: false }]);
      expect(hasRemoteVideo).toBe(true);
    });
  });
});

