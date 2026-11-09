import { Types } from 'mongoose';
import { Notification, INotification, NotificationType } from '../models/Notification.js';
import { AppError } from '../utils/apiResponse.js';
import { getSocketGateway } from '../sockets/socketGateway.js';

export interface CreateNotificationParams {
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  conversationId?: string;
  messageId?: string;
  title: string;
  body: string;
}

export class NotificationService {
  /**
   * Create a new notification and emit real-time event
   */
  static async createNotification(params: CreateNotificationParams): Promise<INotification> {
    // Do not notify a user about their own actions
    if (params.actorId && params.actorId === params.recipientId) {
      return null as any;
    }

    const notification = await Notification.create({
      recipient: new Types.ObjectId(params.recipientId),
      actor: params.actorId ? new Types.ObjectId(params.actorId) : undefined,
      type: params.type,
      conversation: params.conversationId ? new Types.ObjectId(params.conversationId) : undefined,
      message: params.messageId ? new Types.ObjectId(params.messageId) : undefined,
      title: params.title,
      body: params.body,
    });

    const populated = await Notification.findById(notification._id)
      .populate('actor', 'id name username avatar')
      .populate('conversation', 'id type groupName groupAvatar');

    // Real-time socket dispatch
    try {
      const gateway = getSocketGateway();
      if (gateway) {
        gateway.to(`user:${params.recipientId}`).emit('notification:new', {
          notification: populated?.toJSON() || notification.toJSON(),
        });
      }
    } catch {
      // Socket emission failure shouldn't abort persistence
    }

    return populated || notification;
  }

  /**
   * Get user's notifications with pagination and unread count
   */
  static async getUserNotifications(
    userId: string,
    options: { page?: number; limit?: number; unreadOnly?: boolean } = {}
  ) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = { recipient: new Types.ObjectId(userId) };
    if (options.unreadOnly) {
      query.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actor', 'id name username avatar')
        .populate('conversation', 'id type groupName groupAvatar'),
      Notification.countDocuments(query),
      Notification.countDocuments({ recipient: new Types.ObjectId(userId), isRead: false }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark a single notification as read
   */
  static async markAsRead(notificationId: string, userId: string): Promise<INotification> {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new AppError('Invalid notification ID', 400);
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: new Types.ObjectId(notificationId), recipient: new Types.ObjectId(userId) },
      { $set: { isRead: true } },
      { new: true }
    )
      .populate('actor', 'id name username avatar')
      .populate('conversation', 'id type groupName groupAvatar');

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    // Real-time socket dispatch for cross-device sync
    try {
      const gateway = getSocketGateway();
      if (gateway) {
        const unreadCount = await Notification.countDocuments({
          recipient: new Types.ObjectId(userId),
          isRead: false,
        });
        gateway.to(`user:${userId}`).emit('notification:read', {
          notificationId,
          unreadCount,
        });
        gateway.to(`user:${userId}`).emit('notification:count', {
          unreadCount,
        });
      }
    } catch {}

    return notification;
  }

  /**
   * Mark all unread notifications for a user as read
   */
  static async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    const result = await Notification.updateMany(
      { recipient: new Types.ObjectId(userId), isRead: false },
      { $set: { isRead: true } }
    );

    // Real-time socket dispatch
    try {
      const gateway = getSocketGateway();
      if (gateway) {
        gateway.to(`user:${userId}`).emit('notification:read', {
          all: true,
          unreadCount: 0,
        });
        gateway.to(`user:${userId}`).emit('notification:count', {
          unreadCount: 0,
        });
      }
    } catch {}

    return { modifiedCount: result.modifiedCount };
  }
}
