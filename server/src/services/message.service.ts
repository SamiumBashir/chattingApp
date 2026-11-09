import mongoose from 'mongoose';
import { Message } from '../models/Message.js';
import { MessageReceipt } from '../models/MessageReceipt.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/apiResponse.js';
import { SendMessageInput } from '../validators/message.validator.js';
import { NotificationService } from './notification.service.js';
import { getSocketGateway, activeUserSockets } from '../sockets/socketGateway.js';

export class MessageService {
  /**
   * Send and persist a new message with network idempotency protection
   */
  static async sendMessage(senderId: string, input: SendMessageInput) {
    const conversation = await Conversation.findById(input.conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (!conversation.hasParticipant(senderId)) {
      throw new AppError('You are not a member of this conversation', 403, 'FORBIDDEN');
    }

    // Check blocking rules for private conversations
    if (conversation.type === 'private') {
      const otherParticipant = conversation.participants.find(
        (p) => p.user.toString() !== senderId
      );
      if (otherParticipant) {
        const [senderUser, recipientUser] = await Promise.all([
          User.findById(senderId),
          User.findById(otherParticipant.user),
        ]);

        if (senderUser?.blockedUsers?.some((id) => id.toString() === otherParticipant.user.toString())) {
          throw new AppError('You have blocked this user', 403, 'USER_BLOCKED');
        }
        if (recipientUser?.blockedUsers?.some((id) => id.toString() === senderId)) {
          throw new AppError('You cannot message this user', 403, 'BLOCKED_BY_USER');
        }
      }
    }

    // Idempotency: check if message with this conversation + clientMessageId already exists
    const existing = await Message.findOne({
      conversation: input.conversationId,
      clientMessageId: input.clientMessageId,
    });

    if (existing) {
      await existing.populate('sender', 'name username avatar');
      if (existing.replyTo) {
        await existing.populate('replyTo', 'content sender type');
      }
      return {
        message: existing.toJSON(),
        recipientIds: conversation.participants
          .map((p) => p.user.toString())
          .filter((id) => id !== senderId),
        isDuplicate: true,
      };
    }

    // Validate replyTo target to prevent cross-conversation reply leaks
    let replyToObjectId: mongoose.Types.ObjectId | null = null;
    if (input.replyTo) {
      if (!mongoose.Types.ObjectId.isValid(input.replyTo)) {
        throw new AppError('Invalid replyTo message ID', 400, 'INVALID_REPLY_ID');
      }
      const replyTarget = await Message.findById(input.replyTo);
      if (!replyTarget || replyTarget.conversation.toString() !== input.conversationId) {
        throw new AppError('Cannot reply to a message from a different conversation', 400, 'CROSS_CONVERSATION_REPLY_FORBIDDEN');
      }
      replyToObjectId = replyTarget._id;
    }

    // Ensure message has text content or attachments
    const attachments = input.attachments || [];
    if (!input.content?.trim() && attachments.length === 0 && input.type !== 'system') {
      throw new AppError('Message cannot be empty', 400, 'EMPTY_MESSAGE');
    }

    const sanitizedAttachments = attachments.map((att) => ({
      ...att,
      secureUrl: att.secureUrl || att.url,
    }));

    let message: any;
    try {
      message = await Message.create({
        conversation: new mongoose.Types.ObjectId(input.conversationId),
        sender: new mongoose.Types.ObjectId(senderId),
        clientMessageId: input.clientMessageId,
        content: input.content || '',
        type: input.type || 'text',
        attachments: sanitizedAttachments,
        replyTo: replyToObjectId,
      });
    } catch (createErr: any) {
      // Handle concurrent race-condition retries where compound unique index caught duplicate
      if (createErr?.code === 11000) {
        const dupMessage = await Message.findOne({
          conversation: input.conversationId,
          clientMessageId: input.clientMessageId,
        });
        if (dupMessage) {
          await dupMessage.populate('sender', 'name username avatar');
          if (dupMessage.replyTo) {
            await dupMessage.populate('replyTo', 'content sender type');
          }
          return {
            message: dupMessage.toJSON(),
            recipientIds: conversation.participants
              .map((p) => p.user.toString())
              .filter((id) => id !== senderId),
            isDuplicate: true,
          };
        }
      }
      throw createErr;
    }

    const firstAtt = sanitizedAttachments[0];
    const previewContent =
      message.content ||
      (firstAtt
        ? firstAtt.fileType.startsWith('image/')
          ? '📷 Photo'
          : firstAtt.fileType.startsWith('audio/') || firstAtt.fileName?.startsWith('voice-')
          ? '🎤 Voice message'
          : `📎 ${firstAtt.fileName || 'Attachment'}`
        : `[${message.type}]`);

    // Update conversation cached lastMessage
    conversation.lastMessage = {
      messageId: message._id,
      content: previewContent,
      sender: new mongoose.Types.ObjectId(senderId),
      type: message.type,
      createdAt: message.createdAt,
    };
    conversation.updatedAt = new Date();
    await conversation.save();

    // Create receipts for recipients
    const otherParticipantIds = conversation.participants
      .map((p) => p.user.toString())
      .filter((id) => id !== senderId);

    if (otherParticipantIds.length > 0) {
      const receipts = otherParticipantIds.map((userId) => ({
        message: message._id,
        conversation: conversation._id,
        user: new mongoose.Types.ObjectId(userId),
        status: 'sent' as const,
      }));
      await MessageReceipt.insertMany(receipts, { ordered: false }).catch(() => {
        // Ignore duplicate key race conditions on receipts
      });
    }

    await message.populate('sender', 'name username avatar');
    if (message.replyTo) {
      await message.populate('replyTo', 'content sender type');
    }

    // Generate notifications for other participants ONLY if they are not actively in the conversation
    otherParticipantIds.forEach((recipientId) => {
      let isRecipientActiveInRoom = false;
      try {
        const gateway = getSocketGateway();
        if (gateway) {
          const roomSockets = gateway.sockets.adapter.rooms.get(`conversation:${conversation._id.toString()}`);
          const recipientSockets = activeUserSockets.get(recipientId);
          if (roomSockets && recipientSockets) {
            for (const sId of recipientSockets) {
              if (roomSockets.has(sId)) {
                isRecipientActiveInRoom = true;
                break;
              }
            }
          }
        }
      } catch {}

      // Only create unread notification when recipient is not currently inside the chat room
      if (!isRecipientActiveInRoom) {
        NotificationService.createNotification({
          recipientId,
          actorId: senderId,
          type: 'message',
          conversationId: conversation._id.toString(),
          messageId: message._id.toString(),
          title:
            conversation.type === 'group'
              ? `${(message.sender as any)?.name || 'Someone'} in ${conversation.groupName || 'Group'}`
              : (message.sender as any)?.name || 'New Message',
          body: message.content
            ? message.content.length > 60
              ? `${message.content.slice(0, 60)}...`
              : message.content
            : 'Sent an attachment',
        }).catch(() => {});
      }
    });

    return {
      message: message.toJSON(),
      recipientIds: otherParticipantIds,
      isDuplicate: false,
    };
  }

  /**
   * Fetch messages with cursor-based pagination
   */
  static async getMessages(
    conversationId: string,
    currentUserId: string,
    cursor?: string,
    limit = 50
  ) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (!conversation.hasParticipant(currentUserId)) {
      throw new AppError('You are not a member of this conversation', 403, 'FORBIDDEN');
    }

    const query: Record<string, unknown> = {
      conversation: new mongoose.Types.ObjectId(conversationId),
    };

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!isNaN(cursorDate.getTime())) {
        query.createdAt = { $lt: cursorDate };
      } else if (mongoose.Types.ObjectId.isValid(cursor)) {
        query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }
    }

    // Fetch limit + 1 to detect hasMore
    const rawMessages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('sender', 'name username avatar')
      .populate('replyTo', 'content sender type');

    const hasMore = rawMessages.length > limit;
    const messages = hasMore ? rawMessages.slice(0, limit) : rawMessages;

    const nextCursor =
      messages.length > 0
        ? messages[messages.length - 1].createdAt.toISOString()
        : null;

    // Return in chronological order (oldest -> newest) for client rendering
    const chronologicalMessages = messages.reverse().map((m) => m.toJSON());

    return {
      messages: chronologicalMessages,
      meta: {
        hasMore,
        nextCursor,
        limit,
      },
    };
  }

  /**
   * Mark message as delivered for user (can only transition from 'sent' to 'delivered')
   */
  static async markDelivered(messageId: string, userId: string) {
    return MessageReceipt.findOneAndUpdate(
      { message: messageId, user: userId, status: 'sent' },
      { status: 'delivered', deliveredAt: new Date() },
      { new: true }
    );
  }

  /**
   * Mark message as read for user (transitions from 'sent' or 'delivered' to 'read')
   */
  static async markRead(messageId: string, userId: string) {
    const receipt = await MessageReceipt.findOneAndUpdate(
      { message: messageId, user: userId, status: { $ne: 'read' } },
      { status: 'read', readAt: new Date() },
      { new: true }
    );

    if (receipt) {
      await Conversation.updateOne(
        { _id: receipt.conversation, 'participants.user': userId },
        { $set: { 'participants.$.lastReadMessage': messageId } }
      );
    }

    return receipt;
  }

  /**
   * Edit message content (sender only, within 24 hours, non-deleted)
   */
  static async editMessage(messageId: string, userId: string, newContent: string) {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new AppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    if (message.sender.toString() !== userId) {
      throw new AppError('You can only edit your own messages', 403, 'FORBIDDEN');
    }

    if (message.isDeleted) {
      throw new AppError('Cannot edit a deleted message', 400, 'MESSAGE_DELETED');
    }

    if (!newContent || !newContent.trim()) {
      throw new AppError('Message content cannot be empty', 400, 'EMPTY_MESSAGE');
    }

    if (newContent.length > 5000) {
      throw new AppError('Message content cannot exceed 5000 characters', 400, 'CONTENT_TOO_LONG');
    }

    // 24-hour edit window
    const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
    if (message.createdAt && Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new AppError(
        'Message edit window has expired (cannot edit messages older than 24 hours)',
        400,
        'EDIT_WINDOW_EXPIRED'
      );
    }

    message.content = newContent.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('sender', 'name username avatar');
    if (message.replyTo) {
      await message.populate('replyTo', 'content sender type');
    }

    return message.toJSON();
  }

  /**
   * Soft delete a message (sender or group owner/admin)
   */
  static async deleteMessage(messageId: string, userId: string) {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new AppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    let isAuthorized = message.sender.toString() === userId;

    const conversation = await Conversation.findById(message.conversation);
    if (!isAuthorized && conversation) {
      const role = conversation.getParticipantRole(userId);
      isAuthorized = role === 'owner' || role === 'admin';
    }

    if (!isAuthorized) {
      throw new AppError('Insufficient permissions to delete this message', 403, 'FORBIDDEN');
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = 'This message was deleted';
    message.attachments = [];
    message.reactions = [];
    await message.save();

    // If deleted message was the conversation cached lastMessage, update it to tombstone
    if (conversation && conversation.lastMessage?.messageId?.toString() === messageId) {
      conversation.lastMessage.content = 'This message was deleted';
      await conversation.save().catch(() => {});
    }

    return {
      messageId: message.id,
      conversationId: message.conversation.toString(),
      isDeleted: true,
      deletedAt: message.deletedAt,
    };
  }

  /**
   * Add or update an emoji reaction on a message
   */
  static async addReaction(messageId: string, userId: string, emoji: string) {
    if (!emoji || !emoji.trim() || emoji.trim().length > 16) {
      throw new AppError('Invalid emoji reaction', 400, 'INVALID_EMOJI');
    }

    const message = await Message.findById(messageId);
    if (!message) {
      throw new AppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    if (message.isDeleted) {
      throw new AppError('Cannot react to a deleted message', 400, 'MESSAGE_DELETED');
    }

    // Strict Authorization: Verify user is an authorized participant in the conversation
    const conversation = await Conversation.findById(message.conversation);
    if (!conversation || !conversation.hasParticipant(userId)) {
      throw new AppError(
        'You cannot react to messages in a conversation you are not a member of',
        403,
        'FORBIDDEN'
      );
    }

    const trimmedEmoji = emoji.trim();
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const existingIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId
    );

    if (existingIndex >= 0) {
      message.reactions[existingIndex].emoji = trimmedEmoji;
      message.reactions[existingIndex].createdAt = new Date();
    } else {
      message.reactions.push({
        user: userObjectId,
        emoji: trimmedEmoji,
        createdAt: new Date(),
      });
    }

    await message.save();
    return {
      messageId: message.id,
      conversationId: message.conversation.toString(),
      reactions: message.reactions,
    };
  }

  /**
   * Remove an emoji reaction from a message
   */
  static async removeReaction(messageId: string, userId: string) {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new AppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // Strict Authorization: Verify user is an authorized participant in the conversation
    const conversation = await Conversation.findById(message.conversation);
    if (!conversation || !conversation.hasParticipant(userId)) {
      throw new AppError(
        'You cannot alter reactions in a conversation you are not a member of',
        403,
        'FORBIDDEN'
      );
    }

    message.reactions = message.reactions.filter((r) => r.user.toString() !== userId);
    await message.save();

    return {
      messageId: message.id,
      conversationId: message.conversation.toString(),
      reactions: message.reactions,
    };
  }

  /**
   * Search messages across user's authorized conversations
   */
  static async searchMessages(
    userId: string,
    queryText: string,
    options: { conversationId?: string; limit?: number; page?: number } = {}
  ) {
    if (!queryText || !queryText.trim()) {
      return { messages: [], total: 0, page: 1, totalPages: 0 };
    }

    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    let targetConversationIds: mongoose.Types.ObjectId[] = [];

    if (options.conversationId) {
      const conv = await Conversation.findById(options.conversationId);
      if (!conv || !conv.hasParticipant(userId)) {
        throw new AppError('Conversation not found or access denied', 403);
      }
      targetConversationIds = [conv._id];
    } else {
      const userConvs = await Conversation.find(
        { 'participants.user': new mongoose.Types.ObjectId(userId) },
        '_id'
      );
      targetConversationIds = userConvs.map((c) => c._id);
    }

    if (targetConversationIds.length === 0) {
      return { messages: [], total: 0, page: 1, totalPages: 0 };
    }

    const escaped = queryText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query: Record<string, any> = {
      conversation: { $in: targetConversationIds },
      isDeleted: false,
      content: { $regex: escaped, $options: 'i' },
    };

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'name username avatar')
        .populate('conversation', 'type groupName groupAvatar'),
      Message.countDocuments(query),
    ]);

    return {
      messages: messages.map((m) => m.toJSON()),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
