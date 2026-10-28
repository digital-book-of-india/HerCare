import UserSettings from '../models/userSettings.model.js';
import PeriodRecord from '../models/periodRecord.model.js';
import ChecklistItem from '../models/checklistItem.model.js';
import ChecklistLog from '../models/checklistLog.model.js';
import SymptomLog from '../models/symptomLog.model.js';
import HydrationLog from '../models/hydrationLog.model.js';
import Reminder from '../models/reminder.model.js';

const stamps = (doc) => ({ clientUpdatedAt: doc.clientUpdatedAt, updatedAt: doc.updatedAt });

// The shape of each record on the wire. The same shape is used for pushing, pulling and export.
// Documents are hydrated (not lean) so encrypted notes are decrypted by the model.
export const SYNC_ENTITY_CONFIG = {
  settings: {
    model: UserSettings,
    serialize: (d) => ({ cycleLength: d.cycleLength ?? null, periodDuration: d.periodDuration ?? null, ...stamps(d) }),
  },
  periods: {
    model: PeriodRecord,
    soft: true,
    serialize: (d) => ({
      id: d._id, startDate: d.startDate, endDate: d.endDate, notes: d.notes ?? null, deleted: d.deletedAt !== null, ...stamps(d),
    }),
  },
  checklistItems: {
    model: ChecklistItem,
    soft: true,
    serialize: (d) => ({ id: d._id, label: d.label, order: d.order, deleted: d.deletedAt !== null, ...stamps(d) }),
  },
  checklistLogs: {
    model: ChecklistLog,
    serialize: (d) => ({ id: d._id, date: d.date, itemId: d.itemId, completed: d.completed, ...stamps(d) }),
  },
  symptoms: {
    model: SymptomLog,
    soft: true,
    serialize: (d) => ({
      id: d._id, date: d.date, symptoms: [...d.symptoms], flow: d.flow, mood: d.mood, energy: d.energy,
      note: d.note ?? null, deleted: d.deletedAt !== null, ...stamps(d),
    }),
  },
  hydrationLogs: {
    model: HydrationLog,
    serialize: (d) => ({ id: d._id, date: d.date, time: d.time, done: d.done, ...stamps(d) }),
  },
  reminders: {
    model: Reminder,
    serialize: (d) => ({
      id: d._id, type: d.type, enabled: d.enabled, paused: d.paused, snoozedUntil: d.snoozedUntil,
      leadDays: d.leadDays ?? null, timeOfDay: d.timeOfDay ?? null, times: [...d.times], ...stamps(d),
    }),
  },
};

const ENTITY_NAMES = Object.keys(SYNC_ENTITY_CONFIG);

// Everything that changed on the server since `since`, oldest first, in pages of `limit` per type.
//  - The cursor time is taken BEFORE the queries, so a write that lands during this call has an
//    updatedAt at or after the cursor and is returned by the next pull.
//  - The filter is inclusive (>=), so a record sharing the cursor's millisecond is never missed;
//    the occasional repeat is harmless because applying a record twice changes nothing.
//  - With no `since` (a fresh install) deleted records are left out, they carry no information.
//  - If any type has more than `limit` changes, `hasMore` is true and the client keeps pulling with
//    the new cursor. A page always ends on a whole millisecond: every record that shares the last
//    record's timestamp travels with it (so a page can slightly exceed `limit`), and the next cursor
//    starts one millisecond later. Without that, records sharing a timestamp could never be split
//    across pages and the client would be handed the same page forever.
export const pullChanges = async (userId, { since = null, limit = 1000 }) => {
  let cursor = new Date();
  let hasMore = false;
  const changes = {};

  for (const name of ENTITY_NAMES) {
    const { model, soft, serialize } = SYNC_ENTITY_CONFIG[name];
    const filter = since
      ? { user: userId, updatedAt: { $gte: since } }
      : { user: userId, ...(soft && { deletedAt: null }) };

    const docs = await model.find(filter).sort({ updatedAt: 1, _id: 1 }).limit(limit + 1);
    if (docs.length > limit) {
      docs.pop();
      hasMore = true;
      const lastSeen = docs.at(-1).updatedAt;
      const delivered = new Set(docs.map((doc) => String(doc._id)));
      const sameInstant = await model.find({ ...filter, updatedAt: lastSeen }).sort({ _id: 1 });
      docs.push(...sameInstant.filter((doc) => !delivered.has(String(doc._id))));
      const resumeAt = new Date(lastSeen.getTime() + 1);
      if (resumeAt < cursor) cursor = resumeAt;
    }
    changes[name] = docs.map(serialize);
  }

  changes.settings = changes.settings[0] ?? null;
  return { cursor: cursor.toISOString(), hasMore, changes };
};

// A complete copy of the user's current data (deleted records left out), for export.
export const snapshot = async (userId) => {
  const data = {};
  for (const name of ENTITY_NAMES) {
    const { model, soft, serialize } = SYNC_ENTITY_CONFIG[name];
    const docs = await model.find({ user: userId, ...(soft && { deletedAt: null }) }).sort({ createdAt: 1 });
    data[name] = docs.map(serialize);
  }
  data.settings = data.settings[0] ?? null;
  return data;
};
