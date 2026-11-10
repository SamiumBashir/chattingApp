import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthenticatedSocket, socketAuthMiddleware } from './socketAuth.middleware.js';
import { MessageService } from '../services/message.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { logger } from '../utils/logger.js';
import { sendMessageSchema } from '../validators/message.validator.js';
import { CallStateService } from '../services/callState.service.js';
import { CallPersistenceService } from '../services/callPersistence.service.js';

// Map tracking active socket connections per user for presence management
export const activeUserSockets = new Map<string, Set<string>>();

// Rate limiting map: socketId -> timestamp[]
const socketEventTimestamps = new Map<string, number[]>();
const MAX_EVENTS_PER_WINDOW = 60;
const WINDOW_MS = 5000;

export const checkSocketRateLimit = (socketId: string): boolean => {
  const now = Date.now();
  const timestamps = socketEventTimestamps.get(socketId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);
  if (validTimestamps.length >= MAX_EVENTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }
  validTimestamps.push(now);
  socketEventTimestamps.set(socketId, validTimestamps);
  return true;
};

// Dedicated call initiation rate limiting: max 5 calls per 10 seconds
const callInitiateTimestamps = new Map<string, number[]>();
const MAX_CALL_INITIATE_PER_WINDOW = 5;
const CALL_INITIATE_WINDOW_MS = 10000;

export const checkCallInitiateRateLimit = (socketId: string): boolean => {
  const now = Date.now();
  const timestamps = callInitiateTimestamps.get(socketId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < CALL_INITIATE_WINDOW_MS);
  if (validTimestamps.length >= MAX_CALL_INITIATE_PER_WINDOW) {
    return false;
  }
  validTimestamps.push(now);
  callInitiateTimestamps.set(socketId, validTimestamps);
  return true;
};

// Dedicated signaling rate limiting: max 100 signaling events per 5 seconds
const signalingTimestamps = new Map<string, number[]>();
const MAX_SIGNALING_PER_WINDOW = 100;
const SIGNALING_WINDOW_MS = 5000;

export const checkSignalingRateLimit = (socketId: string): boolean => {
  const now = Date.now();
  const timestamps = signalingTimestamps.get(socketId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < SIGNALING_WINDOW_MS);
  if (validTimestamps.length >= MAX_SIGNALING_PER_WINDOW) {
    return false;
  }
  validTimestamps.push(now);
  signalingTimestamps.set(socketId, validTimestamps);
  return true;
};

export const clearRateLimitTracking = (): void => {
  socketEventTimestamps.clear();
  callInitiateTimestamps.clear();
  signalingTimestamps.clear();
};

// In-memory map for ephemeral typing timeouts per conversation per user
// Key: `${conversationId}_${userId}`
const typingTimeouts = new Map<string, NodeJS.Timeout>();

// Active 1-on-1 WebRTC Call Sessions tracking for authorization and cleanup
export interface ActiveCallSession {
  callId: string;
  callerId: string;
  callerSocketId?: string;
  recipientId: string;
  recipientSocketId?: string;
  conversationId: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'connecting' | 'connected' | 'ended';
  startedAt: Date;
  connectedAt?: Date;
  endedAt?: Date;
}

export const activeCalls = new Map<string, ActiveCallSession>(); // callId -> ActiveCallSession
export const userCallMap = new Map<string, string>(); // userId -> callId
export const callTimeouts = new Map<string, NodeJS.Timeout>(); // callId -> 15s ringing timeout

// Helper schema for MongoDB ObjectIds
const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
});

// WebRTC Signaling payload validation schemas
export const sdpSchema = z.object({
  type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
  sdp: z.string().min(1).max(200000),
}).passthrough();

export const iceCandidateSchema = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
}).passthrough();

export const callInitiateSchema = z.object({
  recipientId: objectIdSchema,
  conversationId: objectIdSchema,
  callType: z.enum(['audio', 'video']),
  caller: z.any().optional(),
}).passthrough();

