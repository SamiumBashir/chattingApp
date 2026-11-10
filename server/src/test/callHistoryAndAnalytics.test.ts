import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { generateAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Call } from '../models/Call.js';
import { CallPersistenceService } from '../services/callPersistence.service.js';
import { ActiveCallSession } from '../services/callState.service.js';

describe('Phase 7 — Persistent Call History, Metadata & Analytics', () => {
  const app = createApp();

  const userAliceId = new mongoose.Types.ObjectId().toString();
  const userBobId = new mongoose.Types.ObjectId().toString();
  const userEveId = new mongoose.Types.ObjectId().toString();
  const convId = new mongoose.Types.ObjectId().toString();

  const mockUserAlice = {
    id: userAliceId,
    _id: new mongoose.Types.ObjectId(userAliceId),
    name: 'Alice Smith',
    username: 'alicesmith',
    email: 'alice@connectly.app',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: userAliceId,
      name: 'Alice Smith',
      username: 'alicesmith',
      email: 'alice@connectly.app',
      role: 'user',
    }),
  };

  const mockUserBob = {
    id: userBobId,
    _id: new mongoose.Types.ObjectId(userBobId),
    name: 'Bob Jones',
    username: 'bobjones',
    email: 'bob@connectly.app',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: userBobId,
      name: 'Bob Jones',
      username: 'bobjones',
      email: 'bob@connectly.app',
      role: 'user',
    }),
  };

  const mockUserEve = {
    id: userEveId,
    _id: new mongoose.Types.ObjectId(userEveId),
    name: 'Eve Attacker',
    username: 'eve_attacker',
    email: 'eve@connectly.app',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: userEveId,
      name: 'Eve Attacker',
      username: 'eve_attacker',
      email: 'eve@connectly.app',
      role: 'user',
    }),
  };

  const mockSessionAlice = {
    id: new mongoose.Types.ObjectId().toString(),
    _id: new mongoose.Types.ObjectId(),
    userId: userAliceId,
    isValid: () => true,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
  };

  const tokenAlice = generateAccessToken({
    userId: userAliceId,
    email: mockUserAlice.email,
    username: mockUserAlice.username,
    role: 'user',
    sessionId: mockSessionAlice.id,
  });

  const tokenEve = generateAccessToken({
    userId: userEveId,
    email: mockUserEve.email,
    username: mockUserEve.username,
    role: 'user',
    sessionId: new mongoose.Types.ObjectId().toString(),
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(User, 'findById').mockImplementation((id: any) => {
      const idStr = id?.toString();
      if (idStr === userAliceId) return Promise.resolve(mockUserAlice as any);
      if (idStr === userBobId) return Promise.resolve(mockUserBob as any);
      if (idStr === userEveId) return Promise.resolve(mockUserEve as any);
      return Promise.resolve(null);
    });

    vi.spyOn(Session, 'findById').mockResolvedValue(mockSessionAlice as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. CALL TERMINATION PERSISTENCE & DURATION CALCULATION
  // =========================================================================
  describe('1. Call Record Creation & Status Mapping', () => {
    it('creates completed call record with exact duration on successful call termination', async () => {
      const startedAt = new Date(Date.now() - 125000).toISOString();
      const connectedAt = new Date(Date.now() - 120000).toISOString();
      const endedAt = new Date().toISOString();

      const session: ActiveCallSession = {
        callId: 'call_completed_1',
        callerId: userAliceId,
        recipientId: userBobId,
        conversationId: convId,
        callType: 'video',
        status: 'ended',
        startedAt,
        connectedAt,
        endedAt,
      };

      const mockSavedDoc: any = {
        callId: session.callId,
        conversation: convId,
        caller: userAliceId,
        recipient: userBobId,
        callType: 'video',
        status: 'completed',
        startedAt: new Date(startedAt),
        connectedAt: new Date(connectedAt),
        endedAt: new Date(endedAt),
        duration: 120, // 120 seconds
        endReason: 'user_ended',
        toJSON: () => ({
          callId: session.callId,
          status: 'completed',
          duration: 120,
        }),
      };

      vi.spyOn(Call, 'findOneAndUpdate').mockResolvedValue(mockSavedDoc);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);
      vi.spyOn(Message, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
        toJSON: () => ({}),
      } as any);
      vi.spyOn(Conversation, 'findByIdAndUpdate').mockResolvedValue({} as any);

      const result = await CallPersistenceService.recordCallTermination(session, 'user_ended');

      expect(Call.findOneAndUpdate).toHaveBeenCalledWith(
        { callId: session.callId },
        expect.objectContaining({
          callId: 'call_completed_1',
          status: 'completed',
          callType: 'video',
          duration: 120,
          endReason: 'user_ended',
        }),
        expect.any(Object)
      );

      expect(result?.status).toBe('completed');
      expect(result?.duration).toBe(120);
    });

    it('creates missed call record when call times out without answer', async () => {
      const startedAt = new Date(Date.now() - 15000).toISOString();
      const endedAt = new Date().toISOString();

      const session: ActiveCallSession = {
        callId: 'call_missed_1',
        callerId: userAliceId,
        recipientId: userBobId,
        conversationId: convId,
        callType: 'audio',
        status: 'ended',
        startedAt,
        endedAt,
      };

      const mockSavedDoc: any = {
        callId: session.callId,
        status: 'missed',
        duration: 0,
        endReason: 'timeout',
      };

      vi.spyOn(Call, 'findOneAndUpdate').mockResolvedValue(mockSavedDoc);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);
      vi.spyOn(Message, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
        toJSON: () => ({}),
      } as any);
      vi.spyOn(Conversation, 'findByIdAndUpdate').mockResolvedValue({} as any);

      const result = await CallPersistenceService.recordCallTermination(session, 'timeout');

      expect(Call.findOneAndUpdate).toHaveBeenCalledWith(
        { callId: session.callId },
        expect.objectContaining({
          status: 'missed',
          duration: 0,
          endReason: 'timeout',
        }),
        expect.any(Object)
      );

      expect(result?.status).toBe('missed');
      expect(result?.duration).toBe(0);
    });

    it('creates declined call record when recipient rejects the invitation', async () => {
      const session: ActiveCallSession = {
        callId: 'call_declined_1',
        callerId: userAliceId,
        recipientId: userBobId,
        conversationId: convId,
        callType: 'audio',
        status: 'ended',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      vi.spyOn(Call, 'findOneAndUpdate').mockResolvedValue({
        callId: session.callId,
        status: 'declined',
        duration: 0,
      } as any);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);
      vi.spyOn(Message, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
        toJSON: () => ({}),
      } as any);
      vi.spyOn(Conversation, 'findByIdAndUpdate').mockResolvedValue({} as any);

      const result = await CallPersistenceService.recordCallTermination(session, 'declined');

      expect(Call.findOneAndUpdate).toHaveBeenCalledWith(
        { callId: session.callId },
        expect.objectContaining({
          status: 'declined',
          duration: 0,
          endReason: 'declined',
        }),
        expect.any(Object)
      );
      expect(result?.status).toBe('declined');
    });

    it('creates cancelled call record when caller hangs up before recipient answers', async () => {
      const session: ActiveCallSession = {
        callId: 'call_cancelled_1',
        callerId: userAliceId,
        recipientId: userBobId,
        conversationId: convId,
        callType: 'video',
        status: 'ended',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      vi.spyOn(Call, 'findOneAndUpdate').mockResolvedValue({
        callId: session.callId,
        status: 'cancelled',
        duration: 0,
      } as any);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);
      vi.spyOn(Message, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
        toJSON: () => ({}),
      } as any);
      vi.spyOn(Conversation, 'findByIdAndUpdate').mockResolvedValue({} as any);

      const result = await CallPersistenceService.recordCallTermination(session, 'cancelled');

      expect(Call.findOneAndUpdate).toHaveBeenCalledWith(
        { callId: session.callId },
        expect.objectContaining({
          status: 'cancelled',
          duration: 0,
          endReason: 'cancelled',
        }),
        expect.any(Object)
      );
      expect(result?.status).toBe('cancelled');
    });

    it('stores quality metrics metadata (average RTT, packet loss, resolution)', async () => {
      const session: ActiveCallSession = {
        callId: 'call_with_metrics_1',
        callerId: userAliceId,
        recipientId: userBobId,
        conversationId: convId,
        callType: 'video',
        status: 'ended',
        startedAt: new Date().toISOString(),
        connectedAt: new Date(Date.now() - 60000).toISOString(),
        endedAt: new Date().toISOString(),
      };

      const qualityMetrics = {
        averageRtt: 42.5,
        packetLoss: 0.01,
        resolution: '1280x720',
      };

      vi.spyOn(Call, 'findOneAndUpdate').mockResolvedValue({
        callId: session.callId,
        status: 'completed',
        qualityMetrics,
      } as any);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);
      vi.spyOn(Message, 'create').mockResolvedValue({} as any);
      vi.spyOn(Conversation, 'findByIdAndUpdate').mockResolvedValue({} as any);

      await CallPersistenceService.recordCallTermination(session, 'ended', qualityMetrics);

      expect(Call.findOneAndUpdate).toHaveBeenCalledWith(
        { callId: session.callId },
        expect.objectContaining({
          qualityMetrics,
        }),
        expect.any(Object)
      );
    });
  });

  // =========================================================================
  // 2. CONVERSATION TIMELINE MESSAGE INJECTION
  // =========================================================================
  describe('2. Conversation Timeline Call Message Injection', () => {
    it('injects system message into conversation and updates lastMessage on call end', async () => {
      const session: ActiveCallSession = {
        callId: 'call_timeline_test',
        callerId: userAliceId,
        recipientId: userBobId,
        conversationId: convId,
        callType: 'audio',
        status: 'ended',
        startedAt: new Date(Date.now() - 95000).toISOString(),
        connectedAt: new Date(Date.now() - 90000).toISOString(),
        endedAt: new Date().toISOString(),
      };

      vi.spyOn(Call, 'findOneAndUpdate').mockResolvedValue({} as any);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);
      const mockCreatedMsg: any = {
        _id: new mongoose.Types.ObjectId(),
        conversation: convId,
        content: 'Voice call · 1m 30s',
        createdAt: new Date(),
        toJSON: () => ({ id: 'msg_123', content: 'Voice call · 1m 30s' }),
      };
      vi.spyOn(Message, 'create').mockResolvedValue(mockCreatedMsg);
      vi.spyOn(Conversation, 'findByIdAndUpdate').mockResolvedValue({} as any);

      await CallPersistenceService.recordCallTermination(session, 'ended');

      expect(Message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation: convId,
          sender: userAliceId,
          type: 'system',
          content: 'Voice call · 1m 30s',
          clientMessageId: 'call_msg_call_timeline_test',
        })
      );

      expect(Conversation.findByIdAndUpdate).toHaveBeenCalledWith(
        convId,
        expect.objectContaining({
          lastMessage: expect.objectContaining({
            content: 'Voice call · 1m 30s',
            type: 'system',
          }),
        })
      );
    });

    it('formats summary message correctly for missed video calls', () => {
      const text = CallPersistenceService.formatCallMessageContent('video', 'missed', 0);
      expect(text).toBe('Missed video call');
    });

    it('formats summary message correctly for declined voice calls', () => {
      const text = CallPersistenceService.formatCallMessageContent('audio', 'declined', 0);
      expect(text).toBe('Declined voice call');
    });

    it('formats summary message correctly for completed long calls', () => {
      const text = CallPersistenceService.formatCallMessageContent('video', 'completed', 3725);
      expect(text).toBe('Video call · 1h 2m');
    });
  });

  // =========================================================================
  // 3. REST ENDPOINTS FOR CALL HISTORY & PAGINATION
  // =========================================================================
  describe('3. REST Call History Endpoints', () => {
    describe('GET /api/v1/calls/history', () => {
      it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
        const res = await request(app).get('/api/v1/calls/history');
        expect(res.status).toBe(401);
      });

      it('returns paginated call history for authenticated user', async () => {
        const mockCalls = [
          {
            id: 'c1',
            callId: 'call_1',
            caller: { name: 'Alice Smith', username: 'alicesmith' },
            recipient: { name: 'Bob Jones', username: 'bobjones' },
            callType: 'video',
            status: 'completed',
            duration: 154,
            createdAt: new Date(),
          },
          {
            id: 'c2',
            callId: 'call_2',
            caller: { name: 'Bob Jones', username: 'bobjones' },
            recipient: { name: 'Alice Smith', username: 'alicesmith' },
            callType: 'audio',
            status: 'missed',
            duration: 0,
            createdAt: new Date(),
          },
        ];

        vi.spyOn(CallPersistenceService, 'getUserCallHistory').mockResolvedValue({
          calls: mockCalls as any,
          pagination: {
            page: 1,
            limit: 20,
            total: 2,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        });

        const res = await request(app)
          .get('/api/v1/calls/history?page=1&limit=20')
          .set('Authorization', `Bearer ${tokenAlice}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.calls.length).toBe(2);
        expect(res.body.meta.total).toBe(2);
        expect(res.body.meta.page).toBe(1);
      });

      it('supports filtering call history by callType and status', async () => {
        const getUserCallHistorySpy = vi
          .spyOn(CallPersistenceService, 'getUserCallHistory')
          .mockResolvedValue({
            calls: [],
            pagination: {
              page: 1,
              limit: 20,
              total: 0,
              totalPages: 0,
              hasNext: false,
              hasPrev: false,
            },
          });

        const res = await request(app)
          .get('/api/v1/calls/history?callType=video&status=missed')
          .set('Authorization', `Bearer ${tokenAlice}`);

        expect(res.status).toBe(200);
        expect(getUserCallHistorySpy).toHaveBeenCalledWith(
          userAliceId,
          expect.objectContaining({
            callType: 'video',
            status: 'missed',
          })
        );
      });
    });

    describe('GET /api/v1/conversations/:id/calls', () => {
      it('returns paginated call history for authorized conversation participant', async () => {
        const mockConv: any = {
          _id: new mongoose.Types.ObjectId(convId),
          hasParticipant: (uid: string) => uid === userAliceId || uid === userBobId,
        };

        vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConv);
        vi.spyOn(CallPersistenceService, 'getConversationCallHistory').mockResolvedValue({
          calls: [
            {
              id: 'c1',
              callId: 'call_in_conv',
              callType: 'audio',
              status: 'completed',
              duration: 45,
            } as any,
          ],
          pagination: {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        });

        const res = await request(app)
          .get(`/api/v1/conversations/${convId}/calls`)
          .set('Authorization', `Bearer ${tokenAlice}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.calls.length).toBe(1);
      });

      it('blocks non-participant user from accessing conversation call logs with 403 FORBIDDEN', async () => {
        const mockConv: any = {
          _id: new mongoose.Types.ObjectId(convId),
          hasParticipant: (uid: string) => uid === userAliceId || uid === userBobId,
        };

        vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConv);

        const res = await request(app)
          .get(`/api/v1/conversations/${convId}/calls`)
          .set('Authorization', `Bearer ${tokenEve}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });
    });

    describe('GET /api/v1/calls/:id', () => {
      it('returns single call details when user is participant (caller or recipient)', async () => {
        const mockCall: any = {
          id: 'call_detail_1',
          callId: 'call_detail_1',
          caller: { _id: new mongoose.Types.ObjectId(userAliceId) },
          recipient: { _id: new mongoose.Types.ObjectId(userBobId) },
          callType: 'audio',
          status: 'completed',
          duration: 90,
        };

        vi.spyOn(CallPersistenceService, 'getCallById').mockResolvedValue(mockCall);

        const res = await request(app)
          .get('/api/v1/calls/call_detail_1')
          .set('Authorization', `Bearer ${tokenAlice}`);

        expect(res.status).toBe(200);
        expect(res.body.data.call.callId).toBe('call_detail_1');
      });

      it('rejects access to call record when user is an unrelated third party with 403 FORBIDDEN', async () => {
        const mockCall: any = {
          id: 'call_private_pair',
          callId: 'call_private_pair',
          caller: { _id: new mongoose.Types.ObjectId(userAliceId) },
          recipient: { _id: new mongoose.Types.ObjectId(userBobId) },
        };

        vi.spyOn(CallPersistenceService, 'getCallById').mockResolvedValue(mockCall);

        const res = await request(app)
          .get('/api/v1/calls/call_private_pair')
          .set('Authorization', `Bearer ${tokenEve}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('returns 404 NOT_FOUND for non-existent call record', async () => {
        vi.spyOn(CallPersistenceService, 'getCallById').mockResolvedValue(null);

        const res = await request(app)
          .get('/api/v1/calls/non_existent_call')
          .set('Authorization', `Bearer ${tokenAlice}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });
    });
  });
});

