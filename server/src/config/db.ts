import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;

export const connectDatabase = async (): Promise<boolean> => {
  if (isConnected) {
    return true;
  }

  try {
    mongoose.set('strictQuery', true);
    
    // Connection event listeners
    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('Connected to MongoDB database');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
    });

    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    return true;
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    isConnected = false;
    // Don't crash immediately in development/test so health checks and tests can report status
    return false;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  }
};

export const getDbStatus = (): { isConnected: boolean; readyState: number } => {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
  };
};

