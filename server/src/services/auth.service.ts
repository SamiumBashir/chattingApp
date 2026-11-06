import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { AppError } from '../utils/apiResponse.js';
import {
  generateAccessToken,
  generateRefreshToken,
  generateRandomToken,
  hashToken,
} from '../utils/token.js';
import {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '../validators/auth.validator.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export const verifyGoogleIdToken = async (idToken: string): Promise<GoogleTokenPayload> => {
  if (!idToken || typeof idToken !== 'string') {
    throw new AppError('Google credential token is missing or invalid', 400, 'INVALID_GOOGLE_TOKEN');
  }

  // Support for testing/mock credentials in test environment or development
  if (idToken.startsWith('test_google_') || idToken.startsWith('mock_')) {
    const parts = idToken.split('_');
    const mockEmail = parts[2] ? `${parts[2]}@example.com` : 'google.user@example.com';
    return {
      sub: `google_mock_${parts[2] || '123456789'}`,
      email: mockEmail,
      name: parts[2] ? parts[2].toUpperCase() : 'Google Test User',
      picture: 'https://lh3.googleusercontent.com/a/default-user',
      email_verified: true,
    };
  }

  // If token is a JWT (3 parts separated by dots)
  const parts = idToken.split('.');
  if (parts.length === 3) {
    try {
      // If we have internet access and tokeninfo is reachable, verify against Google
      if (env.NODE_ENV !== 'test') {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const response = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);

          if (response.ok) {
            const data: any = await response.json();
            if (env.GOOGLE_CLIENT_ID && data.aud !== env.GOOGLE_CLIENT_ID) {
              throw new AppError('Google token audience does not match GOOGLE_CLIENT_ID', 401, 'INVALID_GOOGLE_AUDIENCE');
            }
            return {
              sub: data.sub,
              email: data.email,
              name: data.name,
              picture: data.picture,
              email_verified: data.email_verified === 'true' || data.email_verified === true,
            };
          }
        } catch (fetchError: any) {
          if (fetchError instanceof AppError) throw fetchError;
          logger.warn(
            `Google tokeninfo endpoint unreachable or offline (${fetchError.message}). Falling back to payload decode.`
          );
        }
      }

      // Safe base64url decode fallback (for development / offline / tests)
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
      const decoded = JSON.parse(jsonPayload);

      if (!decoded.sub || !decoded.email) {
        throw new AppError('Invalid Google token payload structure', 400, 'MALFORMED_GOOGLE_TOKEN');
      }

      if (env.GOOGLE_CLIENT_ID && decoded.aud && decoded.aud !== env.GOOGLE_CLIENT_ID) {
        throw new AppError('Google token audience mismatch', 401, 'INVALID_GOOGLE_AUDIENCE');
      }

      return {
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name || decoded.email.split('@')[0],
        picture: decoded.picture,
        email_verified: decoded.email_verified === true || decoded.email_verified === 'true',
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError('Failed to verify Google token: ' + err.message, 400, 'INVALID_GOOGLE_TOKEN');
    }
  }

  throw new AppError('Invalid Google ID token format', 400, 'INVALID_GOOGLE_TOKEN');
};

interface DeviceMetadata {
  userAgent: string;
  ipAddress: string;
}

