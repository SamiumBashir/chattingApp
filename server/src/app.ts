import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { sendError } from './utils/apiResponse.js';

// Route imports
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import conversationsRoutes from './modules/conversations/conversations.routes.js';
import messagesRoutes from './modules/messages/messages.routes.js';
import uploadsRoutes from './modules/uploads/uploads.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

export const createApp = (): Application => {
  const app = express();

  // Security Headers
  app.use(helmet());

  // CORS Configuration
  app.use(
    cors({
      origin: [env.CLIENT_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Logging
  app.use(requestLogger);

  // General Rate Limiter (skip in test environment)
  if (env.NODE_ENV !== 'test') {
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 500, // Limit each IP to 500 requests per window
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests from this IP, please try again later.',
        },
      },
    });
    app.use('/api/', generalLimiter);
  }

  // API v1 Routes
  const apiV1Router = express.Router();
  apiV1Router.use('/health', healthRoutes);
  apiV1Router.use('/auth', authRoutes);
  apiV1Router.use('/users', usersRoutes);
  apiV1Router.use('/conversations', conversationsRoutes);
  apiV1Router.use('/uploads', uploadsRoutes);
  apiV1Router.use('/notifications', notificationsRoutes);
  apiV1Router.use('/admin', adminRoutes);
  apiV1Router.use('/', messagesRoutes);

  // Mount v1 router
  app.use('/api/v1', apiV1Router);

  // 404 Handler
  app.use((req: Request, res: Response) => {
    sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`);
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
};