export const callAnswerSchema = z.object({
  callerId: objectIdSchema,
  conversationId: objectIdSchema,
  callType: z.enum(['audio', 'video']),
  callId: z.string().optional(),
}).passthrough();

export const callRejectSchema = z.object({
  callerId: objectIdSchema.optional(),
  callId: z.string().optional(),
  reason: z.string().max(100).optional(),
}).passthrough();

export const callEndSchema = z.object({
  callId: z.string().optional(),
  targetUserId: objectIdSchema.optional(),
  conversationId: objectIdSchema.optional(),
  reason: z.string().max(100).optional(),
}).passthrough();

export const webrtcOfferSchema = z.object({
  callId: z.string().optional(),
  targetUserId: objectIdSchema,
  sdp: sdpSchema,
}).passthrough();

export const webrtcAnswerSchema = z.object({
  callId: z.string().optional(),
  targetUserId: objectIdSchema,
  sdp: sdpSchema,
}).passthrough();

export const webrtcIceCandidateSchema = z.object({
  callId: z.string().optional(),
  targetUserId: objectIdSchema,
  candidate: iceCandidateSchema,
}).passthrough();

let globalIo: SocketIOServer | null = null;

export const getSocketGateway = (): SocketIOServer | null => {
  return globalIo;
};

/**
 * Force disconnect all active socket connections for a given user (e.g. on ban or logout-all)
 */
export const disconnectUserSockets = (userId: string, reason = 'SESSION_REVOKED'): void => {
  if (!globalIo) return;
  if (typeof (globalIo.to as any) === 'function') {
    globalIo.to(`user:${userId}`).emit('auth:revoked', { reason });
  }
  if (typeof (globalIo.in as any) === 'function') {
    try {
      (globalIo.in(`user:${userId}`) as any).disconnectSockets(true);
    } catch {}
  }
  const socketIds = activeUserSockets.get(userId);
  if (socketIds) {
    Array.from(socketIds).forEach((socketId) => {
      const socket = globalIo?.sockets?.sockets?.get(socketId);
      if (socket) {
        socket.emit('auth:revoked', { reason });
        socket.disconnect(true);
      }
    });
  }
};

/**
 * Force disconnect all active socket connections for a specific session across cluster
 */
