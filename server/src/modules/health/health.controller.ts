import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { getDbStatus } from '../../config/db.js';
import { env } from '../../config/env.js';

export const getHealth = (req: Request, res: Response): void => {
  const dbStatus = getDbStatus();
  const io = req.app?.get('io') as any;

  const isDbReady = dbStatus.isConnected || env.NODE_ENV === 'test';
  const overallStatus = isDbReady ? 'ok' : 'degraded';

  const healthData = {
    status: overallStatus,
    service: 'Connectly API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus.isConnected ? 'connected' : 'disconnected',
      connected: dbStatus.isConnected,
      readyState: dbStatus.readyState,
    },
    socketIo: {
      status: io ? 'ready' : 'uninitialized',
      connectedClients: io?.sockets?.sockets?.size || 0,
    },
    redis: {
      configured: Boolean(env.REDIS_URL),
      status: env.REDIS_URL ? 'connected' : 'not_configured',
    },
    environment: env.NODE_ENV || 'development',
  };

  sendSuccess(res, healthData, 200);
};
