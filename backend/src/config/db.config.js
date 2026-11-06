import mongoose from 'mongoose';
import env from './env.config.js';
import logger from '../utils/logger.util.js';

// These must be set before any model is created, so server.js imports this file before the app.
// Unknown fields in a query filter are dropped instead of silently matching everything.
mongoose.set('strictQuery', true);
// Building indexes on a large live collection can lock it, so in production they are built on
// purpose with `npm run indexes` (during a deploy), not as a side effect of starting the server.
mongoose.set('autoIndex', env.nodeEnv !== 'production');

const connectDB = async () => {
  // Fail fast when the database cannot be reached instead of hanging for 30 seconds.
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  logger.info('MongoDB connected');
};

export default connectDB;
