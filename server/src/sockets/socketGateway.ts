import { Server as SocketIOServer } from 'socket.io';
import { AuthenticatedSocket, socketAuthMiddleware } from './socketAuth.middleware.js';
import { MessageService } from '../services/message.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { Conversation } from '../models/Conversation.js';
import { Notification } from '../models/Notification.js';
import { logger } from '../utils/logger.js';
import { sendMessageSchema } from '../validators/message.validator.js';

// Map tracking active socket connections per user for presence management
export const activeUserSockets = new Map<string, Set<string>>();

// In-memory map for ephemeral typing timeouts per conversation per user
// Key: `${conversationId}_${userId}`
const typingTimeouts = new Map<string, NodeJS.Timeout>();

let globalIo: SocketIOServer | null = null;

export const getSocketGateway = (): SocketIOServer | null => {
  return globalIo;
};

export const setupSocketGateway = (io: SocketIOServer): void => {
  globalIo = io;
  // Apply JWT authentication middleware to all connections
  io.use(socketAuthMiddleware);

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const user = socket.data.user;
    const userId = user.userId;

    logger.debug(`User connected: ${user.username} (socket: ${socket.id})`);

    // Add to presence map
    if (!activeUserSockets.has(userId)) {
      activeUserSockets.set(userId, new Set());
      // Broadcast online presence if first active connection
      io.emit('presence:online', { userId, timestamp: new Date().toISOString() });
    }
    activeUserSockets.get(userId)!.add(socket.id);

    // Join personal user room for direct events / multi-device sync
    socket.join(`user:${userId}`);

    // Query online presence for a list of users
    socket.on('presence:subscribe', (data: { userIds: string[] }, callback) => {
      const statuses: Record<string, boolean> = {};
      if (Array.isArray(data?.userIds)) {
        data.userIds.forEach((id) => {
          statuses[id] = activeUserSockets.has(id);
        });
      }
      if (typeof callback === 'function') {
        callback({ statuses });
      }
    });

    // Join conversation room (verifies membership in MongoDB)
    socket.on('conversation:join', async (data: { conversationId: string }, callback) => {
      try {
        const conversation = await Conversation.findById(data.conversationId);
        if (!conversation || !conversation.hasParticipant(userId)) {
          if (callback) callback({ success: false, error: 'Unauthorized conversation room' });
          return;
        }

        socket.join(`conversation:${data.conversationId}`);
        logger.debug(`Socket ${socket.id} joined conversation:${data.conversationId}`);
        if (callback) callback({ success: true });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // Leave conversation room
    socket.on('conversation:leave', (data: { conversationId: string }) => {
      socket.leave(`conversation:${data.conversationId}`);
      logger.debug(`Socket ${socket.id} left conversation:${data.conversationId}`);
    });

    // Typing Indicators (Ephemeral - no database writes)
    socket.on('typing:start', (data: { conversationId: string }) => {
      const key = `${data.conversationId}_${userId}`;

      // Clear existing timeout if present
      if (typingTimeouts.has(key)) {
        clearTimeout(typingTimeouts.get(key)!);
      }

      // Broadcast typing to conversation room (excluding the sender)
      socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
        conversationId: data.conversationId,
        userId,
        username: user.username,
        isTyping: true,
      });

      // Auto-clear typing after 4 seconds of inactivity
      const timeout = setTimeout(() => {
        socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
          conversationId: data.conversationId,
          userId,
          username: user.username,
          isTyping: false,
        });
        typingTimeouts.delete(key);
      }, 4000);

      typingTimeouts.set(key, timeout);
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      const key = `${data.conversationId}_${userId}`;
      if (typingTimeouts.has(key)) {
        clearTimeout(typingTimeouts.get(key)!);
        typingTimeouts.delete(key);
      }

      socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
        conversationId: data.conversationId,
        userId,
        username: user.username,
        isTyping: false,
      });
    });

    // Send real-time message
    socket.on('message:send', async (payload: unknown, callback) => {
      try {
        const validated = sendMessageSchema.parse(payload);
        const result = await MessageService.sendMessage(userId, validated);

        // Broadcast to conversation room
        io.to(`conversation:${validated.conversationId}`).emit('message:new', result.message);

        // Broadcast to personal rooms of recipients
        result.recipientIds.forEach((recipientId) => {
          io.to(`user:${recipientId}`).emit('message:new', result.message);
        });

        if (typeof callback === 'function') {
          callback({ success: true, message: result.message, isDuplicate: result.isDuplicate });
        }
      } catch (err: any) {
        logger.error('Socket message:send error:', err);
        if (typeof callback === 'function') {
          callback({
            success: false,
            error: err.message || 'Failed to send message',
            code: err.code || 'MESSAGE_ERROR',
          });
        }
      }
    });

    // Message delivered acknowledgment
    socket.on('message:delivered', async (data: { messageId: string; conversationId: string }) => {
      try {
        if (data.messageId) {
          await MessageService.markDelivered(data.messageId, userId);
          io.to(`conversation:${data.conversationId}`).emit('message:status', {
            messageId: data.messageId,
            conversationId: data.conversationId,
            userId,
            status: 'delivered',
          });
        }
      } catch (err) {
        logger.debug('Error marking message delivered:', err);
      }
    });

    // Message read acknowledgment
    socket.on('message:read', async (data: { messageId: string; conversationId: string }) => {
      try {
        if (data.messageId) {
          await MessageService.markRead(data.messageId, userId);
          // Mark notification as read
          await Notification.updateOne(
            { recipient: userId, message: data.messageId, isRead: false },
            { $set: { isRead: true } }
          );
          io.to(`conversation:${data.conversationId}`).emit('message:status', {
            messageId: data.messageId,
            conversationId: data.conversationId,
            userId,
            status: 'read',
          });
          const unreadCount = await Notification.countDocuments({
            recipient: userId,
            isRead: false,
          });
          io.to(`user:${userId}`).emit('notification:count', { unreadCount });
        }
      } catch (err) {
        logger.debug('Error marking message read:', err);
      }
    });

    // Entire conversation read acknowledgment
    socket.on('conversation:read', async (data: { conversationId: string }) => {
      try {
        if (data?.conversationId) {
          await ConversationService.markConversationRead(data.conversationId, userId);
        }
      } catch (err) {
        logger.debug('Error in conversation:read handler:', err);
      }
    });

    // Message Edit
    socket.on(
      'message:edit',
      async (data: { messageId: string; conversationId: string; content: string }, callback) => {
        try {
          const updated = await MessageService.editMessage(data.messageId, userId, data.content);
          io.to(`conversation:${data.conversationId}`).emit('message:edited', updated);
          if (typeof callback === 'function') callback({ success: true, message: updated });
        } catch (err: any) {
          if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
      }
    );

    // Message Delete
    socket.on(
      'message:delete',
      async (data: { messageId: string; conversationId: string }, callback) => {
        try {
          const result = await MessageService.deleteMessage(data.messageId, userId);
          io.to(`conversation:${data.conversationId}`).emit('message:deleted', result);
          if (typeof callback === 'function') callback({ success: true, ...result });
        } catch (err: any) {
          if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
      }
    );

    // Message Reaction
    socket.on(
      'message:reaction',
      async (
        data: { messageId: string; conversationId: string; emoji: string; action: 'add' | 'remove' },
        callback
      ) => {
        try {
          const result =
            data.action === 'remove'
              ? await MessageService.removeReaction(data.messageId, userId)
              : await MessageService.addReaction(data.messageId, userId, data.emoji);

          io.to(`conversation:${data.conversationId}`).emit('message:reaction-updated', result);
          if (typeof callback === 'function') callback({ success: true, ...result });
        } catch (err: any) {
          if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
      }
    );

    // Disconnect cleanup
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id} (user: ${user.username})`);
      const userSockets = activeUserSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          activeUserSockets.delete(userId);
          // Broadcast offline presence only when all sockets for this user are disconnected
          io.emit('presence:offline', {
            userId,
            lastSeen: new Date().toISOString(),
          });
        }
      }
    });
  });
};
