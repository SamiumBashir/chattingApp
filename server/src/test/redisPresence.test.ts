import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallStateService, ActiveCallSession } from '../services/callState.service.js';
import { setRedisClientForTesting } from '../config/redis.js';

describe('Phase 4 — Redis-Based Presence & Multi-Device Call State', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset to clean in-memory fallback state before each test
    setRedisClientForTesting(null);
    CallStateService.resetMemoryState();
  });

  describe('1. Multi-Device Presence & Socket Tracking', () => {
    const userId = 'user_multi_device_101';

    it('tracks multiple devices per user account and only broadcasts online on the first connection', async () => {
      // 1. First device connects (e.g. Laptop)
      const dev1 = await CallStateService.addSocket(userId, 'socket_laptop_1', 'session_1');
      expect(dev1.isFirstSocket).toBe(true);
      expect(dev1.totalSockets).toBe(1);

      // 2. Second device connects (e.g. Mobile phone)
      const dev2 = await CallStateService.addSocket(userId, 'socket_mobile_2', 'session_2');
      expect(dev2.isFirstSocket).toBe(false);
      expect(dev2.totalSockets).toBe(2);

      // Verify all active sockets are tracked
      const sockets = await CallStateService.getUserSockets(userId);
      expect(sockets).toContain('socket_laptop_1');
      expect(sockets).toContain('socket_mobile_2');
      expect(sockets.length).toBe(2);

      // User is verified online
      const online = await CallStateService.isUserOnline(userId);
      expect(online).toBe(true);
    });

    it('disconnecting one device does NOT mark user offline while another device remains active', async () => {
      await CallStateService.addSocket(userId, 'socket_laptop_1', 'session_1');
      await CallStateService.addSocket(userId, 'socket_mobile_2', 'session_2');

      // Laptop disconnects
      const removeResult = await CallStateService.removeSocket(userId, 'socket_laptop_1');
      expect(removeResult.isLastSocket).toBe(false);
      expect(removeResult.remainingSockets).toBe(1);

      // User remains online via Mobile
      const online = await CallStateService.isUserOnline(userId);
      expect(online).toBe(true);

      const remainingSockets = await CallStateService.getUserSockets(userId);
      expect(remainingSockets).toEqual(['socket_mobile_2']);
    });

    it('marks user offline only when all devices have disconnected', async () => {
      await CallStateService.addSocket(userId, 'socket_laptop_1', 'session_1');
      await CallStateService.addSocket(userId, 'socket_mobile_2', 'session_2');

      // Disconnect first device
      await CallStateService.removeSocket(userId, 'socket_laptop_1');

      // Disconnect second (last) device
      const removeResult2 = await CallStateService.removeSocket(userId, 'socket_mobile_2');
      expect(removeResult2.isLastSocket).toBe(true);
      expect(removeResult2.remainingSockets).toBe(0);

      // User is now offline
      const online = await CallStateService.isUserOnline(userId);
      expect(online).toBe(false);

      const sockets = await CallStateService.getUserSockets(userId);
      expect(sockets.length).toBe(0);
    });

    it('recovers online presence when a user reconnects after complete disconnection', async () => {
      await CallStateService.addSocket(userId, 'socket_temp_1');
      await CallStateService.removeSocket(userId, 'socket_temp_1');
      expect(await CallStateService.isUserOnline(userId)).toBe(false);

      // User reconnects
      const reconnectResult = await CallStateService.addSocket(userId, 'socket_reconnected_2');
      expect(reconnectResult.isFirstSocket).toBe(true);
      expect(await CallStateService.isUserOnline(userId)).toBe(true);
    });

    it('queries presence across multiple users in one call (batch presence check)', async () => {
      const userA = 'user_presence_a';
      const userB = 'user_presence_b';
      const userC = 'user_presence_c';

      await CallStateService.addSocket(userA, 'socket_a');
      await CallStateService.addSocket(userB, 'socket_b');

      const presenceMap = await CallStateService.getUsersPresence([userA, userB, userC]);
      expect(presenceMap[userA]).toBe(true);
      expect(presenceMap[userB]).toBe(true);
      expect(presenceMap[userC]).toBe(false);
    });
  });

  describe('2. Distributed Call State & Multi-Device Coordination', () => {
    const callerId = 'user_caller_301';
    const recipientId = 'user_recipient_302';
    const callId = 'call_cluster_test_999';

    const testSession: ActiveCallSession = {
      callId,
      callerId,
      callerSocketId: 'socket_caller_desktop',
      recipientId,
      conversationId: 'conv_123',
      callType: 'video',
      status: 'ringing',
      startedAt: new Date().toISOString(),
    };

    it('initiates and registers active call state with user mappings', async () => {
      const result = await CallStateService.initiateCall(testSession);
      expect(result.success).toBe(true);
      expect(result.session?.callId).toBe(callId);

      const session = await CallStateService.getCallSession(callId);
      expect(session).toBeDefined();
      expect(session?.status).toBe('ringing');

      // Both users are mapped to the active call
      expect(await CallStateService.getUserCallId(callerId)).toBe(callId);
      expect(await CallStateService.getUserCallId(recipientId)).toBe(callId);
    });

    it('prevents initiating a call when the recipient is already busy on another call', async () => {
      await CallStateService.initiateCall(testSession);

      // Third-party caller attempts to call the busy recipient
      const thirdPartySession: ActiveCallSession = {
        callId: 'call_collision_888',
        callerId: 'user_attacker_303',
        recipientId,
        conversationId: 'conv_456',
        callType: 'audio',
        status: 'ringing',
        startedAt: new Date().toISOString(),
      };

      const result = await CallStateService.initiateCall(thirdPartySession);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('busy');
    });

    it('atomicAcceptCall accepts ringing call and rejects duplicate answers from another device or cluster instance', async () => {
      await CallStateService.initiateCall(testSession);

      // Recipient answers from Mobile (device 1)
      const firstAnswer = await CallStateService.atomicAcceptCall(callId, recipientId, 'socket_recipient_mobile');
      expect(firstAnswer.success).toBe(true);
      expect(firstAnswer.session?.status).toBe('connecting');
      expect(firstAnswer.session?.recipientSocketId).toBe('socket_recipient_mobile');

      // Recipient clicks answer simultaneously on Laptop (device 2) or clustered duplicate
      const duplicateAnswer = await CallStateService.atomicAcceptCall(callId, recipientId, 'socket_recipient_laptop');
      expect(duplicateAnswer.success).toBe(false);
      expect(duplicateAnswer.reason).toBe('already_answered');

      // Unauthorized third-party attempts to answer
      const unauthorizedAnswer = await CallStateService.atomicAcceptCall(callId, 'user_impostor_999', 'socket_impostor');
      expect(unauthorizedAnswer.success).toBe(false);
      expect(unauthorizedAnswer.reason).toBe('unauthorized');
    });

    it('transitions call to connected once WebRTC media links', async () => {
      await CallStateService.initiateCall(testSession);
      await CallStateService.atomicAcceptCall(callId, recipientId, 'socket_recipient_mobile');

      const connectedSession = await CallStateService.markCallConnected(callId);
      expect(connectedSession?.status).toBe('connected');
      expect(connectedSession?.connectedAt).toBeDefined();

      const retrieved = await CallStateService.getCallSession(callId);
      expect(retrieved?.status).toBe('connected');
    });

    it('ends call cleanly and unbinds user-to-call mappings', async () => {
      await CallStateService.initiateCall(testSession);
      await CallStateService.endCall(callId, 'user_ended');

      expect(await CallStateService.getUserCallId(callerId)).toBeNull();
      expect(await CallStateService.getUserCallId(recipientId)).toBeNull();
    });
  });

  describe('3. Redis Client Integration & Clustered Lua Script Semantics', () => {
    it('executes atomic acceptance via Redis eval Lua script when Redis client is provided', async () => {
      // Mock Redis instance conforming to ioredis interface
      const mockStorage = new Map<string, string>();
      const mockRedis: any = {
        status: 'ready',
        get: vi.fn(async (key: string) => mockStorage.get(key) || null),
        set: vi.fn(async (key: string, val: string) => {
          mockStorage.set(key, val);
          return 'OK';
        }),
        del: vi.fn(async (key: string) => {
          mockStorage.delete(key);
          return 1;
        }),
        eval: vi.fn(async (_script: string, _numkeys: number, key: string, recipientId: string, socketId: string) => {
          const raw = mockStorage.get(key);
          if (!raw) return JSON.stringify({ success: false, reason: 'not_found' });
          const session = JSON.parse(raw);
          if (session.recipientId !== recipientId) {
            return JSON.stringify({ success: false, reason: 'unauthorized' });
          }
          if (session.status !== 'ringing') {
            return JSON.stringify({ success: false, reason: 'already_answered', status: session.status });
          }
          session.status = 'connecting';
          session.recipientSocketId = socketId;
          mockStorage.set(key, JSON.stringify(session));
          return JSON.stringify({ success: true, session });
        }),
        pipeline: () => {
          const commands: Function[] = [];
          const chain = {
            set: (k: string, v: string) => {
              commands.push(() => mockStorage.set(k, v));
              return chain;
            },
            del: (k: string) => {
              commands.push(() => mockStorage.delete(k));
              return chain;
            },
            exec: async () => {
              commands.forEach((c) => c());
              return [];
            },
          };
          return chain;
        },
      };

      setRedisClientForTesting(mockRedis);

      const session: ActiveCallSession = {
        callId: 'call_redis_eval_1',
        callerId: 'caller_1',
        recipientId: 'recipient_1',
        conversationId: 'conv_1',
        callType: 'audio',
        status: 'ringing',
        startedAt: new Date().toISOString(),
      };

      // Pre-seed in mock redis
      mockStorage.set('call:session:call_redis_eval_1', JSON.stringify(session));

      // 1. First acceptance succeeds via atomic Lua
      const firstResult = await CallStateService.atomicAcceptCall('call_redis_eval_1', 'recipient_1', 'socket_client_a');
      expect(firstResult.success).toBe(true);
      expect(firstResult.session?.status).toBe('connecting');
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);

      // 2. Duplicate answer rejected by Lua script
      const duplicateResult = await CallStateService.atomicAcceptCall('call_redis_eval_1', 'recipient_1', 'socket_client_b');
      expect(duplicateResult.success).toBe(false);
      expect(duplicateResult.reason).toBe('already_answered');
      expect(mockRedis.eval).toHaveBeenCalledTimes(2);
    });
  });
});

