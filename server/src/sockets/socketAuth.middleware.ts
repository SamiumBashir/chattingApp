import { Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/token.js';
import { AuthenticatedUserPayload } from '../types/index.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { logger } from '../utils/logger.js';

export interface AuthenticatedSocket extends Socket {
  data: {
    user: AuthenticatedUserPayload;
  };
}

export const socketAuthMiddleware = async (
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    let token = socket.handshake.auth?.token;

    if (!token && socket.handshake.headers?.authorization) {
      const header = socket.handshake.headers.authorization;
      if (header.startsWith('Bearer ')) {
        token = header.split(' ')[1];
      }
    }

    if (!token) {
      logger.warn(`Unauthorized socket connection attempt from ${socket.id}`);
      return next(new Error('Authentication token required'));
    }

    const payload = verifyAccessToken(token);

    // Verify user exists and status is active
    const userDoc = await User.findById(payload.userId);
    if (!userDoc) {
      logger.warn(`Socket connection rejected: user ${payload.userId} not found`);
      return next(new Error('User account not found'));
    }

    if (userDoc.status === 'banned') {
      logger.warn(`Socket connection rejected: user ${payload.userId} is banned`);
      return next(new Error('Account is permanently banned'));
    }

    if (userDoc.status === 'suspended') {
      logger.warn(`Socket connection rejected: user ${payload.userId} is suspended`);
      return next(new Error('Account is currently suspended'));
    }

    if (userDoc.status === 'deactivated') {
      logger.warn(`Socket connection rejected: user ${payload.userId} is deactivated`);
      return next(new Error('Account is deactivated'));
    }

    // Verify session has not been revoked or expired
    if (payload.sessionId) {
      const sessionDoc = await Session.findById(payload.sessionId);
      if (!sessionDoc || !sessionDoc.isValid()) {
        logger.warn(`Socket connection rejected: session ${payload.sessionId} is revoked or expired`);
        return next(new Error('Session has been revoked or expired'));
      }
    }

    socket.data.user = payload;
    next();
  } catch (error) {
    logger.warn(`Socket authentication failed for ${socket.id}:`, error);
    next(new Error('Invalid or expired authentication token'));
  }
};

