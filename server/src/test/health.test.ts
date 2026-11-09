import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { sanitizeLogData } from '../utils/logger.js';

describe('API Foundation & Health Check', () => {
  const app = createApp();

  it('GET /api/v1/health returns 200 and healthy payload with subsystem statuses', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('Connectly API');
    expect(res.body.data.database).toBeDefined();
    expect(res.body.data.socketIo).toBeDefined();
    expect(res.body.data.redis).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('preserves client-provided x-request-id correlation ID across responses', async () => {
    const customCorrelationId = 'corr-uuid-12345-abcde';
    const res = await request(app)
      .get('/api/v1/health')
      .set('x-request-id', customCorrelationId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(customCorrelationId);
  });

  it('GET /api/v1/non-existent-route returns 404 with standardized error envelope and correlation requestId', async () => {
    const res = await request(app).get('/api/v1/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeDefined();
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  describe('Observability & Log Data Sanitization', () => {
    it('redacts sensitive keys such as password, token, and refreshToken', () => {
      const sensitivePayload = {
        username: 'alice',
        password: 'superSecretPassword123',
        refreshToken: 'sensitive_refresh_token_here',
        nested: {
          token: 'sensitive_jwt_token',
          safeField: 'safeValue',
        },
      };

      const sanitized = sanitizeLogData(sensitivePayload) as any;
      expect(sanitized.username).toBe('alice');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.refreshToken).toBe('[REDACTED]');
      expect(sanitized.nested.token).toBe('[REDACTED]');
      expect(sanitized.nested.safeField).toBe('safeValue');
    });

    it('redacts Bearer JWT tokens in log strings', () => {
      const logString = 'Auth header received: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ.XYZ123';
      const sanitized = sanitizeLogData(logString);
      expect(sanitized).toBe('Auth header received: Bearer [REDACTED_JWT]');
    });
  });
});

