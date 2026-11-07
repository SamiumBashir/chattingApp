import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import { AuthenticatedSocket, socketAuthMiddleware } from './socketAuth.middleware.js';
import { MessageService } from '../services/message.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { logger } from '../utils/logger.js';
import { sendMessageSchema } from '../validators/message.validator.js';

// Map tracking active socket connections per user for presence management
export const activeUserSockets = new Map<string, Set<string>>();

// In-memory map for ephemeral typing timeouts per conversation per user
// Key: `${conversationId}_${userId}`
const typingTimeouts = new Map<string, NodeJS.Timeout>();

// Active 1-on-1 WebRTC Call Sessions tracking for authorization and cleanup
export interface ActiveCallSession {
  callId: string;
  callerId: string;
  recipientId: string;
  conversationId: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'connected';
  startedAt: Date;
}

export const activeCalls = new Map<string, ActiveCallSession>(); // callId -> ActiveCallSession
export const userCallMap = new Map<string, string>(); // userId -> callId

// WebRTC Signaling payload validation schemas
const sdpSchema = z.object({
  type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
  sdp: z.string().min(1).max(200000),
}).passthrough();

const iceCandidateSchema = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
}).passthrough();

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
      if (!data?.conversationId) return;
      if (!socket.rooms.has(`conversation:${data.conversationId}`)) return;

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
      if (!data?.conversationId) return;
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

    // ==========================================
    // WebRTC 1-on-1 Audio & Video Calling (Secured & Validated)
    // ==========================================

    // 1. Initiate an outgoing call
    socket.on(
      'call:initiate',
      async (
        data: {
          recipientId: string;
          conversationId: string;
          callType: 'audio' | 'video';
        },
        callback
      ) => {
        try {
          if (!data?.recipientId || !data?.conversationId || !data?.callType) {
            if (typeof callback === 'function') callback({ success: false, error: 'Invalid call payload' });
            return;
          }

          if (data.recipientId === userId) {
            if (typeof callback === 'function') callback({ success: false, error: 'Cannot call yourself' });
            return;
          }

          // Check if recipient is online
          const isOnline = Boolean(activeUserSockets.get(data.recipientId)?.size);
          if (!isOnline) {
            if (typeof callback === 'function') callback({ success: false, reason: 'offline' });
            return;
          }

          // Check if caller or recipient is already in a call
          if (userCallMap.has(userId) || userCallMap.has(data.recipientId)) {
            if (typeof callback === 'function') callback({ success: false, reason: 'busy' });
            return;
          }

          // Verify conversation exists and both users are authorized members
          const conversation = await Conversation.findById(data.conversationId);
          if (
            !conversation ||
            !conversation.hasParticipant(userId) ||
            !conversation.hasParticipant(data.recipientId)
          ) {
            if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized conversation participant' });
            return;
          }

          // Verify user blocking status
          const [callerDoc, recipientDoc] = await Promise.all([
            User.findById(userId),
            User.findById(data.recipientId),
          ]);

          if (!callerDoc || !recipientDoc) {
            if (typeof callback === 'function') callback({ success: false, error: 'User not found' });
            return;
          }

          const isBlockedByCaller = callerDoc.blockedUsers?.some((id) => id.toString() === data.recipientId);
          const isBlockedByRecipient = recipientDoc.blockedUsers?.some((id) => id.toString() === userId);
          if (isBlockedByCaller || isBlockedByRecipient) {
            if (typeof callback === 'function') callback({ success: false, error: 'Call blocked' });
            return;
          }

          // Server-verified caller profile (derived from authenticated session and database)
          const verifiedCaller = {
            id: userId,
            name: callerDoc.name || user.username,
            username: callerDoc.username || user.username,
            avatar: callerDoc.avatar,
          };

          const callId = `call_${Date.now()}_${userId}_${data.recipientId}`;
          const session: ActiveCallSession = {
            callId,
            callerId: userId,
            recipientId: data.recipientId,
            conversationId: data.conversationId,
            callType: data.callType,
            status: 'ringing',
            startedAt: new Date(),
          };

          activeCalls.set(callId, session);
          userCallMap.set(userId, callId);
          userCallMap.set(data.recipientId, callId);

          // Emit incoming call to recipient's personal room
          io.to(`user:${data.recipientId}`).emit('call:incoming', {
            callId,
            callerId: userId,
            caller: verifiedCaller,
            conversationId: data.conversationId,
            callType: data.callType,
          });

          if (typeof callback === 'function') {
            callback({ success: true, callId });
          }
        } catch (err: any) {
          logger.error('Error initiating call:', err);
          if (typeof callback === 'function') {
            callback({ success: false, error: err.message });
          }
        }
      }
    );

    // 2. Answer / Accept incoming call
    socket.on(
      'call:answer',
      (data: { callerId: string; conversationId: string; callType: 'audio' | 'video' }) => {
        const callId = userCallMap.get(userId);
        const session = callId ? activeCalls.get(callId) : null;

        if (session && session.recipientId === userId && session.callerId === data.callerId) {
          session.status = 'connected';
          io.to(`user:${session.callerId}`).emit('call:accepted', {
            callId: session.callId,
            recipientId: userId,
            conversationId: data.conversationId,
            callType: data.callType,
          });
        } else {
          logger.warn(`Unauthorized call:answer attempt by user ${userId}`);
        }
      }
    );

    // 3. Reject / Decline incoming call
    socket.on('call:reject', (data: { callerId: string; reason?: string }) => {
      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;

      if (session && (session.recipientId === userId || session.callerId === userId)) {
        const targetId = session.recipientId === userId ? session.callerId : session.recipientId;
        activeCalls.delete(session.callId);
        userCallMap.delete(session.callerId);
        userCallMap.delete(session.recipientId);

        io.to(`user:${targetId}`).emit('call:rejected', {
          callId: session.callId,
          recipientId: userId,
          reason: data?.reason || 'declined',
        });
      } else if (data?.callerId) {
        // Fallback cleanup if session was already removed
        io.to(`user:${data.callerId}`).emit('call:rejected', {
          recipientId: userId,
          reason: data?.reason || 'declined',
        });
      }
    });

    // 4. End active or ongoing call
    socket.on('call:end', (data?: { targetUserId?: string; conversationId?: string }) => {
      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;

      if (session && (session.recipientId === userId || session.callerId === userId)) {
        const targetId = session.recipientId === userId ? session.callerId : session.recipientId;
        activeCalls.delete(session.callId);
        userCallMap.delete(session.callerId);
        userCallMap.delete(session.recipientId);

        io.to(`user:${targetId}`).emit('call:ended', {
          callId: session.callId,
          byUserId: userId,
          conversationId: session.conversationId,
          reason: 'ended',
        });
      } else if (data?.targetUserId) {
        // Fallback cleanup if session was already removed
        io.to(`user:${data.targetUserId}`).emit('call:ended', {
          byUserId: userId,
          conversationId: data.conversationId,
          reason: 'ended',
        });
      }
    });

    // 5. WebRTC Signaling: Offer
    socket.on('webrtc:offer', (data: { targetUserId: string; sdp: any }) => {
      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;
      if (!session || (session.callerId !== userId && session.recipientId !== userId)) {
        logger.warn(`Rejected unauthenticated webrtc:offer from ${userId}`);
        return;
      }

      const peerId = session.callerId === userId ? session.recipientId : session.callerId;
      if (peerId !== data.targetUserId) {
        logger.warn(`Rejected webrtc:offer to mismatch peer ${data.targetUserId}`);
        return;
      }

      const parsedSdp = sdpSchema.safeParse(data.sdp);
      if (!parsedSdp.success) {
        logger.warn(`Rejected invalid SDP offer from ${userId}`);
        return;
      }

      io.to(`user:${data.targetUserId}`).emit('webrtc:offer', {
        callId: session.callId,
        senderId: userId,
        sdp: parsedSdp.data,
      });
    });

    // 6. WebRTC Signaling: Answer
    socket.on('webrtc:answer', (data: { targetUserId: string; sdp: any }) => {
      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;
      if (!session || (session.callerId !== userId && session.recipientId !== userId)) {
        logger.warn(`Rejected unauthenticated webrtc:answer from ${userId}`);
        return;
      }

      const peerId = session.callerId === userId ? session.recipientId : session.callerId;
      if (peerId !== data.targetUserId) {
        logger.warn(`Rejected webrtc:answer to mismatch peer ${data.targetUserId}`);
        return;
      }

      const parsedSdp = sdpSchema.safeParse(data.sdp);
      if (!parsedSdp.success) {
        logger.warn(`Rejected invalid SDP answer from ${userId}`);
        return;
      }

      io.to(`user:${data.targetUserId}`).emit('webrtc:answer', {
        callId: session.callId,
        senderId: userId,
        sdp: parsedSdp.data,
      });
    });

    // 7. WebRTC Signaling: ICE Candidate
    socket.on('webrtc:ice-candidate', (data: { targetUserId: string; candidate: any }) => {
      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;
      if (!session || (session.callerId !== userId && session.recipientId !== userId)) {
        return;
      }

      const peerId = session.callerId === userId ? session.recipientId : session.callerId;
      if (peerId !== data.targetUserId) {
        return;
      }

      const parsedCandidate = iceCandidateSchema.safeParse(data.candidate);
      if (!parsedCandidate.success) {
        return;
      }

      io.to(`user:${data.targetUserId}`).emit('webrtc:ice-candidate', {
        callId: session.callId,
        senderId: userId,
        candidate: parsedCandidate.data,
      });
    });

    // Disconnect cleanup
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id} (user: ${user.username})`);

      // Active call cleanup: Notify peer if disconnected abruptly
      const activeCallId = userCallMap.get(userId);
      if (activeCallId) {
        const session = activeCalls.get(activeCallId);
        if (session) {
          const peerId = session.callerId === userId ? session.recipientId : session.callerId;
          activeCalls.delete(activeCallId);
          userCallMap.delete(session.callerId);
          userCallMap.delete(session.recipientId);

          io.to(`user:${peerId}`).emit('call:ended', {
            callId: session.callId,
            byUserId: userId,
            conversationId: session.conversationId,
            reason: 'peer_disconnected',
          });
        }
      }

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
