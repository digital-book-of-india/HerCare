// After restoring the database from a backup, put back the erasures that happened since.
//
//   npm run reapply-erasures -- --log <server-log-file> --backup-time <ISO date-time>          (dry run)
//   npm run reapply-erasures -- --log <server-log-file> --backup-time <ISO date-time> --apply  (does it)
//
// --backup-time is when the backup you restored was taken. Erasures before it are already in the
// backup; only later ones are repeated. Without --apply nothing is changed.
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import connectDB from '../config/db.config.js';
import logger from '../utils/logger.util.js';
import { parseErasureLog, erasuresToReapply } from '../utils/erasureLog.util.js';
import { deleteUserData } from '../services/userData.service.js';
import '../services/syncPush.service.js'; // loads every user-owned model
import ErasureMarker from '../models/erasureMarker.model.js';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const logFile = option('log');
const backupTime = new Date(option('backup-time') ?? '');
const apply = args.includes('--apply');

if (!logFile || Number.isNaN(backupTime.getTime())) {
  console.error('Usage: npm run reapply-erasures -- --log <file> --backup-time <ISO date-time> [--apply]');
  process.exit(1);
}

const pending = erasuresToReapply(parseErasureLog(readFileSync(logFile, 'utf8')), backupTime);
logger.info(`${pending.length} erasure(s) after ${backupTime.toISOString()} ${apply ? 'will be applied' : '(dry run, nothing changed)'}`);

if (apply && pending.length > 0) {
  try {
    await connectDB();
    for (const { userId, at } of pending) {
      await ErasureMarker.updateOne({ user: userId }, { $set: { erasedAt: at } }, { upsert: true });
      await deleteUserData(userId);
      logger.info(`re-erased user ${userId} (erased originally at ${at.toISOString()})`);
    }
  } finally {
    await mongoose.disconnect();
  }
}
