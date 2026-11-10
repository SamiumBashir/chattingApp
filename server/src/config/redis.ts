import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;
let isConnected = false;

/**
 * Initializes and returns the shared singleton Redis client
 */
export const getRedisClient = (): Redis | null => {
  if (redisClient) {
    return redisClient;
  }

  if (!env.REDIS_URL) {
    return null;
  }

  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 5) {
          logger.warn('Redis reconnection limit exceeded. Falling back to in-memory state.');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redisClient.on('connect', () => {
      isConnected = true;
      logger.info('Connected to Redis service');
    });

    redisClient.on('ready', () => {
      isConnected = true;
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      logger.warn(`Redis connection error: ${err.message}`);
    });

    redisClient.on('close', () => {
      isConnected = false;
    });

    // Initiate connection asynchronously
    redisClient.connect().catch((err) => {
      logger.warn(`Initial Redis connection failed (${err.message}). Using in-memory fallback.`);
    });

    return redisClient;
  } catch (err: any) {
    logger.warn(`Failed to initialize Redis client (${err.message}). Using in-memory fallback.`);
    return null;
  }
};

/**
 * Disconnects the shared Redis client gracefully
 */
export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
      logger.info('Disconnected from Redis');
    }
  }
};

/**
 * Returns current Redis connection and configuration status
 */
export const getRedisStatus = (): { isConfigured: boolean; isConnected: boolean } => {
  return {
    isConfigured: Boolean(env.REDIS_URL),
    isConnected: Boolean(isConnected && redisClient && redisClient.status === 'ready'),
  };
};

/**
 * Allows injecting a custom or mock Redis client (useful for unit and integration testing)
 */
export const setRedisClientForTesting = (client: Redis | null): void => {
  redisClient = client;
  isConnected = Boolean(client);
};

