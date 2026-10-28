import mongoose from 'mongoose';
import env from './config/env.config.js';
import connectDB from './config/db.config.js';
import app from './app.js';
import logger from './utils/logger.util.js';

let server;

// Finish the requests already in flight, close the database cleanly, then exit.
const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down`);
  if (!server) process.exit(0);
  const forced = setTimeout(() => process.exit(1), 10_000);
  forced.unref();
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  server.closeIdleConnections();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// After one of these the process state is unknown: log it and exit so the supervisor restarts it.
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
  process.exit(1);
});

try {
  await connectDB();
  server = app.listen(env.port, () => logger.info(`Server listening on port ${env.port}`));
} catch (err) {
  logger.error(`Failed to start: ${err.message}`);
  process.exit(1);
}