export const disconnectSessionSockets = (sessionId: string, reason = 'SESSION_REVOKED'): void => {
  if (!globalIo) return;
  if (typeof (globalIo.to as any) === 'function') {
    globalIo.to(`session:${sessionId}`).emit('auth:revoked', { reason });
  }
  if (typeof (globalIo.in as any) === 'function') {
    try {
      (globalIo.in(`session:${sessionId}`) as any).disconnectSockets(true);
    } catch {}
  }
  globalIo.sockets?.sockets?.forEach((socket) => {
    const authSocket = socket as AuthenticatedSocket;
    if (authSocket.data?.user?.sessionId === sessionId) {
      socket.emit('auth:revoked', { reason });
      socket.disconnect(true);
    }
  });
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

    // Add to presence map & distributed CallStateService (Redis)
    if (!activeUserSockets.has(userId)) {
      activeUserSockets.set(userId, new Set());
    }
    activeUserSockets.get(userId)!.add(socket.id);

    // Join personal user room and session room for direct events / multi-device & cluster sync
    socket.join(`user:${userId}`);
    if (user.sessionId) {
      socket.join(`session:${user.sessionId}`);
    }

    CallStateService.addSocket(userId, socket.id, user.sessionId)
      .then(({ isFirstSocket }) => {
        if (isFirstSocket) {
          // Broadcast online presence if first active connection across all devices
          io.emit('presence:online', { userId, timestamp: new Date().toISOString() });
        }
      })
      .catch((err) => {
        logger.warn(`Redis addSocket error for user ${userId}:`, err);
      });

    // Query online presence for a list of users across cluster
    socket.on('presence:subscribe', async (data: { userIds: string[] }, callback) => {
      const statuses = await CallStateService.getUsersPresence(data?.userIds || []);
      if (typeof callback === 'function') {
        callback({ statuses });
      }
    });

    // Join conversation room (verifies membership in MongoDB)
    socket.on('conversation:join', async (data: { conversationId: string }, callback) => {
      try {
        if (!checkSocketRateLimit(socket.id)) {
          if (callback) callback({ success: false, error: 'Rate limit exceeded' });
          return;
        }

        if (
          !data?.conversationId ||
          typeof data.conversationId !== 'string' ||
          !mongoose.Types.ObjectId.isValid(data.conversationId)
        ) {
          if (callback) callback({ success: false, error: 'Invalid conversation ID' });
          return;
        }

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
      if (!data?.conversationId || typeof data.conversationId !== 'string') return;
      socket.leave(`conversation:${data.conversationId}`);
      logger.debug(`Socket ${socket.id} left conversation:${data.conversationId}`);
    });

    // Typing Indicators (Ephemeral - no database writes)
    socket.on('typing:start', (data: { conversationId: string }) => {
      if (!checkSocketRateLimit(socket.id)) return;
      if (!data?.conversationId || typeof data.conversationId !== 'string') return;
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
      if (!checkSocketRateLimit(socket.id)) return;
      if (!data?.conversationId || typeof data.conversationId !== 'string') return;
      if (!socket.rooms.has(`conversation:${data.conversationId}`)) return;

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
        if (!checkSocketRateLimit(socket.id)) {
          if (typeof callback === 'function') {
            callback({ success: false, error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' });
          }
          return;
        }

        const validated = sendMessageSchema.parse(payload);
        const result = await MessageService.sendMessage(userId, validated);

        // Auto-join conversation room if socket is not in it yet
        if (!socket.rooms.has(`conversation:${validated.conversationId}`)) {
          socket.join(`conversation:${validated.conversationId}`);
        }

        // Broadcast to conversation room
        io.to(`conversation:${validated.conversationId}`).emit('message:new', result.message);

        // Broadcast to personal rooms of recipients
        result.recipientIds.forEach((recipientId) => {
          io.to(`user:${recipientId}`).emit('message:new', result.message);
        });

        // Multi-device sync: Broadcast to sender's other devices/tabs
        io.to(`user:${userId}`).emit('message:new', result.message);

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
        if (!checkSocketRateLimit(socket.id)) return;
        if (!data?.conversationId || !socket.rooms.has(`conversation:${data.conversationId}`)) return;
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
        if (!checkSocketRateLimit(socket.id)) return;
        if (!data?.conversationId || !socket.rooms.has(`conversation:${data.conversationId}`)) return;
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
        if (!checkSocketRateLimit(socket.id)) return;
        if (!data?.conversationId || !socket.rooms.has(`conversation:${data.conversationId}`)) return;
        await ConversationService.markConversationRead(data.conversationId, userId);
      } catch (err) {
        logger.debug('Error in conversation:read handler:', err);
      }
    });

    // Message Edit
    socket.on(
      'message:edit',
      async (data: { messageId: string; conversationId: string; content: string }, callback) => {
        try {
          if (!checkSocketRateLimit(socket.id)) {
            if (typeof callback === 'function') callback({ success: false, error: 'Rate limit exceeded' });
            return;
          }
          if (!data?.conversationId || !socket.rooms.has(`conversation:${data.conversationId}`)) {
            if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized room' });
            return;
          }
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
          if (!checkSocketRateLimit(socket.id)) {
            if (typeof callback === 'function') callback({ success: false, error: 'Rate limit exceeded' });
            return;
          }
          if (!data?.conversationId || !socket.rooms.has(`conversation:${data.conversationId}`)) {
            if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized room' });
            return;
          }
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
          if (!checkSocketRateLimit(socket.id)) {
            if (typeof callback === 'function') callback({ success: false, error: 'Rate limit exceeded' });
            return;
          }
          if (!data?.conversationId || !socket.rooms.has(`conversation:${data.conversationId}`)) {
            if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized room' });
            return;
          }
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
    socket.on('call:initiate', async (rawPayload: any, callback) => {
      try {
        if (!checkCallInitiateRateLimit(socket.id)) {
          if (typeof callback === 'function') callback({ success: false, error: 'Rate limit exceeded' });
          return;
        }

        const parseResult = callInitiateSchema.safeParse(rawPayload);
        if (!parseResult.success) {
          if (typeof callback === 'function') callback({ success: false, error: 'Invalid call payload' });
          return;
        }
        const data = parseResult.data;

        if (data.recipientId === userId) {
          if (typeof callback === 'function') callback({ success: false, error: 'Cannot call yourself' });
          return;
        }

        // Check if recipient is online (local or cluster-wide)
        let isOnline = Boolean(activeUserSockets.get(data.recipientId)?.size);
        if (!isOnline && typeof (io.in as any) === 'function') {
          try {
            const sockets = await io.in(`user:${data.recipientId}`).fetchSockets();
            isOnline = sockets.length > 0;
          } catch {}
        }
        if (!isOnline) {
          if (typeof callback === 'function') callback({ success: false, reason: 'offline' });
          return;
        }

        // Check Glare condition: reciprocal calling attempt between same pair
        const peerActiveCallId = userCallMap.get(data.recipientId);
        const peerSession = peerActiveCallId ? activeCalls.get(peerActiveCallId) : null;
        if (
          peerSession &&
          peerSession.status === 'ringing' &&
          peerSession.callerId === data.recipientId &&
          peerSession.recipientId === userId
        ) {
          // Glare: Both users called each other simultaneously
          // Deterministic tie-break: user with lexicographically higher ID takes precedence as caller
          if (userId.localeCompare(data.recipientId) > 0) {
            if (callTimeouts.has(peerSession.callId)) {
              clearTimeout(callTimeouts.get(peerSession.callId)!);
              callTimeouts.delete(peerSession.callId);
            }
            activeCalls.delete(peerSession.callId);
            userCallMap.delete(userId);
            userCallMap.delete(data.recipientId);
            logger.debug(`Glare resolved: ${userId} caller wins over ${data.recipientId}`);
          } else {
            // Remote user wins; inform caller that existing session is active
            if (typeof callback === 'function') {
              callback({ success: true, callId: peerSession.callId, glareHandled: true });
            }
            return;
          }
        } else if (userCallMap.has(userId) || userCallMap.has(data.recipientId)) {
          const busyCallId = `busy_${Date.now()}_${userId}_${data.recipientId}`;
          CallPersistenceService.recordCallTermination(
            {
              callId: busyCallId,
              callerId: userId,
              recipientId: data.recipientId,
              conversationId: data.conversationId,
              callType: data.callType,
              status: 'ended',
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              reason: 'busy',
            },
            'busy'
          ).catch(() => {});
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

        // Server-verified caller profile (derived strictly from authenticated session and database, NEVER trusting client payload)
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
          callerSocketId: socket.id,
          recipientId: data.recipientId,
          conversationId: data.conversationId,
          callType: data.callType,
          status: 'ringing',
          startedAt: new Date(),
        };

        activeCalls.set(callId, session);
        userCallMap.set(userId, callId);
        userCallMap.set(data.recipientId, callId);

        CallStateService.initiateCall({
          callId: session.callId,
          callerId: session.callerId,
          callerSocketId: session.callerSocketId,
          recipientId: session.recipientId,
          recipientSocketId: session.recipientSocketId,
          conversationId: session.conversationId,
          callType: session.callType,
          status: session.status,
          startedAt: session.startedAt.toISOString(),
          connectedAt: session.connectedAt?.toISOString(),
          endedAt: session.endedAt?.toISOString(),
        }).catch((err) => {
          logger.warn(`Redis initiateCall error:`, err);
        });

        // 15-second automatic ring timeout: auto-cut call if recipient doesn't answer within 15 seconds
        const ringTimeout = setTimeout(() => {
          callTimeouts.delete(callId);
          const currentSession = activeCalls.get(callId);
          if (currentSession && currentSession.status === 'ringing') {
            activeCalls.delete(callId);
            userCallMap.delete(currentSession.callerId);
            userCallMap.delete(currentSession.recipientId);

            io.to(`user:${currentSession.callerId}`).emit('call:ended', {
              callId,
              conversationId: currentSession.conversationId,
              reason: 'timeout',
            });
            io.to(`user:${currentSession.recipientId}`).emit('call:ended', {
              callId,
              conversationId: currentSession.conversationId,
              reason: 'timeout',
            });

            CallStateService.endCall(callId, 'timeout').catch(() => {});
          }
        }, 15000);
        callTimeouts.set(callId, ringTimeout);

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
          callback({ success: false, error: 'Internal call initiation error' });
        }
      }
    });

    // 2. Answer / Accept incoming call
    socket.on('call:answer', (rawPayload: any, callback?: Function) => {
      if (!checkSignalingRateLimit(socket.id)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const parseResult = callAnswerSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        logger.warn(`Invalid call:answer payload from ${userId}`);
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid answer payload' });
        return;
      }
      const data = parseResult.data;

      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;

      if (data.callId && session && session.callId !== data.callId) {
        logger.warn(`Mismatch callId in call:answer from ${userId}: expected ${session.callId}, got ${data.callId}`);
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid call ID' });
        return;
      }

      if (session && session.recipientId === userId && session.callerId === data.callerId) {
        if (session.status !== 'ringing') {
          logger.warn(
            `Duplicate or invalid call:answer attempt by user ${userId} for call ${session.callId}: status is ${session.status}`
          );
          if (typeof callback === 'function') callback({ success: false, error: 'Call already answered or ended' });
          return;
        }

        if (callTimeouts.has(session.callId)) {
          clearTimeout(callTimeouts.get(session.callId)!);
          callTimeouts.delete(session.callId);
        }
        session.status = 'connecting';
        session.recipientSocketId = socket.id;

        io.to(`user:${session.callerId}`).emit('call:accepted', {
          callId: session.callId,
          recipientId: userId,
          conversationId: data.conversationId,
          callType: data.callType,
        });
        // Multi-device sync: Notify recipient's other devices that call was answered
        socket.to(`user:${userId}`).emit('call:answered-elsewhere', {
          callId: session.callId,
        });

        if (typeof callback === 'function') callback({ success: true, callId: session.callId });

        CallStateService.atomicAcceptCall(session.callId, userId, socket.id).catch((err) => {
          logger.warn(`Redis atomicAcceptCall error for call ${session.callId}:`, err);
        });
      } else {
        // If not in local in-memory state (cross-instance), attempt via Redis
        CallStateService.getUserCallId(userId)
          .then(async (remoteCallId) => {
            if (!remoteCallId || (data.callId && remoteCallId !== data.callId)) {
              logger.warn(`Unauthorized call:answer attempt by user ${userId}`);
              if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized call session' });
              return;
            }
            const acceptResult = await CallStateService.atomicAcceptCall(remoteCallId, userId, socket.id);
            if (!acceptResult.success) {
              logger.warn(`Redis atomicAcceptCall failed for user ${userId}: ${acceptResult.reason}`);
              if (typeof callback === 'function') callback({ success: false, error: acceptResult.reason });
              return;
            }
            const remoteSession = await CallStateService.getCallSession(remoteCallId);
            if (remoteSession && remoteSession.callerId === data.callerId) {
              io.to(`user:${remoteSession.callerId}`).emit('call:accepted', {
                callId: remoteSession.callId,
                recipientId: userId,
                conversationId: data.conversationId,
                callType: data.callType,
              });
              socket.to(`user:${userId}`).emit('call:answered-elsewhere', {
                callId: remoteSession.callId,
              });
              if (typeof callback === 'function') callback({ success: true, callId: remoteSession.callId });
            }
          })
          .catch((err) => {
            logger.warn(`Error handling remote call:answer for user ${userId}:`, err);
            if (typeof callback === 'function') callback({ success: false, error: 'Internal error' });
          });
      }
    });

    // 2b. Acknowledge WebRTC media stream connected
    socket.on('call:connected', (data: { callId?: string }) => {
      const callId = data?.callId || userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;
      if (session && (session.callerId === userId || session.recipientId === userId)) {
        session.status = 'connected';
        session.connectedAt = new Date();
        logger.debug(`WebRTC media stream confirmed connected for call ${session.callId}`);
        CallStateService.markCallConnected(session.callId).catch(() => {});
      } else if (data?.callId) {
        CallStateService.markCallConnected(data.callId).catch(() => {});
      }
    });

    // 3. Reject / Decline incoming call
    socket.on('call:reject', (rawPayload?: any, callback?: Function) => {
      if (!checkSignalingRateLimit(socket.id)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const parseResult = callRejectSchema.safeParse(rawPayload || {});
      if (!parseResult.success) {
        logger.warn(`Invalid call:reject payload from ${userId}`);
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid reject payload' });
        return;
      }
      const data = parseResult.data;

      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;

      if (data.callId && session && session.callId !== data.callId) {
        logger.warn(`Mismatch callId in call:reject from ${userId}`);
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid call ID' });
        return;
      }

      if (session && (session.recipientId === userId || session.callerId === userId)) {
        if (callTimeouts.has(session.callId)) {
          clearTimeout(callTimeouts.get(session.callId)!);
          callTimeouts.delete(session.callId);
        }
        const targetId = session.recipientId === userId ? session.callerId : session.recipientId;
        activeCalls.delete(session.callId);
        userCallMap.delete(session.callerId);
        userCallMap.delete(session.recipientId);

        io.to(`user:${targetId}`).emit('call:rejected', {
          callId: session.callId,
          recipientId: userId,
          reason: data?.reason || 'declined',
        });
        // Multi-device sync: Notify recipient's other devices that call was declined
        socket.to(`user:${userId}`).emit('call:rejected-elsewhere', {
          callId: session.callId,
        });

        if (typeof callback === 'function') callback({ success: true });

        CallStateService.endCall(session.callId, data?.reason || 'declined').catch(() => {});
      } else {
        // Fallback to Redis if not in local memory
        CallStateService.getUserCallId(userId)
          .then(async (remoteCallId) => {
            if (!remoteCallId || (data.callId && remoteCallId !== data.callId)) {
              if (typeof callback === 'function') callback({ success: false, error: 'No active call' });
              return;
            }
            const remoteSession = await CallStateService.getCallSession(remoteCallId);
            await CallStateService.endCall(remoteCallId, data?.reason || 'declined');
            if (remoteSession && (remoteSession.recipientId === userId || remoteSession.callerId === userId)) {
              const targetId = remoteSession.recipientId === userId ? remoteSession.callerId : remoteSession.recipientId;
              io.to(`user:${targetId}`).emit('call:rejected', {
                callId: remoteSession.callId,
                recipientId: userId,
                reason: data?.reason || 'declined',
              });
              socket.to(`user:${userId}`).emit('call:rejected-elsewhere', {
                callId: remoteSession.callId,
              });
              if (typeof callback === 'function') callback({ success: true });
            }
          })
          .catch(() => {
            if (typeof callback === 'function') callback({ success: false, error: 'Internal error' });
          });
      }
    });

    // 4. End active or ongoing call
    socket.on('call:end', (rawPayload?: any, callback?: Function) => {
      if (!checkSignalingRateLimit(socket.id)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const parseResult = callEndSchema.safeParse(rawPayload || {});
      if (!parseResult.success) {
        logger.warn(`Invalid call:end payload from ${userId}`);
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid end payload' });
        return;
      }
      const data = parseResult.data;

      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;

      if (data.callId && session && session.callId !== data.callId) {
        logger.warn(`Mismatch callId in call:end from ${userId}`);
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid call ID' });
        return;
      }

      if (session && (session.recipientId === userId || session.callerId === userId)) {
        if (callTimeouts.has(session.callId)) {
          clearTimeout(callTimeouts.get(session.callId)!);
          callTimeouts.delete(session.callId);
        }
        // Authoritative target ID: strictly the other participant in server session!
        const targetId = session.recipientId === userId ? session.callerId : session.recipientId;
        activeCalls.delete(session.callId);
        userCallMap.delete(session.callerId);
        userCallMap.delete(session.recipientId);

        io.to(`user:${targetId}`).emit('call:ended', {
          callId: session.callId,
          byUserId: userId,
          conversationId: session.conversationId,
          reason: data?.reason || 'ended',
        });

        if (typeof callback === 'function') callback({ success: true });

        CallStateService.endCall(session.callId, data?.reason || 'ended').catch(() => {});
      } else {
        // Fallback to Redis if not in local memory
        CallStateService.getUserCallId(userId)
          .then(async (remoteCallId) => {
            if (!remoteCallId || (data.callId && remoteCallId !== data.callId)) {
              if (typeof callback === 'function') callback({ success: false, error: 'No active call' });
              return;
            }
            const remoteSession = await CallStateService.getCallSession(remoteCallId);
            await CallStateService.endCall(remoteCallId, data?.reason || 'ended');
            if (remoteSession && (remoteSession.recipientId === userId || remoteSession.callerId === userId)) {
              const targetId = remoteSession.recipientId === userId ? remoteSession.callerId : remoteSession.recipientId;
              io.to(`user:${targetId}`).emit('call:ended', {
                callId: remoteSession.callId,
                byUserId: userId,
                conversationId: remoteSession.conversationId,
                reason: data?.reason || 'ended',
              });
              if (typeof callback === 'function') callback({ success: true });
            }
          })
          .catch(() => {
            if (typeof callback === 'function') callback({ success: false, error: 'Internal error' });
          });
      }
    });

    // 5. WebRTC Signaling: Offer
    socket.on('webrtc:offer', (rawPayload: any) => {
      if (!checkSignalingRateLimit(socket.id)) return;

      const parseResult = webrtcOfferSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        logger.warn(`Rejected invalid webrtc:offer schema from ${userId}`);
        return;
      }
      const data = parseResult.data;

      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;
      if (!session || (session.callerId !== userId && session.recipientId !== userId)) {
        logger.warn(`Rejected unauthenticated webrtc:offer from ${userId}`);
        return;
      }

      if (session.status === 'ended') {
        logger.warn(`Rejected webrtc:offer on ended call ${session.callId}`);
        return;
      }

      if (data.callId && data.callId !== session.callId) {
        logger.warn(`Mismatch callId in webrtc:offer from ${userId}`);
        return;
      }

      // Security: Target user MUST match the active peer in server session
      const peerId = session.callerId === userId ? session.recipientId : session.callerId;
      if (peerId !== data.targetUserId) {
        logger.warn(`Rejected webrtc:offer to mismatch peer ${data.targetUserId}`);
        return;
      }

      io.to(`user:${data.targetUserId}`).emit('webrtc:offer', {
        callId: session.callId,
        senderId: userId,
        sdp: data.sdp,
      });
    });

    // 6. WebRTC Signaling: Answer
    socket.on('webrtc:answer', (rawPayload: any) => {
      if (!checkSignalingRateLimit(socket.id)) return;

      const parseResult = webrtcAnswerSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        logger.warn(`Rejected invalid webrtc:answer schema from ${userId}`);
        return;
      }
      const data = parseResult.data;

      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;
      if (!session || (session.callerId !== userId && session.recipientId !== userId)) {
        logger.warn(`Rejected unauthenticated webrtc:answer from ${userId}`);
        return;
      }

      if (session.status === 'ended') {
        logger.warn(`Rejected webrtc:answer on ended call ${session.callId}`);
        return;
      }

      if (data.callId && data.callId !== session.callId) {
        logger.warn(`Mismatch callId in webrtc:answer from ${userId}`);
        return;
      }

      const peerId = session.callerId === userId ? session.recipientId : session.callerId;
      if (peerId !== data.targetUserId) {
        logger.warn(`Rejected webrtc:answer to mismatch peer ${data.targetUserId}`);
        return;
      }

      io.to(`user:${data.targetUserId}`).emit('webrtc:answer', {
        callId: session.callId,
        senderId: userId,
        sdp: data.sdp,
      });
    });

    // 7. WebRTC Signaling: ICE Candidate
    socket.on('webrtc:ice-candidate', (rawPayload: any) => {
      if (!checkSignalingRateLimit(socket.id)) return;

      const parseResult = webrtcIceCandidateSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        return;
      }
      const data = parseResult.data;

      const callId = userCallMap.get(userId);
      const session = callId ? activeCalls.get(callId) : null;
      if (!session || (session.callerId !== userId && session.recipientId !== userId)) {
        return;
      }

      if (session.status === 'ended') {
        return;
      }

      if (data.callId && data.callId !== session.callId) {
        return;
      }

      const peerId = session.callerId === userId ? session.recipientId : session.callerId;
      if (peerId !== data.targetUserId) {
        return;
      }

      io.to(`user:${data.targetUserId}`).emit('webrtc:ice-candidate', {
        callId: session.callId,
        senderId: userId,
        candidate: data.candidate,
      });
    });

    // Disconnect cleanup
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id} (user: ${user.username})`);

      const userSockets = activeUserSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          activeUserSockets.delete(userId);
        }
      }
      const localSocketsRemaining = userSockets ? userSockets.size : 0;

      // Active call cleanup: Notify peer if disconnected abruptly
      const activeCallId = userCallMap.get(userId);
      if (activeCallId) {
        const session = activeCalls.get(activeCallId);
        const isCallSocket =
          session &&
          (session.callerSocketId === socket.id || session.recipientSocketId === socket.id);

        // Do NOT terminate an active call merely because one device disconnects!
        // Only terminate if the active call socket disconnected OR all sockets for the user disconnected locally.
        if (session && (isCallSocket || localSocketsRemaining === 0)) {
          if (callTimeouts.has(activeCallId)) {
            clearTimeout(callTimeouts.get(activeCallId)!);
            callTimeouts.delete(activeCallId);
          }
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

          CallStateService.endCall(activeCallId, 'peer_disconnected').catch(() => {});
        }
      }

      // Cleanup rate limit tracking for socket
      socketEventTimestamps.delete(socket.id);
      callInitiateTimestamps.delete(socket.id);
      signalingTimestamps.delete(socket.id);

      // Distributed Redis cleanup & cluster offline presence
      CallStateService.removeSocket(userId, socket.id)
        .then(({ isLastSocket }) => {
          if (isLastSocket && localSocketsRemaining === 0) {
            const lastSeenDate = new Date();
            User.findByIdAndUpdate(userId, { lastSeen: lastSeenDate }).catch((err) => {
              logger.warn(`Failed to update lastSeen on disconnect for user ${userId}:`, err);
            });
            io.emit('presence:offline', {
              userId,
              lastSeen: lastSeenDate.toISOString(),
            });
          }
        })
        .catch((err) => {
          logger.warn(`Redis removeSocket error for socket ${socket.id}:`, err);
        });
    });
  });
};
