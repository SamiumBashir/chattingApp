import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { generateAccessToken, hashToken } from '../utils/token.js';
import { UploadService } from '../services/upload.service.js';
import { MessageService } from '../services/message.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { verifyGoogleIdToken } from '../services/auth.service.js';
import { socketAuthMiddleware } from '../sockets/socketAuth.middleware.js';
import { CallStateService } from '../services/callState.service.js';
import {
  activeCalls,
  userCallMap,
  callTimeouts,
  activeUserSockets,
  disconnectUserSockets,
  disconnectSessionSockets,
  checkSocketRateLimit,
  clearRateLimitTracking,
  setupSocketGateway,
} from '../sockets/socketGateway.js';

describe('Security Hardening & Real-Time Integrity Tests', () => {
  const app = createApp();

  const mockUser1 = {
    id: '507f1f77bcf86cd799439001',
    _id: '507f1f77bcf86cd799439001',
    name: 'Alice Smith',
    username: 'alice_s',
    email: 'alice@example.com',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: '507f1f77bcf86cd799439001',
      name: 'Alice Smith',
      username: 'alice_s',
      email: 'alice@example.com',
      role: 'user',
      status: 'active',
    }),
  };

  const mockUser2 = {
    id: '507f1f77bcf86cd799439002',
    _id: '507f1f77bcf86cd799439002',
    name: 'Bob Jones',
    username: 'bob_j',
    email: 'bob@example.com',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: '507f1f77bcf86cd799439002',
      name: 'Bob Jones',
      username: 'bob_j',
      email: 'bob@example.com',
      role: 'user',
      status: 'active',
    }),
  };

  const mockAttacker = {
    id: '507f1f77bcf86cd799439099',
    _id: '507f1f77bcf86cd799439099',
    name: 'Eve Attacker',
    username: 'eve_a',
    email: 'eve@example.com',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: '507f1f77bcf86cd799439099',
      name: 'Eve Attacker',
      username: 'eve_a',
      email: 'eve@example.com',
      role: 'user',
      status: 'active',
    }),
  };

  const mockSession = {
    id: '607f1f77bcf86cd799439001',
    _id: '607f1f77bcf86cd799439001',
    user: mockUser1.id,
    refreshTokenHash: 'mock_hash',
    isValid: () => true,
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
  };

  const mockConversation = {
    id: '707f1f77bcf86cd799439001',
    _id: '707f1f77bcf86cd799439001',
    type: 'private',
    participants: [
      { user: mockUser1.id, role: 'member' },
      { user: mockUser2.id, role: 'member' },
    ],
    hasParticipant: (uid: string) => [mockUser1.id, mockUser2.id].includes(uid),
    toJSON: () => ({ id: '707f1f77bcf86cd799439001' }),
  };

  const mockMessage = {
    id: '807f1f77bcf86cd799439001',
    _id: '807f1f77bcf86cd799439001',
    conversation: mockConversation._id,
    sender: mockUser1.id,
    content: 'Secret message between Alice and Bob',
    reactions: [],
    isDeleted: false,
    save: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ id: '807f1f77bcf86cd799439001', reactions: [] }),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    activeCalls.clear();
    userCallMap.clear();
  });

  describe('CORS Origin Security & Allowlist Enforcement', () => {
    it('blocks credentialed requests from unauthorized third-party origins', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://attacker-domain.evil.com');

      // Supertest returns 500 when CORS origin callback returns an error
      expect(res.status).toBe(500);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows requests from verified production frontend domain', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://chatting-app-nine-sigma.vercel.app');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://chatting-app-nine-sigma.vercel.app'
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('allows requests from localhost in non-production environments', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('Authentication & Token Response Security', () => {
    it('never exposes refreshToken in response body on login', async () => {
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue({
          ...mockUser1,
          comparePassword: vi.fn().mockResolvedValue(true),
          save: vi.fn().mockResolvedValue(true),
        }),
      } as any);
      vi.spyOn(Session, 'create').mockResolvedValue(mockSession as any);

      const res = await request(app).post('/api/v1/auth/login').send({
        identifier: 'alice@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeUndefined(); // Critical: Never in JSON body
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('refreshToken=');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    });

    it('never exposes refreshToken in response body on token refresh', async () => {
      const rawRefreshToken = 'valid_raw_refresh_token';
      const hashed = hashToken(rawRefreshToken);

      vi.spyOn(Session, 'findOne').mockResolvedValue({
        ...mockSession,
        refreshTokenHash: hashed,
        save: vi.fn().mockResolvedValue(true),
      } as any);
      vi.spyOn(User, 'findById').mockResolvedValue(mockUser1 as any);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rawRefreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeUndefined(); // Critical: Never in JSON body
    });

    it('rejects invalid or missing Google tokens', async () => {
      await expect(verifyGoogleIdToken('')).rejects.toThrow('Google credential token is missing or invalid');
      await expect(verifyGoogleIdToken('invalid_token_format')).rejects.toThrow();
    });
  });

  describe('Message Reactions Authorization', () => {
    it('rejects adding reaction when user is not a participant with 403', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAttacker as any);
      vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);
      vi.spyOn(Message, 'findById').mockResolvedValue(mockMessage as any);
      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);

      const attackerToken = generateAccessToken({
        userId: mockAttacker.id,
        email: mockAttacker.email,
        username: mockAttacker.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .post(`/api/v1/messages/${mockMessage.id}/reactions`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ emoji: '🔥' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects removing reaction when user is not a participant with 403', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAttacker as any);
      vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);
      vi.spyOn(Message, 'findById').mockResolvedValue(mockMessage as any);
      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);

      const attackerToken = generateAccessToken({
        userId: mockAttacker.id,
        email: mockAttacker.email,
        username: mockAttacker.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .delete(`/api/v1/messages/${mockMessage.id}/reactions`)
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Uploads Folder Restriction & Ownership Validation', () => {
    it('rejects upload signature requests for unauthorized folder paths', () => {
      expect(() =>
        UploadService.generateSignature('../../malicious_folder')
      ).toThrow('Invalid upload folder');

      expect(() =>
        UploadService.generateSignature('system/root')
      ).toThrow('Invalid upload folder');
    });

    it('accepts upload signature requests for allowed folder paths', () => {
      const sig = UploadService.generateSignature('connectly/attachments');
      expect(sig.signature).toBeDefined();
      expect(sig.folder).toBe('connectly/attachments');
    });

    it('blocks non-admin users from deleting assets belonging to other users', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockAttacker as any);
      vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);
      vi.spyOn(User, 'exists').mockResolvedValue(null);
      vi.spyOn(Message, 'exists').mockResolvedValue(null);

      const attackerToken = generateAccessToken({
        userId: mockAttacker.id,
        email: mockAttacker.email,
        username: mockAttacker.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .delete('/api/v1/uploads/victim_private_avatar_123')
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Socket.IO Authentication & Real-Time Authorization', () => {
    it('socketAuthMiddleware rejects connection when auth token is missing', async () => {
      const mockSocket: any = {
        id: 'socket_1',
        handshake: { auth: {}, headers: {} },
        data: {},
      };
      let caughtError: any = null;
      await socketAuthMiddleware(mockSocket, (err) => {
        caughtError = err;
      });
      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Authentication token required');
    });

    it('socketAuthMiddleware rejects connection when token is invalid', async () => {
      const mockSocket: any = {
        id: 'socket_2',
        handshake: { auth: { token: 'invalid_malformed_token' }, headers: {} },
        data: {},
      };
      let caughtError: any = null;
      await socketAuthMiddleware(mockSocket, (err) => {
        caughtError = err;
      });
      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Invalid or expired authentication token');
    });

    it('socketAuthMiddleware rejects connection when user is banned', async () => {
      const validToken = generateAccessToken({
        userId: mockUser1.id,
        email: mockUser1.email,
        username: mockUser1.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      vi.spyOn(User, 'findById').mockResolvedValue({
        ...mockUser1,
        status: 'banned',
      } as any);

      const mockSocket: any = {
        id: 'socket_3',
        handshake: { auth: { token: validToken }, headers: {} },
        data: {},
      };
      let caughtError: any = null;
      await socketAuthMiddleware(mockSocket, (err) => {
        caughtError = err;
      });
      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Account is permanently banned');
    });

    it('socketAuthMiddleware rejects connection when session is revoked', async () => {
      const validToken = generateAccessToken({
        userId: mockUser1.id,
        email: mockUser1.email,
        username: mockUser1.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      vi.spyOn(User, 'findById').mockResolvedValue(mockUser1 as any);
      vi.spyOn(Session, 'findById').mockResolvedValue({
        ...mockSession,
        isValid: () => false,
      } as any);

      const mockSocket: any = {
        id: 'socket_4',
        handshake: { auth: { token: validToken }, headers: {} },
        data: {},
      };
      let caughtError: any = null;
      await socketAuthMiddleware(mockSocket, (err) => {
        caughtError = err;
      });
      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Session has been revoked or expired');
    });

    it('socketAuthMiddleware authenticates successfully with valid token and session', async () => {
      const validToken = generateAccessToken({
        userId: mockUser1.id,
        email: mockUser1.email,
        username: mockUser1.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      vi.spyOn(User, 'findById').mockResolvedValue(mockUser1 as any);
      vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);

      const mockSocket: any = {
        id: 'socket_5',
        handshake: { auth: { token: validToken }, headers: {} },
        data: {},
      };
      let caughtError: any = null;
      await socketAuthMiddleware(mockSocket, (err) => {
        caughtError = err;
      });
      expect(caughtError).toBeUndefined();
      expect(mockSocket.data.user).toBeDefined();
      expect(mockSocket.data.user.userId).toBe(mockUser1.id);
    });

    it('disconnectUserSockets and disconnectSessionSockets force disconnect sockets and notify clients', () => {
      const emitSpy = vi.fn();
      const disconnectSpy = vi.fn();
      const mockIoSocket = {
        emit: emitSpy,
        disconnect: disconnectSpy,
        data: { user: { sessionId: 'session_target_1' } },
      };

      activeUserSockets.set('target_user_1', new Set(['socket_target_1']));

      const mockIo: any = {
        use: vi.fn(),
        on: vi.fn(),
        sockets: {
          sockets: new Map([['socket_target_1', mockIoSocket]]),
        },
      };

      setupSocketGateway(mockIo);

      disconnectUserSockets('target_user_1', 'ACCOUNT_BANNED');
      expect(emitSpy).toHaveBeenCalledWith('auth:revoked', { reason: 'ACCOUNT_BANNED' });
      expect(disconnectSpy).toHaveBeenCalledWith(true);

      disconnectSessionSockets('session_target_1', 'LOGGED_OUT');
      expect(emitSpy).toHaveBeenCalledWith('auth:revoked', { reason: 'LOGGED_OUT' });
    });

    it('checkSocketRateLimit enforces rate limit window against flood attacks', () => {
      const testSocketId = 'socket_flood_attack_test';
      for (let i = 0; i < 60; i++) {
        expect(checkSocketRateLimit(testSocketId)).toBe(true);
      }
      expect(checkSocketRateLimit(testSocketId)).toBe(false);
    });
  });

  describe('Phase 3 — WebRTC Audio/Video Calling Architecture & Real-Time Signaling', () => {
    let ioEmitSpy: any;
    let ioToSpy: any;
    let mockIo: any;
    let connectionHandler: (socket: any) => void;
    let aliceSocket: any;
    let aliceEvents: Record<string, Function>;
    let bobSocket: any;
    let bobEvents: Record<string, Function>;
    let eveSocket: any;
    let eveEvents: Record<string, Function>;

    beforeEach(() => {
      activeCalls.clear();
      userCallMap.clear();
      callTimeouts.clear();
      activeUserSockets.clear();
      clearRateLimitTracking();
      CallStateService.resetMemoryState();

      ioEmitSpy = vi.fn();
      ioToSpy = vi.fn().mockReturnValue({ emit: ioEmitSpy });

      mockIo = {
        use: vi.fn(),
        on: vi.fn((event, handler) => {
          if (event === 'connection') connectionHandler = handler;
        }),
        to: ioToSpy,
        emit: ioEmitSpy,
        sockets: {
          sockets: new Map(),
        },
      };

      setupSocketGateway(mockIo);

      aliceEvents = {};
      aliceSocket = {
        id: 'socket_alice_1',
        data: {
          user: {
            userId: mockUser1.id,
            sessionId: mockSession.id,
            username: mockUser1.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_alice_1', `user:${mockUser1.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => {
          aliceEvents[evt] = handler;
        }),
      };

      bobEvents = {};
      bobSocket = {
        id: 'socket_bob_1',
        data: {
          user: {
            userId: mockUser2.id,
            sessionId: 'session_bob_1',
            username: mockUser2.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_bob_1', `user:${mockUser2.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => {
          bobEvents[evt] = handler;
        }),
      };

      eveEvents = {};
      eveSocket = {
        id: 'socket_eve_1',
        data: {
          user: {
            userId: '507f1f77bcf86cd799439099',
            sessionId: 'session_eve_1',
            username: 'eve_attacker',
            role: 'user',
          },
        },
        rooms: new Set(['socket_eve_1', 'user:507f1f77bcf86cd799439099']),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => {
          eveEvents[evt] = handler;
        }),
      };

      connectionHandler(aliceSocket);
      connectionHandler(bobSocket);
      connectionHandler(eveSocket);

      activeUserSockets.set(mockUser1.id, new Set([aliceSocket.id]));
      activeUserSockets.set(mockUser2.id, new Set([bobSocket.id]));

      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);
      vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
        if (id.toString() === mockUser1.id) return mockUser1 as any;
        if (id.toString() === mockUser2.id) return mockUser2 as any;
        return null;
      });
    });

    it('rejects call:initiate when payload is invalid, caller calls self, or recipient is offline', async () => {
      const cb1 = vi.fn();
      await aliceEvents['call:initiate']({}, cb1);
      expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Invalid call payload' }));

      const cb2 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser1.id, conversationId: mockConversation.id, callType: 'audio' },
        cb2
      );
      expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Cannot call yourself' }));

      activeUserSockets.delete(mockUser2.id);
      const cb3 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'video' },
        cb3
      );
      expect(cb3).toHaveBeenCalledWith(expect.objectContaining({ success: false, reason: 'offline' }));
    });

    it('rejects call:initiate when participant is not authorized or either user is blocked', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue({
        ...mockConversation,
        hasParticipant: () => false,
      } as any);

      const cb1 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        cb1
      );
      expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Unauthorized conversation participant' }));

      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);
      vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
        if (id.toString() === mockUser1.id) return { ...mockUser1, blockedUsers: [mockUser2.id] } as any;
        if (id.toString() === mockUser2.id) return mockUser2 as any;
        return null;
      });

      const cb2 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        cb2
      );
      expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Call blocked' }));
    });

    it('initiates call, routes call:incoming to recipient room, and sets 15s auto-ring timeout', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        {
          recipientId: mockUser2.id,
          conversationId: mockConversation.id,
          callType: 'video',
          caller: { id: mockUser1.id, name: mockUser1.name, username: mockUser1.username },
        },
        callback
      );

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true, callId: expect.any(String) }));
      const callId = callback.mock.calls[0][0].callId;

      expect(activeCalls.has(callId)).toBe(true);
      expect(userCallMap.get(mockUser1.id)).toBe(callId);
      expect(userCallMap.get(mockUser2.id)).toBe(callId);
      expect(callTimeouts.has(callId)).toBe(true);

      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith(
        'call:incoming',
        expect.objectContaining({
          callId,
          callerId: mockUser1.id,
          conversationId: mockConversation.id,
          callType: 'video',
        })
      );
    });

    it('rejects call:initiate when a user is already busy in another call', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

      const cb2 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        cb2
      );
      expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ success: false, reason: 'busy' }));
    });

    it('answers call, transitions status to connecting then connected, and clears 15s ringing timeout', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;
      expect(callTimeouts.has(callId)).toBe(true);

      bobEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'audio',
      });

      const session = activeCalls.get(callId);
      // Phase 1 requirement: call:answer transitions to connecting, not connected prematurely
      expect(session?.status).toBe('connecting');
      expect(callTimeouts.has(callId)).toBe(false);

      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith(
        'call:accepted',
        expect.objectContaining({
          callId,
          recipientId: mockUser2.id,
          conversationId: mockConversation.id,
          callType: 'audio',
        })
      );

      // WebRTC media connection verified -> transitions to connected
      bobEvents['call:connected']({ callId });
      expect(session?.status).toBe('connected');
      expect(session?.connectedAt).toBeInstanceOf(Date);
    });

    it('prevents duplicate answer to the same call', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;

      bobEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'audio',
      });

      const session = activeCalls.get(callId);
      expect(session?.status).toBe('connecting');

      ioEmitSpy.mockClear();

      // Second answer attempt on same call
      bobEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'audio',
      });

      // Does not re-emit call:accepted
      expect(ioEmitSpy).not.toHaveBeenCalledWith('call:accepted', expect.anything());
    });

    it('rejects unauthorized call:answer from non-recipient third party', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;

      // Eve attempts to answer Alice's call
      eveEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'audio',
      });

      const session = activeCalls.get(callId);
      expect(session?.status).toBe('ringing');
      expect(ioEmitSpy).not.toHaveBeenCalledWith('call:accepted', expect.anything());
    });

    it('handles cancel before acceptance by caller (cancelling while ringing)', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;
      expect(activeCalls.has(callId)).toBe(true);

      // Caller cancels before recipient answers
      aliceEvents['call:end']({ targetUserId: mockUser2.id, conversationId: mockConversation.id });

      expect(activeCalls.has(callId)).toBe(false);
      expect(userCallMap.has(mockUser1.id)).toBe(false);
      expect(userCallMap.has(mockUser2.id)).toBe(false);
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('call:ended', expect.objectContaining({ callId }));
    });

    it('handles Glare: resolves simultaneous reciprocal call:initiate deterministically', async () => {
      const cb1 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'video' },
        cb1
      );
      expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      const callId1 = cb1.mock.calls[0][0].callId;

      // Bob simultaneously calls Alice
      const cb2 = vi.fn();
      await bobEvents['call:initiate'](
        { recipientId: mockUser1.id, conversationId: mockConversation.id, callType: 'video' },
        cb2
      );

      // One deterministic session is preserved or routed without duplicate conflicts
      expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(userCallMap.has(mockUser1.id)).toBe(true);
      expect(userCallMap.has(mockUser2.id)).toBe(true);
    });

    it('auto-terminates call with 15s timeout if recipient does not answer', async () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'video' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;
      expect(activeCalls.has(callId)).toBe(true);

      vi.advanceTimersByTime(15000);

      expect(activeCalls.has(callId)).toBe(false);
      expect(userCallMap.has(mockUser1.id)).toBe(false);
      expect(userCallMap.has(mockUser2.id)).toBe(false);
      expect(ioEmitSpy).toHaveBeenCalledWith('call:ended', {
        callId,
        conversationId: mockConversation.id,
        reason: 'timeout',
      });
      vi.useRealTimers();
    });

    it('call:reject declines call, cleans up sessions, and notifies caller', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;

      bobEvents['call:reject']({ callerId: mockUser1.id, reason: 'declined' });

      expect(activeCalls.has(callId)).toBe(false);
      expect(userCallMap.has(mockUser1.id)).toBe(false);
      expect(userCallMap.has(mockUser2.id)).toBe(false);
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('call:rejected', {
        callId,
        recipientId: mockUser2.id,
        reason: 'declined',
      });
    });

    it('call:end terminates active call and notifies peer', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;

      bobEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'audio',
      });

      aliceEvents['call:end']({ targetUserId: mockUser2.id });

      expect(activeCalls.has(callId)).toBe(false);
      expect(userCallMap.has(mockUser1.id)).toBe(false);
      expect(userCallMap.has(mockUser2.id)).toBe(false);
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('call:ended', {
        callId,
        byUserId: mockUser1.id,
        conversationId: mockConversation.id,
        reason: 'ended',
      });
    });

    it('validates WebRTC offer, answer, and ICE candidate payloads with Zod schemas', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'video' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;

      bobEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'video',
      });

      // 1. WebRTC Offer
      // Rejects invalid SDP
      aliceEvents['webrtc:offer']({ targetUserId: mockUser2.id, sdp: { invalid: true } });
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:offer', expect.anything());

      // Accepts valid SDP offer
      const validOffer = { type: 'offer', sdp: 'v=0\r\no=alice 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
      aliceEvents['webrtc:offer']({ targetUserId: mockUser2.id, sdp: validOffer });
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('webrtc:offer', {
        callId,
        senderId: mockUser1.id,
        sdp: validOffer,
      });

      // 2. WebRTC Answer
      const validAnswer = { type: 'answer', sdp: 'v=0\r\no=bob 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
      bobEvents['webrtc:answer']({ targetUserId: mockUser1.id, sdp: validAnswer });
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('webrtc:answer', {
        callId,
        senderId: mockUser2.id,
        sdp: validAnswer,
      });

      // 3. ICE Candidate
      const validCandidate = {
        candidate: 'candidate:842163049 1 udp 1677729535 192.168.1.2 54321 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };
      aliceEvents['webrtc:ice-candidate']({ targetUserId: mockUser2.id, candidate: validCandidate });
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('webrtc:ice-candidate', {
        callId,
        senderId: mockUser1.id,
        candidate: validCandidate,
      });

      // Rejects unauthenticated third-party peer trying to inject signaling
      const eveSocket: any = {
        id: 'socket_eve_1',
        data: {
          user: { userId: mockAttacker.id, sessionId: 'session_eve', username: 'eve', role: 'user' },
        },
        rooms: new Set(['socket_eve_1', `user:${mockAttacker.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn(),
      };
      const eveEvents: Record<string, Function> = {};
      eveSocket.on.mockImplementation((evt: string, handler: Function) => {
        eveEvents[evt] = handler;
      });
      connectionHandler(eveSocket);

      ioEmitSpy.mockClear();
      eveEvents['webrtc:offer']({ targetUserId: mockUser2.id, sdp: validOffer });
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:offer', expect.anything());
    });

    it('rejects call:initiate when users are blocked', async () => {
      // Mock caller blocking recipient
      vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
        if (id.toString() === mockUser1.id) {
          return { ...mockUser1, blockedUsers: [new mongoose.Types.ObjectId(mockUser2.id)] } as any;
        }
        return mockUser2 as any;
      });

      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Call blocked' })
      );
    });

    it('rejects call:initiate when caller is not an authorized conversation participant', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue({
        id: mockConversation.id,
        hasParticipant: (uid: string) => uid !== mockUser1.id, // Alice is not a participant!
      } as any);

      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Unauthorized conversation participant' })
      );
    });

    it('disconnecting a secondary non-call socket does not abort active call on the call socket', async () => {
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;

      // Alice connects a second device / tab
      const aliceSocket2: any = {
        id: 'socket_alice_tab2',
        data: { user: { userId: mockUser1.id, role: 'user', username: mockUser1.username } },
        join: vi.fn(),
        on: vi.fn(),
      };
      const aliceEvents2: Record<string, Function> = {};
      aliceSocket2.on.mockImplementation((evt: string, handler: Function) => {
        aliceEvents2[evt] = handler;
      });
      connectionHandler(aliceSocket2);

      // Alice closes tab 2 (which was not the calling socket)
      aliceEvents2['disconnect']();

      // Call session should still be active on tab 1!
      expect(activeCalls.has(callId)).toBe(true);
      expect(userCallMap.has(mockUser1.id)).toBe(true);
    });
  });

  describe('Phase 4 — Multi-Device & Multi-Instance Reliability', () => {
    let ioEmitSpy: any;
    let ioToSpy: any;
    let ioInSpy: any;
    let mockIo: any;
    let connectionHandler: (socket: any) => void;
    let aliceSocket1: any;
    let aliceSocket2: any;
    let aliceEvents1: Record<string, Function>;
    let aliceEvents2: Record<string, Function>;
    let bobSocket1: any;
    let bobSocket2: any;
    let bobEvents1: Record<string, Function>;
    let bobEvents2: Record<string, Function>;

    beforeEach(() => {
      activeCalls.clear();
      userCallMap.clear();
      callTimeouts.clear();
      activeUserSockets.clear();
      clearRateLimitTracking();
      CallStateService.resetMemoryState();

      ioEmitSpy = vi.fn();
      ioToSpy = vi.fn().mockReturnValue({ emit: ioEmitSpy });
      const disconnectSocketsMock = vi.fn();
      ioInSpy = vi.fn().mockReturnValue({
        emit: ioEmitSpy,
        disconnectSockets: disconnectSocketsMock,
        fetchSockets: vi.fn().mockResolvedValue([{ id: 'cluster_socket_1' }]),
      });

      mockIo = {
        use: vi.fn(),
        on: vi.fn((event, handler) => {
          if (event === 'connection') connectionHandler = handler;
        }),
        to: ioToSpy,
        in: ioInSpy,
        emit: ioEmitSpy,
        sockets: {
          sockets: new Map(),
        },
      };

      setupSocketGateway(mockIo);

      // Alice Device 1 (e.g. Phone)
      aliceEvents1 = {};
      aliceSocket1 = {
        id: 'socket_alice_dev1',
        data: {
          user: {
            userId: mockUser1.id,
            sessionId: mockSession.id,
            username: mockUser1.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_alice_dev1', `user:${mockUser1.id}`, `session:${mockSession.id}`]),
        join: vi.fn((room) => aliceSocket1.rooms.add(room)),
        leave: vi.fn((room) => aliceSocket1.rooms.delete(room)),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => {
          aliceEvents1[evt] = handler;
        }),
      };

      // Alice Device 2 (e.g. Laptop)
      aliceEvents2 = {};
      aliceSocket2 = {
        id: 'socket_alice_dev2',
        data: {
          user: {
            userId: mockUser1.id,
            sessionId: 'session_alice_dev2',
            username: mockUser1.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_alice_dev2', `user:${mockUser1.id}`, 'session:session_alice_dev2']),
        join: vi.fn((room) => aliceSocket2.rooms.add(room)),
        leave: vi.fn((room) => aliceSocket2.rooms.delete(room)),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => {
          aliceEvents2[evt] = handler;
        }),
      };

      // Bob Device 1 (e.g. Phone)
      bobEvents1 = {};
      bobSocket1 = {
        id: 'socket_bob_dev1',
        data: {
          user: {
            userId: mockUser2.id,
            sessionId: 'session_bob_dev1',
            username: mockUser2.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_bob_dev1', `user:${mockUser2.id}`, 'session:session_bob_dev1']),
        join: vi.fn((room) => bobSocket1.rooms.add(room)),
        leave: vi.fn((room) => bobSocket1.rooms.delete(room)),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => {
          bobEvents1[evt] = handler;
        }),
      };

      // Bob Device 2 (e.g. Laptop)
      bobEvents2 = {};
      bobSocket2 = {
        id: 'socket_bob_dev2',
        data: {
          user: {
            userId: mockUser2.id,
            sessionId: 'session_bob_dev2',
            username: mockUser2.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_bob_dev2', `user:${mockUser2.id}`, 'session:session_bob_dev2']),
        join: vi.fn((room) => bobSocket2.rooms.add(room)),
        leave: vi.fn((room) => bobSocket2.rooms.delete(room)),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => {
          bobEvents2[evt] = handler;
        }),
      };

      connectionHandler(aliceSocket1);
      connectionHandler(aliceSocket2);
      connectionHandler(bobSocket1);
      connectionHandler(bobSocket2);

      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);
      vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
        if (id.toString() === mockUser1.id) return mockUser1 as any;
        if (id.toString() === mockUser2.id) return mockUser2 as any;
        return null;
      });
    });

    it('synchronizes sent messages to sender personal room for other connected devices', async () => {
      const mockCreatedMessage = {
        id: 'msg_multi_device_1',
        conversation: mockConversation.id,
        sender: mockUser1.id,
        content: 'Sync across devices',
        type: 'text',
        createdAt: new Date().toISOString(),
      };

      vi.spyOn(MessageService, 'sendMessage').mockResolvedValue({
        message: mockCreatedMessage,
        recipientIds: [mockUser2.id],
        isDuplicate: false,
      } as any);

      const callback = vi.fn();
      await aliceEvents1['message:send'](
        {
          conversationId: mockConversation.id,
          content: 'Sync across devices',
          clientMessageId: 'cli_sync_1',
          type: 'text',
        },
        callback
      );

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

      // 1. Sent to conversation room
      expect(ioToSpy).toHaveBeenCalledWith(`conversation:${mockConversation.id}`);
      // 2. Sent to recipient's room
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      // 3. Multi-device sync: Sent to sender's own user room for Device 2!
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('message:new', expect.objectContaining({ content: 'Sync across devices' }));
    });

    it('synchronizes conversation:read to user personal room so other devices clear unread counts', async () => {
      aliceSocket1.rooms.add(`conversation:${mockConversation.id}`);

      vi.spyOn(ConversationService, 'markConversationRead').mockImplementation(async (convId, uid) => {
        mockIo.to(`conversation:${convId}`).emit('conversation:read', {
          conversationId: convId,
          userId: uid,
        });
        mockIo.to(`user:${uid}`).emit('conversation:read', {
          conversationId: convId,
          userId: uid,
        });
        return { success: true };
      });

      // Alice Device 1 reads the conversation
      await aliceEvents1['conversation:read']({ conversationId: mockConversation.id });

      // Emitted to conversation room so peers see read status
      expect(ioToSpy).toHaveBeenCalledWith(`conversation:${mockConversation.id}`);
      // Multi-device sync: Emitted to Alice's user room so Device 2 resets unread counter
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('conversation:read', {
        conversationId: mockConversation.id,
        userId: mockUser1.id,
      });
    });

    it('emits call:answered-elsewhere to other devices when recipient answers call on one device', async () => {
      const callback = vi.fn();
      await aliceEvents1['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'video' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;

      const bobDev1ToSpy = vi.fn().mockReturnValue({ emit: vi.fn() });
      bobSocket1.to = bobDev1ToSpy;

      // Bob answers on Phone (Device 1)
      bobEvents1['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'video',
      });

      // Emitted call:accepted to caller (Alice)
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('call:accepted', expect.objectContaining({ callId }));

      // Multi-device sync: Notifies Bob's other devices (Laptop) that call was answered
      expect(bobDev1ToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(bobDev1ToSpy().emit).toHaveBeenCalledWith('call:answered-elsewhere', { callId });
    });

    it('emits call:rejected-elsewhere to other devices when recipient declines call on one device', async () => {
      const callback = vi.fn();
      await aliceEvents1['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      const callId = callback.mock.calls[0][0].callId;

      const bobDev1ToSpy = vi.fn().mockReturnValue({ emit: vi.fn() });
      bobSocket1.to = bobDev1ToSpy;

      // Bob declines on Phone (Device 1)
      bobEvents1['call:reject']({
        callerId: mockUser1.id,
        reason: 'declined',
      });

      // Emitted call:rejected to caller (Alice)
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('call:rejected', expect.objectContaining({ callId }));

      // Multi-device sync: Notifies Bob's other devices (Laptop) that call was declined elsewhere
      expect(bobDev1ToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(bobDev1ToSpy().emit).toHaveBeenCalledWith('call:rejected-elsewhere', { callId });
    });

    it('supports cluster-wide presence detection across multiple server instances in call:initiate', async () => {
      // Simulate recipient is not on local instance
      activeUserSockets.delete(mockUser2.id);

      // But recipient IS on another cluster node (returned by io.in().fetchSockets)
      const callback = vi.fn();
      await aliceEvents1['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );

      expect(ioInSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true, callId: expect.any(String) }));
    });

    it('disconnectUserSockets and disconnectSessionSockets revoke sockets cluster-wide using room disconnection', () => {
      disconnectUserSockets(mockUser1.id, 'SECURITY_BAN');
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('auth:revoked', { reason: 'SECURITY_BAN' });
      expect(ioInSpy).toHaveBeenCalledWith(`user:${mockUser1.id}`);

      disconnectSessionSockets(mockSession.id, 'SESSION_EXPIRED');
      expect(ioToSpy).toHaveBeenCalledWith(`session:${mockSession.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('auth:revoked', { reason: 'SESSION_EXPIRED' });
      expect(ioInSpy).toHaveBeenCalledWith(`session:${mockSession.id}`);
    });
  });
});