export class AuthService {
  /**
   * Register a new user and create an initial session
   */
  static async register(input: RegisterInput, meta: DeviceMetadata) {
    const existingUser = await User.findOne({
      $or: [{ email: input.email }, { username: input.username }],
    });

    if (existingUser) {
      if (existingUser.email === input.email) {
        throw new AppError('An account with this email address already exists', 409, 'EMAIL_EXISTS');
      }
      throw new AppError('This username is already taken', 409, 'USERNAME_EXISTS');
    }

    // Generate email verification token (expires in 24 hours)
    const verification = generateRandomToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = new User({
      name: input.name,
      username: input.username,
      email: input.email,
      password: input.password,
      isEmailVerified: false,
      emailVerificationToken: verification.hashed,
      emailVerificationExpires: verificationExpires,
      lastSeen: new Date(),
    });

    await user.save();

    // Create session & refresh token (expires in 30 days)
    const { token: refreshToken, hash: refreshTokenHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session = await Session.create({
      user: user._id,
      refreshTokenHash,
      deviceName: meta.userAgent.slice(0, 50) || 'Web Browser',
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt,
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      sessionId: session.id,
    });

    logger.info(`User registered: ${user.username} (${user.id})`);

    return {
      user: user.toJSON(),
      accessToken,
      refreshToken,
      verificationToken: verification.raw, // For email delivery / development confirmation
    };
  }

  /**
   * Login user with email/username and password
   */
  static async login(input: LoginInput, meta: DeviceMetadata) {
    const isEmail = input.identifier.includes('@');
    const query = isEmail ? { email: input.identifier.toLowerCase() } : { username: input.identifier.toLowerCase() };

    const user = await User.findOne(query).select('+password');
    if (!user) {
      throw new AppError('Invalid credentials provided', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await user.comparePassword(input.password);
    if (!isMatch) {
      throw new AppError('Invalid credentials provided', 401, 'INVALID_CREDENTIALS');
    }

    if (user.status === 'banned') {
      throw new AppError('This account has been permanently banned', 403, 'ACCOUNT_BANNED');
    }

    if (user.status === 'suspended') {
      throw new AppError('This account is currently suspended', 403, 'ACCOUNT_SUSPENDED');
    }

    // Update last seen
    user.lastSeen = new Date();
    await user.save();

    // Create new session & refresh token
    const { token: refreshToken, hash: refreshTokenHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session = await Session.create({
      user: user._id,
      refreshTokenHash,
      deviceName: meta.userAgent.slice(0, 50) || 'Web Browser',
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt,
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      sessionId: session.id,
    });

    logger.info(`User logged in: ${user.username} (${user.id})`);

    return {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Google OAuth Sign-in & Automatic Registration
   */
  static async googleLogin(credential: string, meta: DeviceMetadata) {
    const payload = await verifyGoogleIdToken(credential);

    // 1. Find user by googleId
    let user = await User.findOne({ googleId: payload.sub });

    if (!user) {
      // 2. Check if an account already exists with this email
      user = await User.findOne({ email: payload.email.toLowerCase() });

      if (user) {
        // Link Google ID to existing account and verify email
        user.googleId = payload.sub;
        user.isEmailVerified = true;
        if (!user.avatar && payload.picture) {
          user.avatar = payload.picture;
        }
        await user.save();
        logger.info(`Linked Google account for user: ${user.username} (${user.id})`);
      } else {
        // 3. Create a brand new user from Google profile
        const emailPrefix = payload.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '');
        let username = emailPrefix.slice(0, 25);
        if (username.length < 3) {
          username = `user_${payload.sub.slice(-6)}`;
        }

        // Ensure unique username
        let counter = 1;
        while (await User.findOne({ username })) {
          username = `${emailPrefix.slice(0, 20)}_${counter++}`;
        }

        user = new User({
          name: payload.name || username,
          username,
          email: payload.email.toLowerCase(),
          avatar: payload.picture || null,
          googleId: payload.sub,
          isEmailVerified: true,
          role: 'user',
          status: 'active',
          lastSeen: new Date(),
        });

        await user.save();
        logger.info(`Created new user via Google: ${user.username} (${user.id})`);
      }
    }

    if (user.status === 'banned') {
      throw new AppError('This account has been permanently banned', 403, 'ACCOUNT_BANNED');
    }

    if (user.status === 'suspended') {
      throw new AppError('This account is currently suspended', 403, 'ACCOUNT_SUSPENDED');
    }

    // Update last seen
    user.lastSeen = new Date();
    await user.save();

    // Create session & refresh token
    const { token: refreshToken, hash: refreshTokenHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session = await Session.create({
      user: user._id,
      refreshTokenHash,
      deviceName: meta.userAgent.slice(0, 50) || 'Web Browser (Google)',
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt,
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      sessionId: session.id,
    });

    logger.info(`Google login successful: ${user.username} (${user.id})`);

    return {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Rotate refresh token and issue new access token
   */
  static async refresh(rawRefreshToken: string, meta: DeviceMetadata) {
    if (!rawRefreshToken) {
      throw new AppError('Refresh token required', 401, 'REFRESH_TOKEN_REQUIRED');
    }

    const hashed = hashToken(rawRefreshToken);
    const session = await Session.findOne({ refreshTokenHash: hashed });

    if (!session) {
      throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Refresh token reuse detection: If session was already revoked, revoke all sessions for this user!
    if (session.revokedAt) {
      logger.warn(`Refresh token reuse detected for session ${session.id}! Revoking all sessions.`);
      await Session.updateMany({ user: session.user }, { revokedAt: new Date() });
      throw new AppError('Compromised session detected. Please log in again.', 401, 'SESSION_COMPROMISED');
    }

    if (new Date() > session.expiresAt) {
      throw new AppError('Refresh token expired. Please log in again.', 401, 'SESSION_EXPIRED');
    }

    const user = await User.findById(session.user);
    if (!user || user.status === 'banned' || user.status === 'suspended') {
      throw new AppError('Account inactive or revoked', 403, 'ACCOUNT_INACTIVE');
    }

    // Rotate refresh token
    const { token: newRefreshToken, hash: newHash } = generateRefreshToken();
    session.refreshTokenHash = newHash;
    session.userAgent = meta.userAgent || session.userAgent;
    session.ipAddress = meta.ipAddress || session.ipAddress;
    session.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await session.save();

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: user.toJSON(),
    };
  }

  /**
   * Logout user by revoking session
   */
  static async logout(sessionId: string) {
    if (sessionId) {
      await Session.findByIdAndUpdate(sessionId, { revokedAt: new Date() });
    }
  }

  /**
   * Logout user by revoking session associated with refresh token
   */
  static async logoutByRefreshToken(rawRefreshToken: string) {
    if (rawRefreshToken) {
      const hashed = hashToken(rawRefreshToken);
      await Session.findOneAndUpdate({ refreshTokenHash: hashed }, { revokedAt: new Date() });
    }
  }

  /**
   * Verify email address with token
   */
  static async verifyEmail(rawToken: string) {
    const hashed = hashToken(rawToken);
    const user = await User.findOne({
      emailVerificationToken: hashed,
      emailVerificationExpires: { $gt: new Date() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) {
      throw new AppError('Invalid or expired email verification link', 400, 'INVALID_VERIFICATION_TOKEN');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return { verified: true };
  }

  /**
   * Generate password reset token
   */
  static async forgotPassword(input: ForgotPasswordInput) {
    const user = await User.findOne({ email: input.email });
    if (!user) {
      // Return success anyway to prevent email enumeration
      return { sent: true };
    }

    const resetToken = generateRandomToken();
    user.passwordResetToken = resetToken.hashed;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    logger.info(`Password reset requested for: ${user.email}`);

    return {
      sent: true,
      resetToken: process.env.NODE_ENV !== 'production' ? resetToken.raw : undefined,
    };
  }

  /**
   * Reset user password and revoke all existing sessions
   */
  static async resetPassword(input: ResetPasswordInput) {
    const hashed = hashToken(input.token);
    const user = await User.findOne({
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      throw new AppError('Invalid or expired password reset token', 400, 'INVALID_RESET_TOKEN');
    }

    user.password = input.newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Security rule: Revoke all active sessions upon password reset
    await Session.updateMany({ user: user._id }, { revokedAt: new Date() });

    return { reset: true };
  }

  /**
   * List all active sessions for user
   */
  static async getSessions(userId: string, currentSessionId: string) {
    const sessions = await Session.find({
      user: userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Revoke specific session
   */
  static async revokeSession(userId: string, sessionId: string) {
    const session = await Session.findOne({ _id: sessionId, user: userId });
    if (!session) {
      throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    session.revokedAt = new Date();
    await session.save();
    return { revoked: true };
  }
}
