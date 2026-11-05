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
    expiresIn: '15m',
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

