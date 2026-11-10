import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { generateAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { CallService } from '../services/call.service.js';
import { env } from '../config/env.js';

describe('Phase 2 — Secure TURN/STUN Infrastructure Tests', () => {
  const app = createApp();

  const mockUser = {
    id: '507f1f77bcf86cd799439099',
    _id: '507f1f77bcf86cd799439099',
    name: 'Test Caller',
    username: 'test_caller',
    email: 'caller@connectly.app',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    toJSON: () => ({
      id: '507f1f77bcf86cd799439099',
      name: 'Test Caller',
      username: 'test_caller',
      email: 'caller@connectly.app',
      role: 'user',
      status: 'active',
    }),
  };

  const mockSession = {
    id: '607f1f77bcf86cd799439099',
    _id: '607f1f77bcf86cd799439099',
    userId: mockUser.id,
    isValid: () => true,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };

  const validToken = generateAccessToken({
    userId: mockUser.id,
    email: mockUser.email,
    username: mockUser.username,
    role: 'user',
    sessionId: mockSession.id,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);
    vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);
  });

  describe('GET /api/v1/calls/ice-servers Authorization & Security', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/calls/ice-servers');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('rejects malformed authorization header with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .get('/api/v1/calls/ice-servers')
        .set('Authorization', 'Basic invalid_token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('rejects expired or tampered token with 401 TOKEN_EXPIRED or UNAUTHORIZED', async () => {
      const res = await request(app)
        .get('/api/v1/calls/ice-servers')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with standard ICE servers configuration for authenticated users', async () => {
      const res = await request(app)
        .get('/api/v1/calls/ice-servers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data.iceServers)).toBe(true);
      expect(res.body.data.iceServers.length).toBeGreaterThanOrEqual(1);

      // Verify default STUN servers are present
      const stunEntry = res.body.data.iceServers[0];
      expect(stunEntry.urls).toBeDefined();
      expect(res.body.data.ttl).toBeDefined();
      expect(res.body.data.expiresAt).toBeDefined();
    });
  });

  describe('CallService.getIceServers() & Ephemeral TURN Credentials', () => {
    it('includes default public STUN servers when STUN_SERVERS is empty', () => {
      const originalStun = env.STUN_SERVERS;
      (env as any).STUN_SERVERS = undefined;

      const result = CallService.getIceServers(mockUser.id);
      expect(result.iceServers[0].urls).toContain('stun:stun.l.google.com:19302');
      expect(result.iceServers[0].urls).toContain('stun:stun.services.mozilla.com');

      (env as any).STUN_SERVERS = originalStun;
    });

    it('generates short-lived HMAC-SHA1 TURN credentials conforming to RFC 5766', () => {
      const originalUrl = env.TURN_SERVER_URL;
      const originalTurnsUrl = env.TURNS_SERVER_URL;
      const originalSecret = env.TURN_SECRET;
      const originalTtl = env.TURN_CREDENTIAL_TTL;

      (env as any).TURN_SERVER_URL = 'turn:turn.connectly.app:3478';
      (env as any).TURNS_SERVER_URL = 'turns:turn.connectly.app:5349';
      (env as any).TURN_SECRET = 'super_secret_coturn_static_auth_secret_key';
      (env as any).TURN_CREDENTIAL_TTL = 3600; // 1 hour

      const beforeTime = Math.floor(Date.now() / 1000);
      const result = CallService.getIceServers(mockUser.id);
      const afterTime = Math.floor(Date.now() / 1000);

      expect(result.ttl).toBe(3600);
      expect(result.iceServers.length).toBe(2);

      const turnServer = result.iceServers[1];
      expect(turnServer.urls).toBeDefined();
      // Transport protocols: UDP, TCP, and TLS (TURNS)
      expect(turnServer.urls).toContain('turn:turn.connectly.app:3478?transport=udp');
      expect(turnServer.urls).toContain('turn:turn.connectly.app:3478?transport=tcp');
      expect(turnServer.urls).toContain('turns:turn.connectly.app:5349?transport=tcp');

      // Verify username format: <expiryTimestamp>:<userId>
      expect(turnServer.username).toBeDefined();
      const [expiryStr, userId] = turnServer.username!.split(':');
      const expiry = parseInt(expiryStr, 10);
      expect(userId).toBe(mockUser.id);
      expect(expiry).toBeGreaterThanOrEqual(beforeTime + 3600);
      expect(expiry).toBeLessThanOrEqual(afterTime + 3600);

      // Verify HMAC-SHA1 credential
      const expectedHmac = crypto
        .createHmac('sha1', 'super_secret_coturn_static_auth_secret_key')
        .update(turnServer.username!)
        .digest('base64');
      expect(turnServer.credential).toBe(expectedHmac);

      // Cleanup env
      (env as any).TURN_SERVER_URL = originalUrl;
      (env as any).TURNS_SERVER_URL = originalTurnsUrl;
      (env as any).TURN_SECRET = originalSecret;
      (env as any).TURN_CREDENTIAL_TTL = originalTtl;
    });

    it('supports static TURN credentials as fallback when TURN_SECRET is not configured', () => {
      const originalUrl = env.TURN_SERVER_URL;
      const originalSecret = env.TURN_SECRET;
      const originalUser = env.TURN_USERNAME;
      const originalCred = env.TURN_CREDENTIAL;

      (env as any).TURN_SERVER_URL = 'turn:relay.example.com:3478';
      (env as any).TURN_SECRET = undefined;
      (env as any).TURN_USERNAME = 'static_user';
      (env as any).TURN_CREDENTIAL = 'static_password_123';

      const result = CallService.getIceServers(mockUser.id);
      const turnServer = result.iceServers[1];
      expect(turnServer).toBeDefined();
      expect(turnServer.username).toBe('static_user');
      expect(turnServer.credential).toBe('static_password_123');

      (env as any).TURN_SERVER_URL = originalUrl;
      (env as any).TURN_SECRET = originalSecret;
      (env as any).TURN_USERNAME = originalUser;
      (env as any).TURN_CREDENTIAL = originalCred;
    });

    it('verifies ephemeral TURN credentials and detects expired or forged credentials', () => {
      const secret = 'test_secret_for_verification';
      const now = Math.floor(Date.now() / 1000);

      // 1. Valid unexpired credential
      const validUsername = `${now + 600}:${mockUser.id}`;
      const validCredential = crypto
        .createHmac('sha1', secret)
        .update(validUsername)
        .digest('base64');

      const validCheck = CallService.verifyTurnCredential(validUsername, validCredential, secret);
      expect(validCheck.valid).toBe(true);
      expect(validCheck.expired).toBe(false);
      expect(validCheck.userId).toBe(mockUser.id);

      // 2. Expired credential
      const expiredUsername = `${now - 100}:${mockUser.id}`;
      const expiredCredential = crypto
        .createHmac('sha1', secret)
        .update(expiredUsername)
        .digest('base64');

      const expiredCheck = CallService.verifyTurnCredential(expiredUsername, expiredCredential, secret);
      expect(expiredCheck.valid).toBe(true);
      expect(expiredCheck.expired).toBe(true);

      // 3. Forged signature / wrong secret
      const forgedCheck = CallService.verifyTurnCredential(validUsername, 'forged_base64_sig', secret);
      expect(forgedCheck.valid).toBe(false);

      // 4. Malformed username without timestamp
      const malformedCheck = CallService.verifyTurnCredential('invalid_username_format', 'sig', secret);
      expect(malformedCheck.valid).toBe(false);
    });
  });
});

