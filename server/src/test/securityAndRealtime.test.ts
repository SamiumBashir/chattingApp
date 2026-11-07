import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { generateAccessToken, hashToken } from '../utils/token.js';
import { UploadService } from '../services/upload.service.js';
import { verifyGoogleIdToken } from '../services/auth.service.js';
import {
  activeCalls,
  userCallMap,
  activeUserSockets,
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
});

