// Imported first so Sentry is initialised before anything else is required.
import './config/sentry';
import * as Sentry from '@sentry/node';
import { Server } from 'http';
import app from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';
import { initSockets, closeSockets } from './sockets';
import { startScheduledJobs, stopScheduledJobs } from './jobs/scheduler';

let server: Server;

async function startServer() {
  await connectDB();

  server = app.listen(env.PORT, () => {
    console.log(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    console.log(`🔗 Health check: http://localhost:${env.PORT}/api/v1/health`);
    console.log(`🔗 Ready check:  http://localhost:${env.PORT}/api/v1/ready`);
    console.log(`🔌 Socket.IO ready on port ${env.PORT}`);
  });

  initSockets(server);
  startScheduledJobs();
}

process.on('unhandledRejection', (err: Error) => {
  console.error('❌ Unhandled Rejection:', err);
  Sentry.captureException(err);
  shutdown('UNHANDLED_REJECTION');
});

process.on('uncaughtException', (err: Error) => {
  console.error('❌ Uncaught Exception:', err);
  Sentry.captureException(err);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received');
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received');
  shutdown('SIGINT');
});

async function shutdown(signal: string) {
  console.log(`🛑 Shutting down gracefully (signal: ${signal})...`);

  // Events are queued, not sent synchronously. Flushing before the process
  // exits is what stops crash reports — the ones that matter most — being lost.
  await Sentry.close(2000);

  stopScheduledJobs();
  closeSockets();

  if (server) {
    server.close(async (err) => {
      if (err) {
        console.error('❌ Error closing server:', err);
        process.exit(1);
      }

      await disconnectDB();
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    });
  } else {
    await disconnectDB();
    process.exit(0);
  }
}

startServer().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
