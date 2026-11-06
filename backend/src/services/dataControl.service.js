import ErasureMarker from '../models/erasureMarker.model.js';
import logger from '../utils/logger.util.js';
import { deleteUserData } from './userData.service.js';
import { snapshot } from './syncPull.service.js';
import './syncPush.service.js'; // loads every user-owned model, so erasing removes all of them

export const EXPORT_VERSION = 1;

// Everything the user has, in the same shape sync uses, so it doubles as a backup.
export const exportAll = async (userId) => ({
  version: EXPORT_VERSION,
  exportedAt: new Date().toISOString(),
  note: 'Cycle dates are estimates, not guarantees. This file contains your private health data: keep it safe.',
  data: await snapshot(userId),
});

// Removes every HerCare record this user has, for good. The DBI account itself is untouched.
// DBI's login tokens cannot be revoked from here, so the user can keep using the app and simply
// starts again from empty. The marker stops other devices from restoring the erased data.
export const eraseAll = async (userId) => {
  const erasedAt = new Date();
  await ErasureMarker.updateOne({ user: userId }, { $set: { erasedAt } }, { upsert: true });
  await deleteUserData(userId);
  // Kept in the application logs, which live outside the database. If the database is ever
  // restored from a backup that predates this erasure, `npm run reapply-erasures` reads these
  // lines and erases the user again. A user id is pseudonymous and holds no health data.
  logger.info(`erasure: user=${userId} at=${erasedAt.toISOString()}`);
  return { erasedAt: erasedAt.toISOString() };
};
