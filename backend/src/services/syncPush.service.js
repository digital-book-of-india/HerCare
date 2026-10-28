import UserSettings from '../models/userSettings.model.js';
import PeriodRecord from '../models/periodRecord.model.js';
import ChecklistItem from '../models/checklistItem.model.js';
import ChecklistLog from '../models/checklistLog.model.js';
import SymptomLog from '../models/symptomLog.model.js';
import HydrationLog from '../models/hydrationLog.model.js';
import Reminder from '../models/reminder.model.js';
import { SYNC_ENTITY_CONFIG } from './syncPull.service.js';
import {
  SYNC_ENTITIES, SOFT_DELETE_ENTITIES, parseTimestamp, clampTimestamp, decideLww, validateRecord, rangesOverlap,
} from './syncRules.service.js';

// How many records are written at the same time. Records with the same identity are never written
// together: they are handled one after another, in the order they were sent.
const CONCURRENCY = 20;

const lower = (value) => String(value ?? '').toLowerCase();
const unique = (values) => [...new Set(values)];

// How each record type is identified, loaded, created and filled in from a pushed record.
//  key(rec)    identifies a pushed record (ids are compared case-insensitively, like MongoDB does)
//  keyOf(doc)  the same identity for a stored document
//  loadMany    fetches ALL the stored documents for a list of pushed records in one query
const HANDLERS = {
  settings: {
    key: () => 'settings',
    keyOf: () => 'settings',
    loadMany: async (c) => [await UserSettings.findOne({ user: c.userId })].filter(Boolean),
    build: (c) => new UserSettings({ user: c.userId }),
    assign: (doc, rec) => {
      if (rec.cycleLength !== undefined) doc.cycleLength = rec.cycleLength;
      if (rec.periodDuration !== undefined) doc.periodDuration = rec.periodDuration;
    },
  },
  periods: {
    key: (rec) => lower(rec?.id),
    keyOf: (doc) => String(doc._id),
    loadMany: (c, recs) => PeriodRecord.find({ user: c.userId, _id: { $in: recs.map((r) => r.id) } }),
    build: (c, rec) => new PeriodRecord({ _id: rec.id, user: c.userId }),
    assign: (doc, rec) => {
      doc.startDate = rec.startDate;
      doc.endDate = rec.endDate ?? null;
      doc.notes = rec.notes ?? null;
    },
  },
  checklistItems: {
    key: (rec) => lower(rec?.id),
    keyOf: (doc) => String(doc._id),
    loadMany: (c, recs) => ChecklistItem.find({ user: c.userId, _id: { $in: recs.map((r) => r.id) } }),
    build: (c, rec) => new ChecklistItem({ _id: rec.id, user: c.userId }),
    assign: (doc, rec) => {
      doc.label = rec.label.trim();
      doc.order = rec.order ?? 0;
    },
  },
  checklistLogs: {
    key: (rec) => `${rec?.date}/${lower(rec?.itemId)}`,
    keyOf: (doc) => `${doc.date}/${String(doc.itemId)}`,
    loadMany: (c, recs) => ChecklistLog.find({ user: c.userId, date: { $in: unique(recs.map((r) => r.date)) } }),
    build: (c, rec) => new ChecklistLog({ user: c.userId, date: rec.date, itemId: rec.itemId }),
    assign: (doc, rec) => { doc.completed = rec.completed; },
    // A tick must point at one of this user's items (a removed item is fine, history keeps it).
    // One query answers for the whole list. Returns, per record, null (fine) or the reason.
    checkMany: async (c, recs) => {
      const known = new Set((await ChecklistItem.find({ user: c.userId, _id: { $in: unique(recs.map((r) => lower(r.itemId))) } }).select('_id').lean())
        .map((item) => String(item._id)));
      return recs.map((rec) => (known.has(lower(rec.itemId)) ? null : 'itemId is not one of your checklist items'));
    },
  },
  symptoms: {
    key: (rec) => String(rec?.date),
    keyOf: (doc) => doc.date,
    loadMany: (c, recs) => SymptomLog.find({ user: c.userId, date: { $in: unique(recs.map((r) => r.date)) } }),
    build: (c, rec) => new SymptomLog({ user: c.userId, date: rec.date }),
    assign: (doc, rec) => {
      doc.symptoms = [...new Set(rec.symptoms ?? [])];
      doc.flow = rec.flow ?? null;
      doc.mood = rec.mood ?? null;
      doc.energy = rec.energy ?? null;
      doc.note = rec.note ?? null;
    },
  },
  hydrationLogs: {
    key: (rec) => `${rec?.date}/${rec?.time}`,
    keyOf: (doc) => `${doc.date}/${doc.time}`,
    loadMany: (c, recs) => HydrationLog.find({ user: c.userId, date: { $in: unique(recs.map((r) => r.date)) } }),
    build: (c, rec) => new HydrationLog({ user: c.userId, date: rec.date, time: rec.time }),
    assign: (doc, rec) => { doc.done = rec.done; },
  },
  reminders: {
    key: (rec) => String(rec?.type),
    keyOf: (doc) => doc.type,
    loadMany: (c, recs) => Reminder.find({ user: c.userId, type: { $in: unique(recs.map((r) => r.type)) } }),
    build: (c, rec) => new Reminder({ user: c.userId, type: rec.type }),
    assign: (doc, rec) => {
      if (rec.enabled !== undefined) doc.enabled = rec.enabled;
      if (rec.paused !== undefined) doc.paused = rec.paused;
      if (rec.snoozedUntil !== undefined) doc.snoozedUntil = rec.snoozedUntil;
      if (rec.leadDays !== undefined) doc.leadDays = rec.leadDays;
      if (rec.timeOfDay !== undefined) doc.timeOfDay = rec.timeOfDay;
      if (rec.times !== undefined) doc.times = [...new Set(rec.times)].sort();
    },
  },
};

