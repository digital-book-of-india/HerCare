import ErasureMarker from '../models/erasureMarker.model.js';
import env from '../config/env.config.js';
import { todayUTC } from '../utils/dates.util.js';
import { pushChanges } from './syncPush.service.js';
import { pullChanges } from './syncPull.service.js';

// One round trip: apply what the device changed, then return what changed on the server.
//  - `erasedAt` is returned whenever the user has erased their data. A device that last synced
//    before that moment must wipe its local copy (compare erasedAt with its own cursor).
//  - `epoch` identifies this copy of the data. After a restore from backup it is changed, and a
//    phone that sent a different epoch gets `resyncRequired`: it must reset its cursor and send
//    all its data again, because its cursor is ahead of what the restored server knows.
export const sync = async (userId, { since, limit, changes, epoch }) => {
  const now = new Date();
  const marker = await ErasureMarker.findOne({ user: userId }).lean();
  const ctx = { userId, now, today: todayUTC(now), erasedAt: marker?.erasedAt ?? null };

  const push = await pushChanges(ctx, changes);
  const pull = await pullChanges(userId, { since, limit });

  return {
    serverTime: now.toISOString(),
    cursor: pull.cursor,
    hasMore: pull.hasMore,
    epoch: env.dataEpoch,
    resyncRequired: epoch !== undefined && epoch !== null && epoch !== env.dataEpoch,
    ...(marker && { erasedAt: marker.erasedAt.toISOString() }),
    push,
    changes: pull.changes,
  };
};
