import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/auth.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { env } from '../../config/env.js';
import { User } from '../../models/User.js';
import { AppError } from '../../utils/apiResponse.js';

// Cookie helper
const setRefreshCookie = (res: Response, token: string) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days persistent login
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
};

const getDeviceMetadata = (req: Request) => ({
  userAgent: req.headers['user-agent'] || 'Unknown Browser',
  ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
});

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const meta = getDeviceMetadata(req);
    const result = await AuthService.register(req.body, meta);
    setRefreshCookie(res, result.refreshToken);

    sendSuccess(
      res,
      {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        verificationToken: env.NODE_ENV !== 'production' ? result.verificationToken : undefined,
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const meta = getDeviceMetadata(req);
    const result = await AuthService.login(req.body, meta);
    setRefreshCookie(res, result.refreshToken);

    sendSuccess(
      res,
      {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      200
    );
  } catch (error) {
    next(error);
  }
};

export const googleLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const meta = getDeviceMetadata(req);
    const { credential } = req.body;
    const result = await AuthService.googleLogin(credential, meta);
    setRefreshCookie(res, result.refreshToken);

    sendSuccess(
      res,
      {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      200
    );
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken =
      req.cookies?.refreshToken ||
      req.body?.refreshToken ||
      (req.headers['x-refresh-token'] as string);
    const meta = getDeviceMetadata(req);
    const result = await AuthService.refresh(refreshToken, meta);
    setRefreshCookie(res, result.refreshToken);

    sendSuccess(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessionId = req.user?.sessionId;
    if (sessionId) {
      await AuthService.logout(sessionId);
    } else {
      const refreshToken =
        req.cookies?.refreshToken ||
        req.body?.refreshToken ||
        (req.headers['x-refresh-token'] as string);
      if (refreshToken) {
        await AuthService.logoutByRefreshToken(refreshToken);
      }
    }
    clearRefreshCookie(res);
    sendSuccess(res, { message: 'Successfully logged out' });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    sendSuccess(res, { user: user.toJSON() });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await AuthService.verifyEmail(req.body.token);
    sendSuccess(res, { message: 'Email successfully verified', ...result });
  } catch (error) {
    next(error);
  }
};

export const resendVerification = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.isEmailVerified) {
      sendSuccess(res, { message: 'Email is already verified' });
      return;
    }

    // In development / demo, we generate a new verification token and return it
    const { raw, hashed } = (await import('../../utils/token.js')).generateRandomToken();
    user.emailVerificationToken = hashed;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    sendSuccess(res, {
      message: 'Verification email sent',
      verificationToken: env.NODE_ENV !== 'production' ? raw : undefined,
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await AuthService.forgotPassword(req.body);
    sendSuccess(res, {
      message: 'If an account exists with this email, a password reset link has been dispatched.',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await AuthService.resetPassword(req.body);
    clearRefreshCookie(res);
    sendSuccess(res, {
      message: 'Password successfully reset. You may now log in with your new password.',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getSessions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    const sessions = await AuthService.getSessions(req.user.userId, req.user.sessionId);
    sendSuccess(res, { sessions });
  } catch (error) {
    next(error);
  }
};

export const revokeSession = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await AuthService.revokeSession(req.user.userId, sessionId);
    sendSuccess(res, { message: 'Session revoked successfully', ...result });
  } catch (error) {
    next(error);
  }
};
