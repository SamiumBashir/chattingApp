import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { CallService } from '../services/call.service.js';
import { generateAccessToken } from '../utils/token.js';
import { AppError } from '../utils/apiResponse.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';

describe('Metered TURN Integration & Cross-Network ICE Tests', () => {
  const app = createApp();

  const mockUser = {
    id: '507f1f77bcf86cd799439099',
    _id: '507f1f77bcf86cd799439099',
    userId: '507f1f77bcf86cd799439099',
    email: 'metered_user@example.com',
    role: 'user',
    status: 'active',
    isEmailVerified: true,
    blockedUsers: [],
    sessionId: '607f1f77bcf86cd799439099',
    toJSON: () => ({
      id: '507f1f77bcf86cd799439099',
      name: 'Metered User',
      username: 'metered_user',
      email: 'metered_user@example.com',
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
    username: 'metered_user',
    role: 'user',
    sessionId: mockSession.id,
  });

  const sampleMeteredArray = [
    {
      urls: 'stun:stun.relay.metered.ca:80',
    },
    {
      urls: 'turn:standard.relay.metered.ca:80',
      username: 'metered_username_abc',
      credential: 'metered_credential_xyz',
    },
    {
      urls: 'turn:standard.relay.metered.ca:80?transport=tcp',
      username: 'metered_username_abc',
      credential: 'metered_credential_xyz',
    },
    {
      urls: 'turn:standard.relay.metered.ca:443',
      username: 'metered_username_abc',
      credential: 'metered_credential_xyz',
    },
    {
      urls: 'turns:standard.relay.metered.ca:443?transport=tcp',
      username: 'metered_username_abc',
      credential: 'metered_credential_xyz',
    },
  ];

  let originalMeteredIceServers: string | undefined;
  let originalMeteredDomain: string | undefined;
  let originalMeteredApiKey: string | undefined;
  let originalMeteredUsername: string | undefined;
  let originalMeteredCredential: string | undefined;
  let originalTurnServerUrl: string | undefined;
  let originalTurnSecret: string | undefined;

  beforeEach(() => {
    originalMeteredIceServers = env.METERED_ICE_SERVERS;
    originalMeteredDomain = env.METERED_DOMAIN;
    originalMeteredApiKey = env.METERED_API_KEY;
    originalMeteredUsername = env.METERED_USERNAME;
    originalMeteredCredential = env.METERED_CREDENTIAL;
    originalTurnServerUrl = env.TURN_SERVER_URL;
    originalTurnSecret = env.TURN_SECRET;

    (env as any).METERED_ICE_SERVERS = undefined;
    (env as any).METERED_DOMAIN = undefined;
    (env as any).METERED_API_KEY = undefined;
    (env as any).METERED_USERNAME = undefined;
    (env as any).METERED_CREDENTIAL = undefined;
    (env as any).TURN_SERVER_URL = undefined;
    (env as any).TURN_SECRET = undefined;

    vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);
    vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);

    CallService.clearMeteredCache();
  });

  afterEach(() => {
    (env as any).METERED_ICE_SERVERS = originalMeteredIceServers;
    (env as any).METERED_DOMAIN = originalMeteredDomain;
    (env as any).METERED_API_KEY = originalMeteredApiKey;
    (env as any).METERED_USERNAME = originalMeteredUsername;
    (env as any).METERED_CREDENTIAL = originalMeteredCredential;
    (env as any).TURN_SERVER_URL = originalTurnServerUrl;
    (env as any).TURN_SECRET = originalTurnSecret;

    CallService.clearMeteredCache();
    vi.restoreAllMocks();
  });

  describe('1. Metered ICE Servers Validation & Parsing', () => {
    it('parses valid Metered ICE Servers JSON array and preserves all transport URLs', () => {
      const jsonStr = JSON.stringify(sampleMeteredArray);
      const parsed = CallService.parseMeteredIceServers(jsonStr);

      expect(parsed.length).toBe(5);
      expect(parsed[0].urls).toBe('stun:stun.relay.metered.ca:80');
      expect(parsed[1].urls).toBe('turn:standard.relay.metered.ca:80');
      expect(parsed[1].username).toBe('metered_username_abc');
      expect(parsed[1].credential).toBe('metered_credential_xyz');
      expect(parsed[2].urls).toBe('turn:standard.relay.metered.ca:80?transport=tcp');
      expect(parsed[3].urls).toBe('turn:standard.relay.metered.ca:443');
      expect(parsed[4].urls).toBe('turns:standard.relay.metered.ca:443?transport=tcp');
    });

    it('parses base64-encoded Metered ICE Servers array for safe deployment string passing', () => {
      const jsonStr = JSON.stringify(sampleMeteredArray);
      const base64Str = Buffer.from(jsonStr).toString('base64');
      const parsed = CallService.parseMeteredIceServers(base64Str);

      expect(parsed.length).toBe(5);
      expect(parsed[4].urls).toBe('turns:standard.relay.metered.ca:443?transport=tcp');
    });

    it('throws AppError (500) if METERED_ICE_SERVERS contains invalid JSON', () => {
      expect(() => CallService.parseMeteredIceServers('invalid-non-json-string')).toThrow(AppError);
      try {
        CallService.parseMeteredIceServers('invalid-non-json-string');
      } catch (err: any) {
        expect(err.statusCode).toBe(500);
        expect(err.code).toBe('INVALID_ICE_CONFIGURATION');
      }
    });

    it('throws AppError (500) if METERED_ICE_SERVERS is empty array', () => {
      expect(() => CallService.parseMeteredIceServers('[]')).toThrow(AppError);
    });

    it('throws AppError (500) if any TURN entry lacks credentials or username', () => {
      const invalidArray = [
        { urls: 'stun:stun.relay.metered.ca:80' },
        { urls: 'turn:standard.relay.metered.ca:80' }, // Missing username & credential
      ];

      expect(() => CallService.parseMeteredIceServers(JSON.stringify(invalidArray))).toThrow(AppError);
    });

    it('throws AppError (500) if any entry has unsupported URL scheme (e.g. http://)', () => {
      const invalidSchemeArray = [
        { urls: 'http://insecure-relay.example.com' },
      ];

      expect(() => CallService.parseMeteredIceServers(JSON.stringify(invalidSchemeArray))).toThrow(AppError);
    });
  });

  describe('2. CallService Priority Resolution & Credentials Delivery', () => {
    it('serves static Metered credentials when METERED_ICE_SERVERS is configured', async () => {
      (env as any).METERED_ICE_SERVERS = JSON.stringify(sampleMeteredArray);

      const result = await CallService.getIceServers(mockUser.userId);

      expect(result.iceServers.length).toBe(5);
      expect(result.isStatic).toBe(true);
      expect(result.ttl).toBe(0);
      expect(result.expiresAt).toBeDefined();

      const turnsServer = result.iceServers.find((s) =>
        typeof s.urls === 'string' ? s.urls.startsWith('turns:') : s.urls.some((u) => u.startsWith('turns:'))
      );
      expect(turnsServer).toBeDefined();
      expect(turnsServer?.username).toBe('metered_username_abc');
    });

    it('generates standard 5 Metered endpoints from METERED_DOMAIN, USERNAME, and CREDENTIAL', async () => {
      (env as any).METERED_DOMAIN = 'my-custom-app.metered.ca';
      (env as any).METERED_USERNAME = 'user_static_123';
      (env as any).METERED_CREDENTIAL = 'cred_secret_456';

      const result = await CallService.getIceServers(mockUser.userId);

      expect(result.iceServers.length).toBe(2);
      expect(result.iceServers[0].urls).toBe('stun:stun.relay.metered.ca:80');

      const turnConfig = result.iceServers[1];
      expect(Array.isArray(turnConfig.urls)).toBe(true);
      expect(turnConfig.urls).toContain('turn:my-custom-app.metered.ca:80');
      expect(turnConfig.urls).toContain('turn:my-custom-app.metered.ca:80?transport=tcp');
      expect(turnConfig.urls).toContain('turn:my-custom-app.metered.ca:443');
      expect(turnConfig.urls).toContain('turns:my-custom-app.metered.ca:443?transport=tcp');
      expect(turnConfig.username).toBe('user_static_123');
      expect(turnConfig.credential).toBe('cred_secret_456');
    });

    it('fetches dynamic ephemeral credentials from Metered API and caches within TTL', async () => {
      (env as any).METERED_DOMAIN = 'connectly-live.metered.ca';
      (env as any).METERED_API_KEY = 'mock_metered_secret_api_key_789';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => sampleMeteredArray,
      } as any);

      const result1 = await CallService.getIceServers(mockUser.userId);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result1.iceServers.length).toBe(5);
      expect(result1.isStatic).toBe(false);
      expect(result1.ttl).toBe(3600);

      // Second call within TTL should be served from in-memory cache without hitting fetch again
      const result2 = await CallService.getIceServers(mockUser.userId);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result2.iceServers.length).toBe(5);
    });

    it('throws AppError (502) if Metered API returns error status code (e.g. 401 Unauthorized)', async () => {
      (env as any).METERED_DOMAIN = 'connectly-live.metered.ca';
      (env as any).METERED_API_KEY = 'invalid_key';

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as any);

      await expect(CallService.getIceServers(mockUser.userId)).rejects.toThrow(AppError);
    });
  });

  describe('3. GET /api/v1/calls/ice-servers HTTP Endpoint Integration', () => {
    it('returns 200 with Metered ICE servers array for authenticated client', async () => {
      (env as any).METERED_ICE_SERVERS = JSON.stringify(sampleMeteredArray);

      const res = await request(app)
        .get('/api/v1/calls/ice-servers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.iceServers.length).toBe(5);
      expect(res.body.data.isStatic).toBe(true);

      // Verify that no server secrets or API keys are returned
      expect(res.body.data.METERED_API_KEY).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('mock_metered_secret_api_key');
    });

    it('returns 500 when environment variable METERED_ICE_SERVERS contains corrupt JSON', async () => {
      (env as any).METERED_ICE_SERVERS = '{"unclosed_json: true';

      const res = await request(app)
        .get('/api/v1/calls/ice-servers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('INVALID_ICE_CONFIGURATION');
    });

    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/calls/ice-servers');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });
  });
});