const reject = (reason, message, extra = {}) => ({ outcome: 'rejected', reason, message, ...extra });

// Runs `work` over `items` with at most `limit` running at once; results keep the input order.
const mapLimit = async (items, limit, work) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

// Step 1, no database: is the record acceptable at all?
const prepare = (entity, rec, ctx) => {
  const error = validateRecord(entity, rec, ctx.today);
  if (error) return { rejection: reject('invalid', error) };

  const edited = parseTimestamp(rec.clientUpdatedAt);
  if (!edited) return { rejection: reject('invalid', 'clientUpdatedAt must be an ISO date-time') };
  const editTime = clampTimestamp(edited, ctx.now);

  // Anything last edited before the user erased their data is old data: do not bring it back.
  if (ctx.erasedAt && editTime <= ctx.erasedAt) {
    return { rejection: reject('erased', 'This data was erased on the server after it was edited. Remove it from the device.') };
  }
  return { rec, editTime };
};

// Step 3: apply one record to the stored one (or create it). Safe to repeat: same edit time => 'unchanged'.
const applyOne = async (entity, handler, { rec, editTime }, existing, ctx) => {
  const decision = decideLww(existing?.clientUpdatedAt, editTime);
  if (decision === 'unchanged') return { outcome: 'unchanged' };
  if (decision === 'stale') {
    // The server's newer version goes back so the device can adopt it.
    return reject('stale', 'The server has a newer version', { server: SYNC_ENTITY_CONFIG[entity].serialize(existing) });
  }

  const deleting = rec.deleted === true;
  if (deleting && !existing) return { outcome: 'unchanged' }; // nothing here to delete

  const doc = existing ?? handler.build(ctx, rec);
  if (!deleting) handler.assign(doc, rec);
  if (SOFT_DELETE_ENTITIES.includes(entity)) doc.deletedAt = deleting ? (doc.deletedAt ?? ctx.now) : null;
  doc.clientUpdatedAt = editTime;
  doc.$locals.syncing = true;

  try {
    await doc.save();
  } catch (err) {
    // Duplicate key: that id belongs to someone else, or a parallel request created the record.
    if (err.code === 11000) return reject('conflict', 'This id is already in use. Retry, or use a new id');
    throw err;
  }
  return { outcome: 'applied', doc };
};

