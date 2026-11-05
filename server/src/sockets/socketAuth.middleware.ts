import { Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/token.js';
import { AuthenticatedUserPayload } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface AuthenticatedSocket extends Socket {
  data: {
    user: AuthenticatedUserPayload;
  };
}

export const socketAuthMiddleware = (
  socket: Socket,
  next: (err?: Error) => void
): void => {
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
    socket.data.user = payload;
    next();
  } catch (error) {
    logger.warn(`Socket authentication failed for ${socket.id}:`, error);
    next(new Error('Invalid or expired authentication token'));
  }
};

