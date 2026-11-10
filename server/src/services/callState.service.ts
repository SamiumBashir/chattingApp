import Redis from 'ioredis';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { CallPersistenceService } from './callPersistence.service.js';

export interface ActiveCallSession {
  callId: string;
  callerId: string;
  callerSocketId?: string;
  recipientId: string;
  recipientSocketId?: string;
  conversationId: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'connecting' | 'connected' | 'ended';
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
  reason?: string;
}

// In-Memory Fallbacks when Redis is not connected / test environment
const memoryUserSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
const memorySocketUsers = new Map<string, { userId: string; sessionId?: string }>(); // socketId -> data
const memoryActiveCalls = new Map<string, ActiveCallSession>(); // callId -> ActiveCallSession
const memoryUserCallMap = new Map<string, string>(); // userId -> callId

export class CallStateService {
  private static get redis(): Redis | null {
    return getRedisClient();
  }

  // =========================================================================
  // 1. PRESENCE & MULTI-DEVICE SOCKET TRACKING
  // =========================================================================

  /**
   * Tracks a new socket connection for a user.
   * Supports multiple devices per user account.
   */
  public static async addSocket(
    userId: string,
    socketId: string,
    sessionId?: string
  ): Promise<{ isFirstSocket: boolean; totalSockets: number }> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const key = `presence:user:${userId}:sockets`;
        const socketKey = `presence:socket:${socketId}`;

        // SADD returns number of newly added elements (1 if new, 0 if existed)
        const added = await redis.sadd(key, socketId);
        await redis.expire(key, 86400); // 24-hour TTL

        const payload = JSON.stringify({ userId, sessionId, connectedAt: Date.now() });
        await redis.set(socketKey, payload, 'EX', 86400);

