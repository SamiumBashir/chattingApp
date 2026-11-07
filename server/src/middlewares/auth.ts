import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/index.js';
import { verifyAccessToken } from '../utils/token.js';
import { AppError } from '../utils/apiResponse.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';

export const authenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token missing or malformed', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AppError('Authentication token missing', 401, 'UNAUTHORIZED');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      throw new AppError('Invalid or expired authentication token', 401, 'TOKEN_EXPIRED');
    }

    // Verify user exists and status is active
    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new AppError('User account no longer exists', 401, 'UNAUTHORIZED');
    }

    if (user.status === 'banned') {
      throw new AppError('Your account has been permanently banned', 403, 'ACCOUNT_BANNED');
    }

    if (user.status === 'suspended') {
      throw new AppError('Your account is temporarily suspended', 403, 'ACCOUNT_SUSPENDED');
    }

    if (user.status === 'deactivated') {
      throw new AppError('Your account is deactivated. Please sign in to reactivate it.', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Verify session has not been revoked or expired
    const session = await Session.findById(decoded.sessionId);
    if (!session || !session.isValid()) {
      throw new AppError('Session has been revoked or expired', 401, 'SESSION_REVOKED');
    }

    // Attach verified user payload
    req.user = {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      sessionId: session.id,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do not have sufficient permissions to perform this action',
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
};

export const requireVerified = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }

  const user = await User.findById(req.user.userId);
  if (!user?.isEmailVerified) {
    return next(
      new AppError(
        'Please verify your email address to access this feature',
        403,
        'EMAIL_NOT_VERIFIED'
      )
    );
  }

  next();
};

