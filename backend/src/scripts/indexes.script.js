// Run during a deploy: npm run indexes
// In production the server does not build indexes on startup (it could lock a big collection).
import mongoose from 'mongoose';
import connectDB from '../config/db.config.js';
import logger from '../utils/logger.util.js';
import { syncAllIndexes } from '../services/indexes.service.js';

try {
  await connectDB();
  const dropped = await syncAllIndexes();
  for (const [model, names] of Object.entries(dropped)) {
    if (names.length) logger.info(`${model}: dropped unused indexes ${names.join(', ')}`);
  }
  logger.info('Indexes are up to date');
} catch (err) {
  logger.error(`Index sync failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