        const totalSockets = await redis.scard(key);
        return { isFirstSocket: added === 1 && totalSockets === 1, totalSockets };
      } catch (err: any) {
        logger.warn(`Redis addSocket error (${err.message}). Using memory fallback.`);
      }
    }

    // In-memory fallback
    if (!memoryUserSockets.has(userId)) {
      memoryUserSockets.set(userId, new Set());
    }
    const set = memoryUserSockets.get(userId)!;
    const isFirstSocket = set.size === 0;
    set.add(socketId);
    memorySocketUsers.set(socketId, { userId, sessionId });

    return { isFirstSocket, totalSockets: set.size };
  }

  /**
   * Removes a disconnecting socket.
   * Returns whether this was the user's last connected device.
   */
  public static async removeSocket(
    userId: string,
    socketId: string
  ): Promise<{ isLastSocket: boolean; remainingSockets: number }> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const key = `presence:user:${userId}:sockets`;
        const socketKey = `presence:socket:${socketId}`;

        await redis.srem(key, socketId);
        await redis.del(socketKey);

        const remainingSockets = await redis.scard(key);
        if (remainingSockets === 0) {
          await redis.del(key);
        }

        return { isLastSocket: remainingSockets === 0, remainingSockets };
      } catch (err: any) {
        logger.warn(`Redis removeSocket error (${err.message}). Using memory fallback.`);
      }
    }

    // In-memory fallback
    memorySocketUsers.delete(socketId);
    const set = memoryUserSockets.get(userId);
    if (!set) {
      return { isLastSocket: true, remainingSockets: 0 };
    }

    set.delete(socketId);
    const remainingSockets = set.size;
    if (remainingSockets === 0) {
      memoryUserSockets.delete(userId);
    }

    return { isLastSocket: remainingSockets === 0, remainingSockets };
  }

  /**
   * Returns all active socket IDs for a given user across all connected devices
   */
  public static async getUserSockets(userId: string): Promise<string[]> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const key = `presence:user:${userId}:sockets`;
        return await redis.smembers(key);
      } catch (err: any) {
        logger.warn(`Redis getUserSockets error (${err.message}). Using memory fallback.`);
      }
    }

    const set = memoryUserSockets.get(userId);
    return set ? Array.from(set) : [];
  }

  /**
   * Checks whether a user is currently online on at least one device
   */
  public static async isUserOnline(userId: string): Promise<boolean> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const key = `presence:user:${userId}:sockets`;
        const count = await redis.scard(key);
        return count > 0;
      } catch (err: any) {
        logger.warn(`Redis isUserOnline error (${err.message}). Using memory fallback.`);
      }
    }

    const set = memoryUserSockets.get(userId);
    return Boolean(set && set.size > 0);
  }

  /**
   * Returns online presence map for an array of user IDs
   */
  public static async getUsersPresence(userIds: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    if (!Array.isArray(userIds) || userIds.length === 0) return result;

    const redis = this.redis;
    if (redis && redis.status === 'ready') {
      try {
        const pipeline = redis.pipeline();
        userIds.forEach((id) => {
          pipeline.scard(`presence:user:${id}:sockets`);
        });
        const responses = await pipeline.exec();
        if (responses) {
          responses.forEach(([err, count], index) => {
            const id = userIds[index];
            result[id] = !err && Number(count) > 0;
          });
          return result;
        }
      } catch (err: any) {
        logger.warn(`Redis getUsersPresence error (${err.message}). Using memory fallback.`);
      }
    }

    userIds.forEach((id) => {
      const set = memoryUserSockets.get(id);
      result[id] = Boolean(set && set.size > 0);
    });

    return result;
  }

  // =========================================================================
  // 2. DISTRIBUTED CALL STATE MANAGEMENT
  // =========================================================================

  /**
   * Initiates a new 1-on-1 call session with conflict detection.
   * Prevents initiating a call if either participant is already on an active call.
   */
  public static async initiateCall(
    session: ActiveCallSession,
    ttlSeconds = 7200
  ): Promise<{ success: boolean; session?: ActiveCallSession; reason?: string }> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const callerCallKey = `call:user:${session.callerId}`;
        const recipientCallKey = `call:user:${session.recipientId}`;
        const sessionKey = `call:session:${session.callId}`;

        // Check if recipient is already on an active call
        const existingRecipientCallId = await redis.get(recipientCallKey);
        if (existingRecipientCallId && existingRecipientCallId !== session.callId) {
          const rawExisting = await redis.get(`call:session:${existingRecipientCallId}`);
          if (rawExisting) {
            const existingSession = JSON.parse(rawExisting) as ActiveCallSession;
            if (existingSession.status !== 'ended') {
              return { success: false, reason: 'busy' };
            }
          }
        }

        // Store active session and user-to-call mappings with TTL
        const pipeline = redis.pipeline();
        pipeline.set(sessionKey, JSON.stringify(session), 'EX', ttlSeconds);
        pipeline.set(callerCallKey, session.callId, 'EX', ttlSeconds);
        pipeline.set(recipientCallKey, session.callId, 'EX', ttlSeconds);
        await pipeline.exec();

        return { success: true, session };
      } catch (err: any) {
        logger.warn(`Redis initiateCall error (${err.message}). Using memory fallback.`);
      }
    }

    // In-memory fallback
    const recipientActiveCallId = memoryUserCallMap.get(session.recipientId);
    if (recipientActiveCallId && recipientActiveCallId !== session.callId) {
      const existing = memoryActiveCalls.get(recipientActiveCallId);
      if (existing && existing.status !== 'ended') {
        return { success: false, reason: 'busy' };
      }
    }

    memoryActiveCalls.set(session.callId, session);
    memoryUserCallMap.set(session.callerId, session.callId);
    memoryUserCallMap.set(session.recipientId, session.callId);

    return { success: true, session };
  }

  /**
   * Retrieves active call session by callId
   */
  public static async getCallSession(callId: string): Promise<ActiveCallSession | null> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const raw = await redis.get(`call:session:${callId}`);
        if (!raw) return null;
        return JSON.parse(raw) as ActiveCallSession;
      } catch (err: any) {
        logger.warn(`Redis getCallSession error (${err.message}). Using memory fallback.`);
      }
    }

    return memoryActiveCalls.get(callId) || null;
  }

  /**
   * Retrieves active callId for a given user
   */
  public static async getUserCallId(userId: string): Promise<string | null> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        return await redis.get(`call:user:${userId}`);
      } catch (err: any) {
        logger.warn(`Redis getUserCallId error (${err.message}). Using memory fallback.`);
      }
    }

    return memoryUserCallMap.get(userId) || null;
  }

  /**
   * Atomic Call Acceptance:
   * Prevents duplicate call acceptance across multiple devices or multiple server instances.
   * Only transitions from 'ringing' to 'connecting'.
   */
  public static async atomicAcceptCall(
    callId: string,
    recipientId: string,
    recipientSocketId: string
  ): Promise<{ success: boolean; session?: ActiveCallSession; reason?: string }> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const sessionKey = `call:session:${callId}`;

        // Lua script for atomic state check and transition
        const luaScript = `
          local raw = redis.call('GET', KEYS[1])
          if not raw then
            return cjson.encode({ success = false, reason = 'not_found' })
          end
          local session = cjson.decode(raw)
          if session.recipientId ~= ARGV[1] then
            return cjson.encode({ success = false, reason = 'unauthorized' })
          end
          if session.status ~= 'ringing' then
            return cjson.encode({ success = false, reason = 'already_answered', status = session.status })
          end
          session.status = 'connecting'
          session.recipientSocketId = ARGV[2]
          redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
          return cjson.encode({ success = true, session = session })
        `;

        const resultRaw = (await redis.eval(luaScript, 1, sessionKey, recipientId, recipientSocketId)) as string;
        const parsed = JSON.parse(resultRaw);

        return parsed;
      } catch (err: any) {
        logger.warn(`Redis atomicAcceptCall error (${err.message}). Using memory fallback.`);
      }
    }

    // In-memory fallback
    const session = memoryActiveCalls.get(callId);
    if (!session) {
      return { success: false, reason: 'not_found' };
    }
    if (session.recipientId !== recipientId) {
      return { success: false, reason: 'unauthorized' };
    }
    if (session.status !== 'ringing') {
      return { success: false, reason: 'already_answered' };
    }

    session.status = 'connecting';
    session.recipientSocketId = recipientSocketId;
    return { success: true, session };
  }

  /**
   * Marks a call session as fully connected once WebRTC media is established
   */
  public static async markCallConnected(callId: string): Promise<ActiveCallSession | null> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const sessionKey = `call:session:${callId}`;
        const raw = await redis.get(sessionKey);
        if (!raw) return null;

        const session = JSON.parse(raw) as ActiveCallSession;
        session.status = 'connected';
        session.connectedAt = new Date().toISOString();

        await redis.set(sessionKey, JSON.stringify(session), 'KEEPTTL');
        return session;
      } catch (err: any) {
        logger.warn(`Redis markCallConnected error (${err.message}). Using memory fallback.`);
      }
    }

    const session = memoryActiveCalls.get(callId);
    if (session) {
      session.status = 'connected';
      session.connectedAt = new Date().toISOString();
    }
    return session || null;
  }

  /**
   * Terminates an active call session and removes user mappings.
   * Preserves session record for 60 seconds TTL for history / delivery checks.
   */
  public static async endCall(callId: string, reason = 'ended'): Promise<ActiveCallSession | null> {
    const redis = this.redis;

    if (redis && redis.status === 'ready') {
      try {
        const sessionKey = `call:session:${callId}`;
        const raw = await redis.get(sessionKey);
        if (!raw) return null;

        const session = JSON.parse(raw) as ActiveCallSession;
        session.status = 'ended';
        session.endedAt = new Date().toISOString();
        session.reason = reason;

        const pipeline = redis.pipeline();
        pipeline.del(`call:user:${session.callerId}`);
        pipeline.del(`call:user:${session.recipientId}`);
        // Retain ended call record for 60 seconds
        pipeline.set(sessionKey, JSON.stringify(session), 'EX', 60);
        await pipeline.exec();

        // Persist to MongoDB & inject timeline message asynchronously
        CallPersistenceService.recordCallTermination(session, reason).catch((err) => {
          logger.warn(`Could not persist call termination (${err.message})`);
        });

        return session;
      } catch (err: any) {
        logger.warn(`Redis endCall error (${err.message}). Using memory fallback.`);
      }
    }

    const session = memoryActiveCalls.get(callId);
    if (session) {
      session.status = 'ended';
      session.endedAt = new Date().toISOString();
      session.reason = reason;
      memoryUserCallMap.delete(session.callerId);
      memoryUserCallMap.delete(session.recipientId);
      memoryActiveCalls.delete(callId);

      // Persist to MongoDB & inject timeline message asynchronously
      CallPersistenceService.recordCallTermination(session, reason).catch((err) => {
        logger.warn(`Could not persist call termination (${err.message})`);
      });
    }
    return session || null;
  }

  /**
   * Clear in-memory state (useful for test resets)
   */
  public static resetMemoryState(): void {
    memoryUserSockets.clear();
    memorySocketUsers.clear();
    memoryActiveCalls.clear();
    memoryUserCallMap.clear();
  }
}