// One list of one record type. Returns an outcome per pushed record, in the order they were sent.
//   1. validate everything in memory,  2. load every stored counterpart in ONE query,
//   3. decide and write, many at a time (records with the same identity stay in order).
const processEntity = async (entity, records, ctx) => {
  const handler = HANDLERS[entity];
  const outcomes = new Array(records.length);
  let ready = [];

  records.forEach((rec, index) => {
    const prepared = prepare(entity, rec, ctx);
    if (prepared.rejection) outcomes[index] = prepared.rejection;
    else ready.push({ ...prepared, index });
  });

  if (ready.length > 0 && handler.checkMany) {
    const problems = await handler.checkMany(ctx, ready.map((item) => item.rec));
    ready = ready.filter((item, i) => {
      if (problems[i] === null) return true;
      outcomes[item.index] = reject('invalid', problems[i]);
      return false;
    });
  }
  if (ready.length === 0) return outcomes;

  const stored = new Map((await handler.loadMany(ctx, ready.map((item) => item.rec))).map((doc) => [handler.keyOf(doc), doc]));

  const groups = new Map();
  for (const item of ready) {
    const key = handler.key(item.rec);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  await mapLimit([...groups.entries()], CONCURRENCY, async ([key, items]) => {
    let current = stored.get(key) ?? null;
    for (const item of items) {
      const outcome = await applyOne(entity, handler, item, current, ctx);
      outcomes[item.index] = outcome;
      if (outcome.outcome === 'applied') current = outcome.doc; // the next record with this identity sees it
    }
  });
  return outcomes;
};

// Two phones can log the same period while offline. The user already confirmed each one on their own
// phone, so both are kept, and the app is told so it can ask the user to tidy up. All the user's
// periods are read once and compared in memory. A pair is reported once.
const periodWarnings = async (ctx, docs) => {
  if (docs.length === 0) return [];
  const all = await PeriodRecord.find({ user: ctx.userId, deletedAt: null }).select('startDate endDate').lean();
  const reported = new Set();
  return docs.flatMap((doc) => all
    .filter((other) => String(other._id) !== String(doc._id) && rangesOverlap(doc, other))
    .filter((other) => {
      const pair = [String(doc._id), String(other._id)].sort().join('|');
      if (reported.has(pair)) return false;
      reported.add(pair);
      return true;
    })
    .map((other) => ({
      entity: 'periods',
      key: String(doc._id),
      reason: other.startDate === doc.startDate ? 'duplicate_start' : 'overlap',
      with: String(other._id),
    })));
};

const emptyCounts = () => Object.fromEntries(SYNC_ENTITIES.map((name) => [name, 0]));

export const pushChanges = async (ctx, changes = {}) => {
  const result = { applied: emptyCounts(), unchanged: emptyCounts(), rejected: [], warnings: [] };

  for (const entity of SYNC_ENTITIES) {
    const records = entity === 'settings' ? (changes.settings ? [changes.settings] : []) : (changes[entity] ?? []);
    if (records.length === 0) continue;

    const outcomes = await processEntity(entity, records, ctx);
    outcomes.forEach((outcome, index) => {
      if (outcome.outcome === 'applied') result.applied[entity] += 1;
      else if (outcome.outcome === 'unchanged') result.unchanged[entity] += 1;
      else {
        const { outcome: _kind, ...detail } = outcome;
        result.rejected.push({ entity, key: HANDLERS[entity].key(records[index] ?? {}), ...detail });
      }
    });

    if (entity === 'periods') {
      const changed = outcomes.filter((o) => o.outcome === 'applied' && !o.doc.deletedAt).map((o) => o.doc);
      result.warnings.push(...(await periodWarnings(ctx, changed)));
    }
  }
  return result;
};
