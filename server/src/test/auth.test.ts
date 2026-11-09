import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
} from '../utils/token.js';
import {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { validateCsrfOrigin } from '../middlewares/auth.js';

describe('Phase 2 — Authentication System', () => {
  const app = createApp();

  describe('Zod Validation Schemas', () => {
    it('validates a correct registration payload', () => {
      const valid = {
        name: 'Alex Johnson',
        username: 'alex_j',
        email: 'alex@example.com',
        password: 'Password123',
      };
      const result = registerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects passwords without numbers or uppercase letters', () => {
      const invalid = {
        name: 'Alex Johnson',
        username: 'alex_j',
        email: 'alex@example.com',
        password: 'weakpassword',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('rejects invalid email formats', () => {
      const invalid = {
        name: 'Alex Johnson',
        username: 'alex_j',
        email: 'not-an-email',
        password: 'Password123',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('validates login identifiers (email or username)', () => {
      expect(loginSchema.safeParse({ identifier: 'alex@example.com', password: 'Pass123' }).success).toBe(true);
      expect(loginSchema.safeParse({ identifier: 'alex_j', password: 'Pass123' }).success).toBe(true);
      expect(loginSchema.safeParse({ identifier: '', password: 'Pass' }).success).toBe(false);
    });
  });

  describe('JWT & Security Token Utilities', () => {
    it('signs and verifies a valid access token', () => {
      const payload = {
        userId: 'user_123',
        email: 'alex@example.com',
        username: 'alex_j',
        role: 'user' as const,
        sessionId: 'session_123',
      };

      const token = generateAccessToken(payload);
      expect(typeof token).toBe('string');

      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.sessionId).toBe(payload.sessionId);
    });

    it('generates cryptographically secure refresh token and SHA-256 hash', () => {
      const { token, hash } = generateRefreshToken();
      expect(token).toBeDefined();
      expect(hash).toBeDefined();
      expect(hashToken(token)).toBe(hash);
    });
  });

  describe('Auth Endpoints & Validation via HTTP', () => {
    it('POST /api/v1/auth/register fails with 400 when missing required fields', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'incomplete@test.com',
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/auth/login fails with 400 when identifier or password is missing', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        identifier: '',
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/auth/me rejects requests without Authorization header with 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/auth/me rejects requests with invalid / tampered token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid_tampered_token');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Full Authentication Flow with Database Mocks', () => {
    const mockUser = {
      id: '507f1f77bcf86cd799439011',
      _id: '507f1f77bcf86cd799439011',
      name: 'Sarah Connor',
      username: 'sarah_c',
      email: 'sarah@resistance.org',
      role: 'user',
      status: 'active',
      isEmailVerified: true,
      comparePassword: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockResolvedValue(true),
      toJSON: () => ({
        id: '507f1f77bcf86cd799439011',
        name: 'Sarah Connor',
        username: 'sarah_c',
        email: 'sarah@resistance.org',
        role: 'user',
        status: 'active',
        isEmailVerified: true,
      }),
    };

    const mockSession = {
      id: '507f1f77bcf86cd799439022',
      _id: '507f1f77bcf86cd799439022',
      user: mockUser._id,
      isValid: () => true,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      save: vi.fn().mockResolvedValue(true),
    };

    beforeEach(() => {
      vi.restoreAllMocks();
      mockSession.revokedAt = null;
      mockSession.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    });

    it('authenticates user and returns access token on valid login', async () => {
      mockUser.comparePassword = vi.fn().mockResolvedValue(true);
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      vi.spyOn(Session, 'create').mockResolvedValue(mockSession as any);

      const res = await request(app).post('/api/v1/auth/login').send({
        identifier: 'sarah@resistance.org',
        password: 'Password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('sarah@resistance.org');
      expect(res.headers['set-cookie']).toBeDefined(); // HttpOnly refresh cookie
    });

    it('fetches authenticated user profile on GET /api/v1/auth/me with valid bearer token', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);
      vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);

      const token = generateAccessToken({
        userId: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('sarah_c');
    });

    it('rejects access when user account is banned with 403', async () => {
      const bannedUser = { ...mockUser, status: 'banned' };
      vi.spyOn(User, 'findById').mockResolvedValue(bannedUser as any);
      vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);

      const token = generateAccessToken({
        userId: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_BANNED');
    });

    it('rotates refresh token and issues new access token', async () => {
      const rawRefreshToken = 'valid_raw_refresh_token_for_test';
      const hashed = hashToken(rawRefreshToken);
      
      const sessionWithSave = {
        ...mockSession,
        refreshTokenHash: hashed,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Session, 'findOne').mockResolvedValue(sessionWithSave as any);
      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rawRefreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('successfully revokes session on DELETE /api/v1/auth/sessions/:id', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);
      vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);
      vi.spyOn(Session, 'findOne').mockResolvedValue(mockSession as any);

      const token = generateAccessToken({
        userId: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .delete(`/api/v1/auth/sessions/${mockSession.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.revoked).toBe(true);
    });

    it('rejects POST /api/v1/auth/refresh when refreshToken cookie is missing with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'body_token_should_be_ignored' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REFRESH_TOKEN_REQUIRED');
    });

    it('detects refresh token reuse / replay and revokes all user sessions', async () => {
      const rawOldToken = 'previously_rotated_token';
      const oldHashed = hashToken(rawOldToken);

      const compromisedSession = {
        ...mockSession,
        user: mockUser.id,
        previousTokenHashes: [oldHashed],
      };

      // Step 1: findOne by active token returns null
      // Step 2: findOne by previousTokenHashes returns compromisedSession
      vi.spyOn(Session, 'findOne')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(compromisedSession as any);

      const updateManySpy = vi.spyOn(Session, 'updateMany').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rawOldToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_COMPROMISED');
      expect(updateManySpy).toHaveBeenCalledWith(
        { user: compromisedSession.user },
        { $set: { revokedAt: expect.any(Date) } }
      );
    });

    it('rejects refresh when session has expired with 401 SESSION_EXPIRED', async () => {
      const rawToken = 'expired_raw_token';
      const hashed = hashToken(rawToken);

      const expiredSession = {
        ...mockSession,
        refreshTokenHash: hashed,
        expiresAt: new Date(Date.now() - 60000), // 1 minute ago
      };

      vi.spyOn(Session, 'findOne').mockResolvedValue(expiredSession as any);
      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rawToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('rejects refresh when session is already revoked and revokes all user sessions', async () => {
      const rawToken = 'revoked_raw_token';
      const hashed = hashToken(rawToken);

      const revokedSession = {
        ...mockSession,
        user: mockUser.id,
        refreshTokenHash: hashed,
        revokedAt: new Date(Date.now() - 60000),
      };

      vi.spyOn(Session, 'findOne').mockResolvedValue(revokedSession as any);
      const updateManySpy = vi.spyOn(Session, 'updateMany').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rawToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_COMPROMISED');
      expect(updateManySpy).toHaveBeenCalledWith(
        { user: revokedSession.user },
        { $set: { revokedAt: expect.any(Date) } }
      );
    });

    it('logs out from all devices via POST /api/v1/auth/logout-all', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);
      vi.spyOn(Session, 'findById').mockResolvedValue(mockSession as any);
      const updateManySpy = vi.spyOn(Session, 'updateMany').mockResolvedValue({} as any);

      const token = generateAccessToken({
        userId: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: 'user',
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(updateManySpy).toHaveBeenCalledWith(
        { user: mockUser.id, revokedAt: null },
        { $set: { revokedAt: expect.any(Date) } }
      );
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('refreshToken=;');
    });

    it('blocks CSRF on mutating cookie endpoint when Origin is unauthorized', () => {
      const reqMock: any = {
        method: 'POST',
        headers: {
          origin: 'https://evil-unauthorized-site.com',
        },
        cookies: {
          refreshToken: 'mock_token',
        },
      };
      const resMock: any = {};
      let caughtError: any = null;
      const nextMock = (err?: any) => {
        caughtError = err;
      };

      validateCsrfOrigin(reqMock, resMock, nextMock);

      expect(caughtError).toBeDefined();
      expect(caughtError.statusCode).toBe(403);
      expect(caughtError.code).toBe('CSRF_BLOCKED');
    });

    describe('Google OAuth Endpoints', () => {
      it('fails with 400 when credential token is missing on POST /api/v1/auth/google', async () => {
        const res = await request(app).post('/api/v1/auth/google').send({});
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      });

      it('creates new user and returns access token on valid Google credential', async () => {
        vi.spyOn(User, 'findOne').mockResolvedValue(null);
        const savedGoogleUser = {
          ...mockUser,
          id: '507f1f77bcf86cd799439099',
          name: 'Google User',
          username: 'google_user',
          email: 'google.new@example.com',
          googleId: 'google_mock_12345',
          toJSON: () => ({
            id: '507f1f77bcf86cd799439099',
            name: 'Google User',
            username: 'google_user',
            email: 'google.new@example.com',
            role: 'user',
            status: 'active',
          }),
          save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(User.prototype, 'save').mockResolvedValue(savedGoogleUser as any);
        vi.spyOn(Session, 'create').mockResolvedValue({
          ...mockSession,
          id: '507f1f77bcf86cd799439088',
        } as any);

        const res = await request(app)
          .post('/api/v1/auth/google')
          .send({ credential: 'test_google_newuser' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.accessToken).toBeDefined();
        expect(res.headers['set-cookie']).toBeDefined();
      });

      it('links Google ID to existing user account if email matches', async () => {
        const existingUser = {
          ...mockUser,
          email: 'existing@example.com',
          googleId: undefined,
          save: vi.fn().mockResolvedValue(true),
          toJSON: () => ({
            id: mockUser.id,
            name: mockUser.name,
            email: 'existing@example.com',
            username: mockUser.username,
            role: 'user',
            status: 'active',
          }),
        };

        // First find by googleId returns null, second find by email returns existingUser
        vi.spyOn(User, 'findOne')
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existingUser as any);

        vi.spyOn(Session, 'create').mockResolvedValue(mockSession as any);

        const res = await request(app)
          .post('/api/v1/auth/google')
          .send({ credential: 'test_google_existing' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(existingUser.save).toHaveBeenCalled();
      });
    });
  });
});
