import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Conversation } from '../models/Conversation.js';
import { generateAccessToken } from '../utils/token.js';
import { socketAuthMiddleware } from '../sockets/socketAuth.middleware.js';
import { CallStateService } from '../services/callState.service.js';
import {
  activeCalls,
  userCallMap,
  callTimeouts,
  activeUserSockets,
  setupSocketGateway,
  checkCallInitiateRateLimit,
  checkSignalingRateLimit,
  clearRateLimitTracking,
} from '../sockets/socketGateway.js';

describe('Phase 5 — Backend Call Authorization & Security', () => {
  const mockUser1 = {
    id: '507f1f77bcf86cd799439001',
    _id: '507f1f77bcf86cd799439001',
    name: 'Alice Smith',
    username: 'alice_s',
    email: 'alice@example.com',
    role: 'user',
    status: 'active',
    blockedUsers: [] as mongoose.Types.ObjectId[],
  };

  const mockUser2 = {
    id: '507f1f77bcf86cd799439002',
    _id: '507f1f77bcf86cd799439002',
    name: 'Bob Jones',
    username: 'bob_j',
    email: 'bob@example.com',
    role: 'user',
    status: 'active',
    blockedUsers: [] as mongoose.Types.ObjectId[],
  };

  const mockAttacker = {
    id: '507f1f77bcf86cd799439099',
    _id: '507f1f77bcf86cd799439099',
    name: 'Eve Attacker',
    username: 'eve_attacker',
    email: 'eve@evil.com',
    role: 'user',
    status: 'active',
    blockedUsers: [] as mongoose.Types.ObjectId[],
  };

  const mockSession = {
    id: '607f1f77bcf86cd799439001',
    _id: '607f1f77bcf86cd799439001',
    user: mockUser1.id,
    isValid: () => true,
    expiresAt: new Date(Date.now() + 86400000),
  };

  const mockConversation = {
    id: '707f1f77bcf86cd799439001',
    _id: '707f1f77bcf86cd799439001',
    type: 'direct',
    participants: [
      { user: mockUser1.id, role: 'member' },
      { user: mockUser2.id, role: 'member' },
    ],
    hasParticipant: (userId: string) => userId === mockUser1.id || userId === mockUser2.id,
  };

  describe('1. Socket Authentication & Session Verification', () => {
    it('rejects connection when auth token is completely missing', async () => {
      const mockSocket: any = {
        id: 'sock_unauth_1',
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

    it('rejects connection when auth token is malformed or invalid signature', async () => {
      const mockSocket: any = {
        id: 'sock_invalid_token',
        handshake: { auth: { token: 'ey.invalid.signature' }, headers: {} },
        data: {},
      };
      let caughtError: any = null;
      await socketAuthMiddleware(mockSocket, (err) => {
        caughtError = err;
      });
      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Invalid or expired authentication token');
    });

    it('rejects connection when access token has expired', async () => {
      const expiredToken = jwt.sign(
        {
          userId: mockUser1.id,
          username: mockUser1.username,
          email: mockUser1.email,
          role: 'user',
          sessionId: mockSession.id,
        },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '-1s' }
      );

      const mockSocket: any = {
        id: 'sock_expired_token',
        handshake: { auth: { token: expiredToken }, headers: {} },
        data: {},
      };
      let caughtError: any = null;
      await socketAuthMiddleware(mockSocket, (err) => {
        caughtError = err;
      });
      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Invalid or expired authentication token');
    });

    it('rejects connection when user session in database is revoked or expired', async () => {
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
        id: 'sock_revoked_session',
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

    it('rejects connection when user account is banned or suspended', async () => {
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
        id: 'sock_banned_user',
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
  });

  describe('2. Call Initiation Authorization, Spoof Prevention & Schema Enforcement', () => {
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
        id: 'socket_alice_auth',
        data: {
          user: {
            userId: mockUser1.id,
            sessionId: mockSession.id,
            username: mockUser1.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_alice_auth', `user:${mockUser1.id}`]),
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
        id: 'socket_bob_auth',
        data: {
          user: {
            userId: mockUser2.id,
            sessionId: 'session_bob_auth',
            username: mockUser2.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_bob_auth', `user:${mockUser2.id}`]),
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
        id: 'socket_eve_auth',
        data: {
          user: {
            userId: mockAttacker.id,
            sessionId: 'session_eve_auth',
            username: mockAttacker.username,
            role: 'user',
          },
        },
        rooms: new Set(['socket_eve_auth', `user:${mockAttacker.id}`]),
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
      activeUserSockets.set(mockAttacker.id, new Set([eveSocket.id]));

      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);
      vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
        if (id.toString() === mockUser1.id) return mockUser1 as any;
        if (id.toString() === mockUser2.id) return mockUser2 as any;
        if (id.toString() === mockAttacker.id) return mockAttacker as any;
        return null;
      });
    });

    it('rejects call:initiate when caller is not an authorized member of conversation', async () => {
      // Eve attempts to call Bob in Alice and Bob's private conversation
      const callback = vi.fn();
      await eveEvents['call:initiate'](
        {
          recipientId: mockUser2.id,
          conversationId: mockConversation.id,
          callType: 'audio',
        },
        callback
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized conversation participant',
      });
      expect(activeCalls.size).toBe(0);
    });

    it('rejects call:initiate when recipient is not a member of conversation', async () => {
      // Alice attempts to call Eve in Alice and Bob's private conversation
      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        {
          recipientId: mockAttacker.id,
          conversationId: mockConversation.id,
          callType: 'audio',
        },
        callback
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized conversation participant',
      });
      expect(activeCalls.size).toBe(0);
    });

    it('prevents caller ID spoofing: server strictly overrides client-supplied caller object', async () => {
      const callback = vi.fn();
      // Alice calls Bob, but malicious client attempts to spoof caller profile as Eve or Admin
      await aliceEvents['call:initiate'](
        {
          recipientId: mockUser2.id,
          conversationId: mockConversation.id,
          callType: 'video',
          caller: {
            id: mockAttacker.id, // FORGED ID
            name: 'System Administrator',
            username: 'admin',
          },
        },
        callback
      );

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      const callId = callback.mock.calls[0][0].callId;

      // Active session in server memory must strictly attribute Alice as the caller
      const session = activeCalls.get(callId);
      expect(session?.callerId).toBe(mockUser1.id);

      // Emitted call:incoming to Bob must contain Alice's verified profile, NEVER the forged ID
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith(
        'call:incoming',
        expect.objectContaining({
          callId,
          callerId: mockUser1.id,
          caller: expect.objectContaining({
            id: mockUser1.id,
            name: mockUser1.name,
            username: mockUser1.username,
          }),
        })
      );
    });

    it('rejects call:initiate with malformed schemas or non-ObjectId values', async () => {
      const cb1 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: 'not-a-mongo-id', conversationId: mockConversation.id, callType: 'audio' },
        cb1
      );
      expect(cb1).toHaveBeenCalledWith({ success: false, error: 'Invalid call payload' });

      const cb2 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: 'invalid-conv-id', callType: 'audio' },
        cb2
      );
      expect(cb2).toHaveBeenCalledWith({ success: false, error: 'Invalid call payload' });

      const cb3 = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'hologram' }, // Invalid enum
        cb3
      );
      expect(cb3).toHaveBeenCalledWith({ success: false, error: 'Invalid call payload' });
    });

    it('enforces call initiation rate limiting against call spam / ringing DoS', async () => {
      // 5 calls permitted within window
      for (let i = 0; i < 5; i++) {
        expect(checkCallInitiateRateLimit(aliceSocket.id)).toBe(true);
      }
      // 6th call attempt violates rate limit
      expect(checkCallInitiateRateLimit(aliceSocket.id)).toBe(false);

      const callback = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        callback
      );
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Rate limit exceeded' });
    });
  });

  describe('3. Call Answer, Reject & Termination Security', () => {
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

    beforeEach(async () => {
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
        id: 'socket_alice_part3',
        data: { user: { userId: mockUser1.id, sessionId: mockSession.id, username: mockUser1.username, role: 'user' } },
        rooms: new Set(['socket_alice_part3', `user:${mockUser1.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => { aliceEvents[evt] = handler; }),
      };

      bobEvents = {};
      bobSocket = {
        id: 'socket_bob_part3',
        data: { user: { userId: mockUser2.id, sessionId: 'session_bob_part3', username: mockUser2.username, role: 'user' } },
        rooms: new Set(['socket_bob_part3', `user:${mockUser2.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => { bobEvents[evt] = handler; }),
      };

      eveEvents = {};
      eveSocket = {
        id: 'socket_eve_part3',
        data: { user: { userId: mockAttacker.id, sessionId: 'session_eve_part3', username: mockAttacker.username, role: 'user' } },
        rooms: new Set(['socket_eve_part3', `user:${mockAttacker.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => { eveEvents[evt] = handler; }),
      };

      connectionHandler(aliceSocket);
      connectionHandler(bobSocket);
      connectionHandler(eveSocket);

      activeUserSockets.set(mockUser1.id, new Set([aliceSocket.id]));
      activeUserSockets.set(mockUser2.id, new Set([bobSocket.id]));
      activeUserSockets.set(mockAttacker.id, new Set([eveSocket.id]));

      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);
      vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
        if (id.toString() === mockUser1.id) return mockUser1 as any;
        if (id.toString() === mockUser2.id) return mockUser2 as any;
        if (id.toString() === mockAttacker.id) return mockAttacker as any;
        return null;
      });
    });

    it('rejects call:answer from an unauthorized third party (Eve attempting to intercept Bob call)', async () => {
      const cb = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'video' },
        cb
      );
      const callId = cb.mock.calls[0][0].callId;

      ioEmitSpy.mockClear();

      // Eve attempts to answer Alice's call
      const eveAnswerCb = vi.fn();
      eveEvents['call:answer'](
        { callerId: mockUser1.id, conversationId: mockConversation.id, callType: 'video', callId },
        eveAnswerCb
      );

      // Call session should still remain ringing for Bob!
      const session = activeCalls.get(callId);
      expect(session?.status).toBe('ringing');
      expect(ioEmitSpy).not.toHaveBeenCalledWith('call:accepted', expect.anything());
    });

    it('rejects call:answer with mismatched or invalid callId', async () => {
      const cb = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        cb
      );
      const callId = cb.mock.calls[0][0].callId;

      ioEmitSpy.mockClear();

      const answerCb = vi.fn();
      // Bob attempts to answer with a forged/mismatched callId
      bobEvents['call:answer'](
        {
          callerId: mockUser1.id,
          conversationId: mockConversation.id,
          callType: 'audio',
          callId: 'call_forged_999999_fake',
        },
        answerCb
      );

      expect(answerCb).toHaveBeenCalledWith({ success: false, error: 'Invalid call ID' });
      expect(activeCalls.get(callId)?.status).toBe('ringing');
      expect(ioEmitSpy).not.toHaveBeenCalledWith('call:accepted', expect.anything());
    });

    it('rejects unauthorized third party from ending another users call', async () => {
      const cb = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        cb
      );
      const callId = cb.mock.calls[0][0].callId;

      bobEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'audio',
      });
      expect(activeCalls.get(callId)?.status).toBe('connecting');

      ioEmitSpy.mockClear();

      // Eve attempts to terminate Alice and Bob's call
      const endCb = vi.fn();
      eveEvents['call:end']({ callId }, endCb);

      // Session must remain intact
      expect(activeCalls.has(callId)).toBe(true);
      expect(ioEmitSpy).not.toHaveBeenCalledWith('call:ended', expect.anything());
    });

    it('authoritative call termination: routes call:ended strictly to session peer even with forged targetUserId', async () => {
      const cb = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'audio' },
        cb
      );
      const callId = cb.mock.calls[0][0].callId;

      bobEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'audio',
      });

      ioEmitSpy.mockClear();
      ioToSpy.mockClear();

      // Alice ends call, but client passes forged targetUserId pointing to Eve
      aliceEvents['call:end']({ targetUserId: mockAttacker.id, callId });

      // Must be routed strictly to Bob (mockUser2.id), NEVER Eve!
      expect(ioToSpy).toHaveBeenCalledWith(`user:${mockUser2.id}`);
      expect(ioToSpy).not.toHaveBeenCalledWith(`user:${mockAttacker.id}`);
      expect(ioEmitSpy).toHaveBeenCalledWith('call:ended', expect.objectContaining({ callId }));
    });
  });

  describe('4. WebRTC Signaling Security, Anti-Replay & Rate Limiting', () => {
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
    let callId: string;

    const validOffer = { type: 'offer', sdp: 'v=0\r\no=alice 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    const validAnswer = { type: 'answer', sdp: 'v=0\r\no=bob 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    const validCandidate = {
      candidate: 'candidate:842163049 1 udp 1677729535 192.168.1.2 54321 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    };

    beforeEach(async () => {
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
        id: 'socket_alice_sig',
        data: { user: { userId: mockUser1.id, sessionId: mockSession.id, username: mockUser1.username, role: 'user' } },
        rooms: new Set(['socket_alice_sig', `user:${mockUser1.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => { aliceEvents[evt] = handler; }),
      };

      bobEvents = {};
      bobSocket = {
        id: 'socket_bob_sig',
        data: { user: { userId: mockUser2.id, sessionId: 'session_bob_sig', username: mockUser2.username, role: 'user' } },
        rooms: new Set(['socket_bob_sig', `user:${mockUser2.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => { bobEvents[evt] = handler; }),
      };

      eveEvents = {};
      eveSocket = {
        id: 'socket_eve_sig',
        data: { user: { userId: mockAttacker.id, sessionId: 'session_eve_sig', username: mockAttacker.username, role: 'user' } },
        rooms: new Set(['socket_eve_sig', `user:${mockAttacker.id}`]),
        join: vi.fn(),
        leave: vi.fn(),
        emit: vi.fn(),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        on: vi.fn((evt, handler) => { eveEvents[evt] = handler; }),
      };

      connectionHandler(aliceSocket);
      connectionHandler(bobSocket);
      connectionHandler(eveSocket);

      activeUserSockets.set(mockUser1.id, new Set([aliceSocket.id]));
      activeUserSockets.set(mockUser2.id, new Set([bobSocket.id]));
      activeUserSockets.set(mockAttacker.id, new Set([eveSocket.id]));

      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);
      vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
        if (id.toString() === mockUser1.id) return mockUser1 as any;
        if (id.toString() === mockUser2.id) return mockUser2 as any;
        if (id.toString() === mockAttacker.id) return mockAttacker as any;
        return null;
      });

      const cb = vi.fn();
      await aliceEvents['call:initiate'](
        { recipientId: mockUser2.id, conversationId: mockConversation.id, callType: 'video' },
        cb
      );
      callId = cb.mock.calls[0][0].callId;
      bobEvents['call:answer']({
        callerId: mockUser1.id,
        conversationId: mockConversation.id,
        callType: 'video',
        callId,
      });
      ioEmitSpy.mockClear();
    });

    it('rejects webrtc:offer when client specifies a forged targetUserId not in call session', () => {
      // Alice attempts to send offer with targetUserId pointing to Eve
      aliceEvents['webrtc:offer']({
        targetUserId: mockAttacker.id,
        sdp: validOffer,
        callId,
      });

      // Must be dropped and not broadcast to Eve
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:offer', expect.anything());
    });

    it('rejects webrtc:offer when client specifies an invalid or mismatched callId', () => {
      aliceEvents['webrtc:offer']({
        targetUserId: mockUser2.id,
        sdp: validOffer,
        callId: 'call_mismatched_id_123',
      });

      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:offer', expect.anything());
    });

    it('rejects webrtc:answer when client specifies a forged targetUserId or invalid callId', () => {
      bobEvents['webrtc:answer']({
        targetUserId: mockAttacker.id,
        sdp: validAnswer,
        callId,
      });
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:answer', expect.anything());

      bobEvents['webrtc:answer']({
        targetUserId: mockUser1.id,
        sdp: validAnswer,
        callId: 'call_wrong_id_456',
      });
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:answer', expect.anything());
    });

    it('rejects webrtc:ice-candidate when client specifies a forged targetUserId or invalid callId', () => {
      aliceEvents['webrtc:ice-candidate']({
        targetUserId: mockAttacker.id,
        candidate: validCandidate,
        callId,
      });
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:ice-candidate', expect.anything());

      aliceEvents['webrtc:ice-candidate']({
        targetUserId: mockUser2.id,
        candidate: validCandidate,
        callId: 'call_invalid_id',
      });
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:ice-candidate', expect.anything());
    });

    it('anti-replay: rejects signaling events once call session has ended', () => {
      aliceEvents['call:end']({ callId });

      ioEmitSpy.mockClear();

      // Attempting to send offer, answer, or candidate after call ended
      aliceEvents['webrtc:offer']({ targetUserId: mockUser2.id, sdp: validOffer, callId });
      bobEvents['webrtc:answer']({ targetUserId: mockUser1.id, sdp: validAnswer, callId });
      aliceEvents['webrtc:ice-candidate']({ targetUserId: mockUser2.id, candidate: validCandidate, callId });

      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:offer', expect.anything());
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:answer', expect.anything());
      expect(ioEmitSpy).not.toHaveBeenCalledWith('webrtc:ice-candidate', expect.anything());
    });

    it('enforces signaling rate limiting against signaling message floods', () => {
      for (let i = 0; i < 100; i++) {
        expect(checkSignalingRateLimit(aliceSocket.id)).toBe(true);
      }
      // 101st signaling event in 5s window is blocked
      expect(checkSignalingRateLimit(aliceSocket.id)).toBe(false);

      ioEmitSpy.mockClear();
      aliceEvents['webrtc:offer']({ targetUserId: mockUser2.id, sdp: validOffer, callId });
      expect(ioEmitSpy).not.toHaveBeenCalled();
    });
  });
});

