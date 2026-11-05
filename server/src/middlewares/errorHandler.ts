import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle Zod Validation Error
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
    return;
  }

  // Handle Known Operational AppError
  if (err instanceof AppError || (err && typeof err === 'object' && (err as { isOperational?: boolean }).isOperational)) {
    const appErr = err as AppError;
    sendError(res, appErr.statusCode || 500, appErr.code || 'APP_ERROR', appErr.message, appErr.details);
    return;
  }

  // Handle MongoDB / Mongoose Duplicate Key Error (E11000)
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000) {
    const keyVal = (err as { keyValue?: Record<string, unknown> }).keyValue;
    const field = keyVal ? Object.keys(keyVal)[0] : 'field';
    sendError(
      res,
      409,
      'DUPLICATE_RESOURCE',
      `A record with this ${field} already exists.`,
      keyVal
    );
    return;
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId)
  if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: unknown }).name === 'CastError') {
    sendError(res, 400, 'INVALID_IDENTIFIER', 'Invalid ID format provided');
    return;
  }

  // Handle Mongoose Buffering / Disconnected Timeout Errors
  if (
    err instanceof Error &&
    (err.message.includes('buffering timed out') ||
      err.message.includes('ECONNREFUSED') ||
      err.name === 'MongooseServerSelectionError')
  ) {
    logger.error('Database connection failure:', err.message);
    sendError(
      res,
      503,
      'DATABASE_UNAVAILABLE',
      'Database connection unavailable. MongoDB is not running or unreachable at the configured MONGODB_URI. Please start your MongoDB service/Docker container or configure MongoDB Atlas in server/.env.'
    );
    return;
  }

  // Unhandled / Internal Server Errors
  logger.error('Unhandled Server Exception:', err);
  const message = env.NODE_ENV === 'production' ? 'An internal server error occurred' : (err as Error).message;
  sendError(
    res,
    500,
    'INTERNAL_SERVER_ERROR',
    message,
    env.NODE_ENV !== 'production' ? (err as Error).stack : undefined
  );
};

