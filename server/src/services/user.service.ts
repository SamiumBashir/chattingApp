import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { AppError } from '../utils/apiResponse.js';
import { UpdateProfileInput } from '../validators/user.validator.js';
import { getSocketGateway } from '../sockets/socketGateway.js';
import { logger } from '../utils/logger.js';

export class UserService {
  /**
   * Get user profile by ID
   */
  static async getProfile(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return user.toJSON();
  }

  /**
   * Update authenticated user profile
   */
  static async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (input.name !== undefined) user.name = input.name;
    if (input.bio !== undefined) user.bio = input.bio;
    if (input.avatar !== undefined) user.avatar = input.avatar ?? undefined;

    await user.save();
    return user.toJSON();
  }

  /**
   * Search users by name, username, or email
   * Excludes self, already blocked users, and users who blocked current user
   */
  static async searchUsers(currentUserId: string, queryStr: string, limit = 20) {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const cleanQuery = queryStr.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(cleanQuery, 'i');

    const users = await User.find({
      _id: { $ne: currentUserId, $nin: currentUser.blockedUsers },
      blockedUsers: { $ne: new mongoose.Types.ObjectId(currentUserId) },
      status: 'active',
      $or: [{ username: regex }, { name: regex }, { email: regex }],
    })
      .select('name username email avatar bio lastSeen')
      .limit(limit);

    return users.map((u) => u.toJSON());
  }

  /**
   * Block target user
   */
  static async blockUser(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new AppError('You cannot block yourself', 400, 'INVALID_BLOCK');
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      throw new AppError('Target user does not exist', 404, 'USER_NOT_FOUND');
    }

    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: { blockedUsers: new mongoose.Types.ObjectId(targetUserId) },
    });

    return { blocked: true, userId: targetUserId };
  }

  /**
   * Unblock target user
   */
  static async unblockUser(currentUserId: string, targetUserId: string) {
    await User.findByIdAndUpdate(currentUserId, {
      $pull: { blockedUsers: new mongoose.Types.ObjectId(targetUserId) },
    });

    return { unblocked: true, userId: targetUserId };
  }

  /**
   * Get list of users blocked by current user
   */
  static async getBlockedUsers(currentUserId: string) {
    const user = await User.findById(currentUserId).populate<{
      blockedUsers: Array<{
        _id: mongoose.Types.ObjectId;
        name: string;
        username: string;
        avatar?: string;
      }>;
    }>('blockedUsers', 'name username avatar');

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return (user.blockedUsers || []).map((b) => ({
      id: b._id.toString(),
      name: b.name,
      username: b.username,
      avatar: b.avatar,
    }));
  }

  /**
   * Deactivate user account (requires password verification)
   */
  static async deactivateAccount(userId: string, passwordConfirm: string) {
    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.password) {
      const isMatch = await user.comparePassword(passwordConfirm);
      if (!isMatch) {
        throw new AppError('Incorrect password. Please verify your password to continue.', 401, 'INVALID_PASSWORD');
      }
    } else if (user.googleId && !user.password) {
      if (passwordConfirm.toLowerCase() !== user.email.toLowerCase()) {
        throw new AppError('Confirmation does not match your account email address.', 401, 'INVALID_CONFIRMATION');
      }
    }

    user.status = 'deactivated';
    await user.save();

    // Revoke all sessions for this user
    await Session.deleteMany({ user: user._id });

    // Broadcast disconnection and offline status
    const io = getSocketGateway();
    if (io) {
      io.to(`user:${userId}`).emit('auth:terminated', { reason: 'account_deactivated' });
      io.emit('presence:offline', { userId, lastSeen: new Date().toISOString() });
    }

    logger.info(`Account deactivated: ${user.username} (${user.id})`);
    return { success: true, message: 'Account deactivated successfully.' };
  }

  /**
   * Permanently delete user account (requires password verification)
   */
  static async deleteAccount(userId: string, passwordConfirm: string) {
    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.password) {
      const isMatch = await user.comparePassword(passwordConfirm);
      if (!isMatch) {
        throw new AppError('Incorrect password. Please verify your password to continue.', 401, 'INVALID_PASSWORD');
      }
    } else if (user.googleId && !user.password) {
      if (passwordConfirm.toLowerCase() !== user.email.toLowerCase()) {
        throw new AppError('Confirmation does not match your account email address.', 401, 'INVALID_CONFIRMATION');
      }
    }

    // Revoke all sessions for this user
    await Session.deleteMany({ user: user._id });

    // Broadcast disconnection
    const io = getSocketGateway();
    if (io) {
      io.to(`user:${userId}`).emit('auth:terminated', { reason: 'account_deleted' });
      io.emit('presence:offline', { userId, lastSeen: new Date().toISOString() });
    }

    // Delete user document
    await User.findByIdAndDelete(userId);

    logger.info(`Account permanently deleted: ${user.username} (${user.id})`);
    return { success: true, message: 'Account permanently deleted.' };
  }
}

