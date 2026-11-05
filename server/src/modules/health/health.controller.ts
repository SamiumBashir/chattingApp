import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { getDbStatus } from '../../config/db.js';

export const getHealth = (_req: Request, res: Response): void => {
  const dbStatus = getDbStatus();
  const healthData = {
    status: 'ok',
    service: 'Connectly API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      connected: dbStatus.isConnected,
      readyState: dbStatus.readyState,
    },
    environment: process.env.NODE_ENV || 'development',
  };

  sendSuccess(res, healthData, 200);
};

