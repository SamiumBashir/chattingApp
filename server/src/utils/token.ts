import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthenticatedUserPayload } from '../types/index.js';

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const generateRandomToken = (): { raw: string; hashed: string } => {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = hashToken(raw);
  return { raw, hashed };
};

export const generateAccessToken = (payload: AuthenticatedUserPayload): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: (env.JWT_ACCESS_EXPIRES_IN || '15m') as any,
  });
};

export const verifyAccessToken = (token: string): AuthenticatedUserPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthenticatedUserPayload;
};

export const generateRefreshToken = (): { token: string; hash: string } => {
  const token = crypto.randomBytes(40).toString('hex');
  const hash = hashToken(token);
  return { token, hash };
};

/**
 * Parses time duration string (e.g. '15m', '7d', '30d', '3600s') to milliseconds
 */
export const parseDurationMs = (duration: string): number => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 30 * 24 * 60 * 60 * 1000;
  }
};

/**
 * Returns single authoritative refresh token expiration in milliseconds derived from env
 */
export const getRefreshExpirationMs = (): number => {
  return parseDurationMs(env.JWT_REFRESH_EXPIRES_IN || '30d');
};


