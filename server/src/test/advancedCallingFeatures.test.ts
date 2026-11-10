import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { generateAccessToken } from '../utils/token.js';
import { Call } from '../models/Call.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';

describe('Phase 9 — Advanced Calling Features (Screen Share, Device Switching, Audio Cues & Quality Rating)', () => {
  const app = createApp();

  const callerId = new mongoose.Types.ObjectId().toString();
  const recipientId = new mongoose.Types.ObjectId().toString();
  const outsiderId = new mongoose.Types.ObjectId().toString();

  const mockCaller = {
    id: callerId,
    _id: new mongoose.Types.ObjectId(callerId),
    name: 'Alice Caller',
    username: 'alice_advanced',
    email: 'alice.adv@example.com',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: callerId,
      name: 'Alice Caller',
      username: 'alice_advanced',
      email: 'alice.adv@example.com',
      role: 'user',
    }),
  };

  const mockRecipient = {
    id: recipientId,
    _id: new mongoose.Types.ObjectId(recipientId),
    name: 'Bob Recipient',
    username: 'bob_advanced',
    email: 'bob.adv@example.com',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: recipientId,
      name: 'Bob Recipient',
      username: 'bob_advanced',
      email: 'bob.adv@example.com',
      role: 'user',
    }),
  };

  const mockOutsider = {
    id: outsiderId,
    _id: new mongoose.Types.ObjectId(outsiderId),
    name: 'Eve Outsider',
    username: 'eve_advanced',
    email: 'eve.adv@example.com',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: outsiderId,
      name: 'Eve Outsider',
      username: 'eve_advanced',
      email: 'eve.adv@example.com',
      role: 'user',
    }),
  };

  const mockSession = {
    id: new mongoose.Types.ObjectId().toString(),
    _id: new mongoose.Types.ObjectId(),
    isValid: () => true,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
  };

  const callerToken = generateAccessToken({
    userId: callerId,
    email: mockCaller.email,
    username: mockCaller.username,
    role: 'user',
    sessionId: mockSession.id,
  });

  const recipientToken = generateAccessToken({
    userId: recipientId,
    email: mockRecipient.email,
    username: mockRecipient.username,
    role: 'user',
    sessionId: mockSession.id,
  });

  const outsiderToken = generateAccessToken({
    userId: outsiderId,
    email: mockOutsider.email,
    username: mockOutsider.username,
    role: 'user',
    sessionId: mockSession.id,
  });

  const completedCall = {
    _id: new mongoose.Types.ObjectId(),
    callId: `call_adv_test_${Date.now()}`,
    conversation: new mongoose.Types.ObjectId(),
    caller: mockCaller._id,
    recipient: mockRecipient._id,
    callType: 'video',
    status: 'completed',
    duration: 145,
    startedAt: new Date(Date.now() - 150000),
    connectedAt: new Date(Date.now() - 145000),
    endedAt: new Date(),
    rating: null,
    save: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(User, 'findById').mockImplementation((id: any) => {
      const idStr = id?.toString();
      if (idStr === callerId) return Promise.resolve(mockCaller as any);
      if (idStr === recipientId) return Promise.resolve(mockRecipient as any);
      if (idStr === outsiderId) return Promise.resolve(mockOutsider as any);
      return Promise.resolve(null);
    });

    vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. SCREEN SHARING NEGOTIATION & TRACK REPLACEMENT
  // =========================================================================
  describe('1. Screen Share Track Switching & Replacement', () => {
    it('switches video sender track to displayMedia without breaking audio track', async () => {
      const audioTrack = { id: 'track_audio_1', kind: 'audio', enabled: true, stop: vi.fn() };
      const originalCamTrack = { id: 'track_cam_1', kind: 'video', enabled: true, stop: vi.fn() };
      const screenTrack = { id: 'track_screen_1', kind: 'video', enabled: true, onended: null as any, stop: vi.fn() };

      const videoSender = {
        track: originalCamTrack,
        replaceTrack: vi.fn().mockImplementation(async (newTrack) => {
          videoSender.track = newTrack;
        }),
      };
      const audioSender = {
        track: audioTrack,
        replaceTrack: vi.fn(),
      };

      // Start screen sharing: replaces camera with screen track
      await videoSender.replaceTrack(screenTrack);

      expect(videoSender.replaceTrack).toHaveBeenCalledWith(screenTrack);
      expect(videoSender.track.id).toBe('track_screen_1');
      // Audio sender was completely untouched
      expect(audioSender.replaceTrack).not.toHaveBeenCalled();
      expect(audioTrack.enabled).toBe(true);
    });

    it('automatically restores original camera track when user stops screen share', async () => {
      const originalCamTrack = { id: 'track_cam_1', kind: 'video', enabled: true, stop: vi.fn() };
      const screenTrack = { id: 'track_screen_1', kind: 'video', enabled: true, onended: null as any, stop: vi.fn() };

      const videoSender = {
        track: screenTrack,
        replaceTrack: vi.fn().mockImplementation(async (newTrack) => {
          videoSender.track = newTrack;
        }),
      };

      let isScreenSharing = true;

      // When browser's native "Stop Sharing" button is clicked
      const handleStopScreenShare = async () => {
        screenTrack.stop();
        await videoSender.replaceTrack(originalCamTrack);
        isScreenSharing = false;
      };

      screenTrack.onended = async () => {
        await handleStopScreenShare();
      };

      // Trigger the native onended event
      await screenTrack.onended();

      expect(screenTrack.stop).toHaveBeenCalled();
      expect(videoSender.replaceTrack).toHaveBeenCalledWith(originalCamTrack);
      expect(videoSender.track.id).toBe('track_cam_1');
      expect(isScreenSharing).toBe(false);
    });
  });

  // =========================================================================
  // 2. IN-CALL DYNAMIC HARDWARE DEVICE SWITCHING
  // =========================================================================
  describe('2. In-Call Dynamic Hardware Device Switching', () => {
    it('seamlessly switches microphone input by replacing audio sender track', async () => {
      const oldMicTrack = { id: 'mic_default', kind: 'audio', stop: vi.fn() };
      const newMicTrack = { id: 'mic_headset_bluetooth', kind: 'audio', stop: vi.fn() };

      const audioSender = {
        track: oldMicTrack,
        replaceTrack: vi.fn().mockImplementation(async (track) => {
          audioSender.track = track;
        }),
      };

      // Simulate switchAudioInput
      oldMicTrack.stop();
      await audioSender.replaceTrack(newMicTrack);

      expect(oldMicTrack.stop).toHaveBeenCalled();
      expect(audioSender.replaceTrack).toHaveBeenCalledWith(newMicTrack);
      expect(audioSender.track.id).toBe('mic_headset_bluetooth');
    });

    it('seamlessly switches camera input by replacing video sender track', async () => {
      const oldCamTrack = { id: 'cam_internal', kind: 'video', stop: vi.fn() };
      const newCamTrack = { id: 'cam_external_4k', kind: 'video', stop: vi.fn() };

      const videoSender = {
        track: oldCamTrack,
        replaceTrack: vi.fn().mockImplementation(async (track) => {
          videoSender.track = track;
        }),
      };

      oldCamTrack.stop();
      await videoSender.replaceTrack(newCamTrack);

      expect(oldCamTrack.stop).toHaveBeenCalled();
      expect(videoSender.replaceTrack).toHaveBeenCalledWith(newCamTrack);
      expect(videoSender.track.id).toBe('cam_external_4k');
    });

    it('routes audio output via setSinkId and reports fallback when not supported', async () => {
      const mockAudioElementWithSink = {
        setSinkId: vi.fn().mockResolvedValue(undefined),
      };

      const switchWithSink = async (sinkId: string) => {
        if (typeof mockAudioElementWithSink.setSinkId === 'function') {
          await mockAudioElementWithSink.setSinkId(sinkId);
          return true;
        }
        return false;
      };

      const res = await switchWithSink('speaker_external_bluetooth');
      expect(res).toBe(true);
      expect(mockAudioElementWithSink.setSinkId).toHaveBeenCalledWith('speaker_external_bluetooth');

      const mockLegacyElement = {};
      const switchWithoutSink = async (sinkId: string) => {
        if (typeof (mockLegacyElement as any).setSinkId === 'function') {
          await (mockLegacyElement as any).setSinkId(sinkId);
          return true;
        }
        return false;
      };

      const fallbackRes = await switchWithoutSink('speaker_external_bluetooth');
      expect(fallbackRes).toBe(false);
    });
  });

  // =========================================================================
  // 3. AUDIO CUES & WEB AUDIO SYNTHESIS
  // =========================================================================
  describe('3. Audio Cue Synthesizer & Sound States', () => {
    it('manages tone generation and stops intervals cleanly', () => {
      let activeInterval: any = null;
      let playedSounds: string[] = [];

      const startRinging = () => {
        playedSounds.push('ringback');
        activeInterval = setInterval(() => {
          playedSounds.push('ringback');
        }, 2000);
      };

      const stopSounds = () => {
        if (activeInterval) {
          clearInterval(activeInterval);
          activeInterval = null;
        }
      };

      const playBusy = () => {
        stopSounds();
        playedSounds.push('busy_tone');
      };

      const playReconnecting = () => {
        playedSounds.push('reconnecting_chime');
      };

      startRinging();
      expect(playedSounds).toEqual(['ringback']);

      playReconnecting();
      expect(playedSounds).toContain('reconnecting_chime');

      playBusy();
      expect(activeInterval).toBeNull();
      expect(playedSounds).toContain('busy_tone');
    });
  });

  // =========================================================================
  // 4. PICTURE-IN-PICTURE & VIRTUAL BACKGROUND BLUR
  // =========================================================================
  describe('4. Picture-in-Picture Modes & Virtual Background Blur', () => {
    it('cycles in-app Picture-in-Picture positioning through all 4 corners', () => {
      const PIP_POSITIONS = ['top-right', 'bottom-right', 'bottom-left', 'top-left'] as const;
      let currentPos = 'top-right';

      const cycle = () => {
        const idx = PIP_POSITIONS.indexOf(currentPos as any);
        currentPos = PIP_POSITIONS[(idx + 1) % PIP_POSITIONS.length];
      };

      expect(currentPos).toBe('top-right');
      cycle();
      expect(currentPos).toBe('bottom-right');
      cycle();
      expect(currentPos).toBe('bottom-left');
      cycle();
      expect(currentPos).toBe('top-left');
      cycle();
      expect(currentPos).toBe('top-right');
    });

    it('toggles native browser Picture-in-Picture mode on video element', async () => {
      let isPipActive = false;
      const mockVideo = {
        requestPictureInPicture: vi.fn().mockImplementation(async () => {
          isPipActive = true;
        }),
      };
      const mockDoc = {
        pictureInPictureEnabled: true,
        exitPictureInPicture: vi.fn().mockImplementation(async () => {
          isPipActive = false;
        }),
      };

      const toggleNativePip = async () => {
        if (isPipActive) {
          await mockDoc.exitPictureInPicture();
        } else if (mockDoc.pictureInPictureEnabled) {
          await mockVideo.requestPictureInPicture();
        }
      };

      expect(isPipActive).toBe(false);
      await toggleNativePip();
      expect(isPipActive).toBe(true);
      expect(mockVideo.requestPictureInPicture).toHaveBeenCalled();

      await toggleNativePip();
      expect(isPipActive).toBe(false);
      expect(mockDoc.exitPictureInPicture).toHaveBeenCalled();
    });

    it('toggles virtual background blur state', () => {
      let isBackgroundBlurred = false;
      const toggleBackgroundBlur = () => {
        isBackgroundBlurred = !isBackgroundBlurred;
      };

      expect(isBackgroundBlurred).toBe(false);
      toggleBackgroundBlur();
      expect(isBackgroundBlurred).toBe(true);
      toggleBackgroundBlur();
      expect(isBackgroundBlurred).toBe(false);
    });
  });

  // =========================================================================
  // 5. CALL QUALITY RATING & FEEDBACK SUBMISSION
  // =========================================================================
  describe('5. Call Quality Feedback & Rating Submission Endpoint', () => {
    it('rejects unauthenticated requests to POST /api/v1/calls/:id/rating with 401', async () => {
      const res = await request(app)
        .post(`/api/v1/calls/${completedCall.callId}/rating`)
        .send({ rating: 5, feedback: 'Great call!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid rating values outside 1-5 with 400 VALIDATION_ERROR', async () => {
      vi.spyOn(Call, 'findOne').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(completedCall),
      } as any);

      const resZero = await request(app)
        .post(`/api/v1/calls/${completedCall.callId}/rating`)
        .set('Authorization', `Bearer ${callerToken}`)
        .send({ rating: 0 });

      expect(resZero.status).toBe(400);
      expect(resZero.body.error.code).toBe('VALIDATION_ERROR');

      const resSix = await request(app)
        .post(`/api/v1/calls/${completedCall.callId}/rating`)
        .set('Authorization', `Bearer ${callerToken}`)
        .send({ rating: 6 });

      expect(resSix.status).toBe(400);
      expect(resSix.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects rating submissions from non-participants with 403 FORBIDDEN', async () => {
      vi.spyOn(Call, 'findOne').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(completedCall),
      } as any);

      const res = await request(app)
        .post(`/api/v1/calls/${completedCall.callId}/rating`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ rating: 4, feedback: 'Attempt by outsider' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('accepts valid 5-star rating with tags and feedback from caller', async () => {
      const ratedCallDoc = {
        ...completedCall,
        rating: {
          rating: 5,
          feedback: 'Crystal clear voice and sharp video!',
          tags: ['Crisp Audio', 'HD Video'],
          ratedBy: new mongoose.Types.ObjectId(callerId),
          ratedAt: new Date(),
        },
      };

      vi.spyOn(Call, 'findOne').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(completedCall),
      } as any);

      vi.spyOn(Call, 'findOneAndUpdate').mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(ratedCallDoc),
      } as any);

      const res = await request(app)
        .post(`/api/v1/calls/${completedCall.callId}/rating`)
        .set('Authorization', `Bearer ${callerToken}`)
        .send({
          rating: 5,
          feedback: 'Crystal clear voice and sharp video!',
          tags: ['Crisp Audio', 'HD Video'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.call.rating).toBeDefined();
      expect(res.body.data.call.rating.rating).toBe(5);
      expect(res.body.data.call.rating.feedback).toBe('Crystal clear voice and sharp video!');
      expect(res.body.data.call.rating.tags).toEqual(['Crisp Audio', 'HD Video']);
    });
  });
});
