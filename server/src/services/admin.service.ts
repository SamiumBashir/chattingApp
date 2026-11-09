import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Report } from '../models/Report.js';
import { AuditLog } from '../models/AuditLog.js';
import { AppError } from '../utils/apiResponse.js';
import { UpdateReportInput, CreateReportInput } from '../validators/admin.validator.js';
import { disconnectUserSockets } from '../sockets/socketGateway.js';

export class AdminService {
  /**
   * System overview metrics and KPIs
   */
  static async getOverview() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      recentSignups,
      totalConversations,
      totalMessages,
      pendingReports,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'suspended' }),
      User.countDocuments({ status: 'banned' }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Conversation.countDocuments(),
      Message.countDocuments({ isDeleted: false }),
      Report.countDocuments({ status: 'pending' }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        banned: bannedUsers,
        recentSignups,
      },
      conversations: {
        total: totalConversations,
      },
      messages: {
        total: totalMessages,
      },
      moderation: {
        pendingReports,
      },
    };
  }

  /**
   * List users with pagination, filters, and search
   */
  static async getUsers(options: {
    page?: number;
    limit?: number;
    status?: string;
    role?: string;
    q?: string;
  } = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};

    if (options.status) {
      query.status = options.status;
    }
    if (options.role) {
      query.role = options.role;
    }
    if (options.q && options.q.trim()) {
      const escaped = options.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { username: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query),
    ]);

    return {
      users: users.map((u) => u.toJSON()),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update user account status (active, suspended, banned)
   */
  static async updateUserStatus(
    targetUserId: string,
    newStatus: 'active' | 'suspended' | 'banned',
    actorId: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    if (targetUserId === actorId) {
      throw new AppError('You cannot change your own status', 400);
    }

    const [targetUser, actor] = await Promise.all([
      User.findById(targetUserId),
      User.findById(actorId),
    ]);

    if (!targetUser) {
      throw new AppError('Target user not found', 404);
    }

    // Superadmin protection
    if (targetUser.role === 'superadmin' && actor?.role !== 'superadmin') {
      throw new AppError('Only superadmins can modify another superadmin', 403);
    }

    const previousStatus = targetUser.status;
    targetUser.status = newStatus;
    await targetUser.save();

    // Revoke active sessions and disconnect live sockets if account is suspended or banned
    if (newStatus === 'banned' || newStatus === 'suspended') {
      await Session.updateMany(
        { user: targetUser._id, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
      );
      disconnectUserSockets(
        targetUser.id,
        newStatus === 'banned' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED'
      );
    }

    // Log administrative action
    await AuditLog.create({
      action: 'user_status_changed',
      actor: new mongoose.Types.ObjectId(actorId),
      targetUser: targetUser._id,
      targetResource: 'user',
      resourceId: targetUser.id,
      ipAddress,
      userAgent,
      metadata: {
        previousStatus,
        newStatus,
        reason: reason || 'Administrative action',
      },
    });

    return targetUser.toJSON();
  }

  /**
   * Create a user moderation report
   */
  static async createReport(reporterId: string, input: CreateReportInput) {
    const report = await Report.create({
      reporter: new mongoose.Types.ObjectId(reporterId),
      reportedUser: input.reportedUserId
        ? new mongoose.Types.ObjectId(input.reportedUserId)
        : undefined,
      reportedMessage: input.reportedMessageId
        ? new mongoose.Types.ObjectId(input.reportedMessageId)
        : undefined,
      reportedConversation: input.reportedConversationId
        ? new mongoose.Types.ObjectId(input.reportedConversationId)
        : undefined,
      reason: input.reason,
      description: input.description,
      status: 'pending',
    });

    return report.toJSON();
  }

  /**
   * List reports for moderation queue
   */
  static async getReports(options: { page?: number; limit?: number; status?: string } = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};
    if (options.status) {
      query.status = options.status;
    }

    const [reports, total] = await Promise.all([
      Report.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reporter', 'name username avatar')
        .populate('reportedUser', 'name username avatar status')
        .populate('reportedMessage', 'content isDeleted createdAt')
        .populate('reviewedBy', 'name username'),
      Report.countDocuments(query),
    ]);

    return {
      reports: reports.map((r) => r.toJSON()),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update report status and execute moderation actions
   */
  static async updateReport(
    reportId: string,
    input: UpdateReportInput,
    reviewerId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const report = await Report.findById(reportId);
    if (!report) {
      throw new AppError('Report not found', 404);
    }

    report.status = input.status;
    report.actionTaken = input.actionTaken || 'none';
    report.reviewedBy = new mongoose.Types.ObjectId(reviewerId);
    report.reviewedAt = new Date();
    if (input.notes) report.notes = input.notes;

    // Execute automated moderation action if requested
    if (input.actionTaken === 'user_banned' && report.reportedUser) {
      await this.updateUserStatus(
        report.reportedUser.toString(),
        'banned',
        reviewerId,
        `Banned via report resolution ${report.id}`,
        ipAddress,
        userAgent
      );
    } else if (input.actionTaken === 'user_suspended' && report.reportedUser) {
      await this.updateUserStatus(
        report.reportedUser.toString(),
        'suspended',
        reviewerId,
        `Suspended via report resolution ${report.id}`,
        ipAddress,
        userAgent
      );
    } else if (input.actionTaken === 'message_deleted' && report.reportedMessage) {
      const msg = await Message.findById(report.reportedMessage);
      if (msg && !msg.isDeleted) {
        msg.isDeleted = true;
        msg.deletedAt = new Date();
        msg.content = 'This message was removed by a moderator';
        await msg.save();
      }
    }

    await report.save();

    await AuditLog.create({
      action: 'report_resolved',
      actor: new mongoose.Types.ObjectId(reviewerId),
      targetUser: report.reportedUser,
      targetResource: 'report',
      resourceId: report.id,
      ipAddress,
      userAgent,
      metadata: {
        status: input.status,
        actionTaken: input.actionTaken,
        notes: input.notes,
      },
    });

    const populated = await Report.findById(report._id)
      .populate('reporter', 'name username avatar')
      .populate('reportedUser', 'name username avatar status')
      .populate('reportedMessage', 'content isDeleted createdAt')
      .populate('reviewedBy', 'name username');

    return populated!.toJSON();
  }

  /**
   * Fetch audit logs
   */
  static async getAuditLogs(options: {
    page?: number;
    limit?: number;
    action?: string;
    actorId?: string;
  } = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};
    if (options.action) query.action = options.action;
    if (options.actorId) query.actor = new mongoose.Types.ObjectId(options.actorId);

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actor', 'name username avatar role')
        .populate('targetUser', 'name username avatar role'),
      AuditLog.countDocuments(query),
    ]);

    return {
      logs: logs.map((l) => l.toJSON()),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
