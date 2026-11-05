import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { logger } from './utils/logger.js';
import { setupSocketGateway } from './sockets/socketGateway.js';

const startServer = async () => {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO Server
  const io = new SocketIOServer(server, {
    cors: {
      origin: [env.CLIENT_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Attach io to app for access in controllers if needed
  app.set('io', io);

  // Setup real-time Socket.IO gateway
  setupSocketGateway(io);

  // Connect to MongoDB
  const dbConnected = await connectDatabase();
  if (!dbConnected) {
    logger.warn('⚠️  MongoDB is not connected! Incoming database operations will fail.');
    logger.warn('👉 To connect MongoDB, choose one of these options:');
    logger.warn('   A) Cloud: Set MONGODB_URI=mongodb+srv://<user>:<pwd>@cluster... in server/.env (Free MongoDB Atlas)');
    logger.warn('   B) Docker: Start Docker Desktop and run: docker run -d -p 27017:27017 --name connectly-mongo mongo:latest');
    logger.warn('   C) Local: Install MongoDB via `winget install MongoDB.Server` and start the MongoDB Windows service');
  }

  server.listen(env.PORT, () => {
    logger.info(`🚀 Connectly server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    logger.info(`Health check available at http://localhost:${env.PORT}/api/v1/health`);
  });

  // Graceful Shutdown
  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    
    server.close(async () => {
      logger.info('HTTP server closed');
      io.close(() => {
        logger.info('Socket.IO connections closed');
      });
      await disconnectDatabase();
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  return { server, io };
};

// Start if not imported as module
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    logger.error('Fatal error starting server:', err);
    process.exit(1);
  });
}

export { startServer };

