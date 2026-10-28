import ChecklistItem from '../models/checklistItem.model.js';
import ChecklistLog from '../models/checklistLog.model.js';
import AdminSettings from '../models/adminSettings.model.js';
import ApiError from '../utils/apiError.util.js';
import { assertNotTooFarAhead } from '../utils/dateGuards.util.js';
import { diffDays } from '../utils/dates.util.js';

const MAX_ITEMS = 30;
const MAX_HISTORY_DAYS = 92;
const FALLBACK_ITEMS = [
  { id: 'rest-break', label: 'Take a rest break' },
  { id: 'balanced-meal', label: 'Eat a balanced meal' },
  { id: 'log-symptoms', label: 'Log symptoms' },
  { id: 'period-essentials', label: 'Prepare period essentials' },
];

const alive = (userId) => ({ user: userId, deletedAt: null });

// First use only: copy the admin's default items. A user who removed every item stays at zero.
const ensureItems = async (userId) => {
  if (await ChecklistItem.exists({ user: userId })) return;
  const defaults = (await AdminSettings.findOne({ key: 'global' }).lean())?.defaultChecklistItems;
  const source = defaults?.length ? defaults : FALLBACK_ITEMS;
  await Promise.all(
    source.map((item, order) =>
      ChecklistItem.updateOne(
        { user: userId, defaultKey: item.id },
        { $setOnInsert: { label: item.label, order } },
        { upsert: true }
      )
    )
  );
};

const activeItems = async (userId) => {
  await ensureItems(userId);
  return ChecklistItem.find(alive(userId)).sort({ order: 1, createdAt: 1 }).lean();
};

export const listItems = async (userId) =>
  (await activeItems(userId)).map((i) => ({ id: i._id, label: i.label, order: i.order }));

export const addItem = async (userId, { label }) => {
  const items = await activeItems(userId);
  if (items.length >= MAX_ITEMS) throw ApiError.badRequest(`A checklist can have at most ${MAX_ITEMS} items`);
  const order = items.length ? Math.max(...items.map((i) => i.order)) + 1 : 0;
  return (await ChecklistItem.create({ user: userId, label, order })).toPublic();
};

const findItem = async (userId, itemId) => {
  const item = await ChecklistItem.findOne({ _id: itemId, ...alive(userId) });
  if (!item) throw ApiError.notFound('Checklist item not found');
  return item;
};

export const updateItem = async (userId, itemId, { label, order }) => {
  const item = await findItem(userId, itemId);
  if (label !== undefined) item.label = label;
  if (order !== undefined) item.order = order;
  await item.save();
  return item.toPublic();
};

// Soft delete: past days keep showing the item they completed.
export const removeItem = async (userId, itemId) => {
  const item = await findItem(userId, itemId);
  item.deletedAt = new Date();
  await item.save();
};

// The checklist for one date. Items removed since then still appear on days they were completed.
export const getDay = async (userId, date) => {
  assertNotTooFarAhead(date);
  const [items, logs] = await Promise.all([activeItems(userId), ChecklistLog.find({ user: userId, date }).lean()]);

  const known = new Set(items.map((i) => String(i._id)));
  const removedIds = logs.map((l) => String(l.itemId)).filter((id) => !known.has(id));
  const removed = removedIds.length ? await ChecklistItem.find({ user: userId, _id: { $in: removedIds } }).lean() : [];

  const done = new Set(logs.filter((l) => l.completed).map((l) => String(l.itemId)));
  const rows = [...items, ...removed].map((i) => ({ id: i._id, label: i.label, completed: done.has(String(i._id)) }));
  return { date, items: rows, progress: { done: rows.filter((r) => r.completed).length, total: rows.length } };
};

export const setCompletion = async (userId, date, itemId, completed) => {
  assertNotTooFarAhead(date);
  await findItem(userId, itemId);
  await ChecklistLog.updateOne({ user: userId, date, itemId }, { $set: { completed, clientUpdatedAt: new Date() } }, { upsert: true });
  return { date, itemId, completed };
};

// Which items were completed on which days, newest first.
export const getHistory = async (userId, { from, to }) => {
  if (to < from) throw ApiError.badRequest('to cannot be before from');
  if (diffDays(from, to) > MAX_HISTORY_DAYS) throw ApiError.badRequest(`Choose a range of at most ${MAX_HISTORY_DAYS} days`);

  const logs = await ChecklistLog.find({ user: userId, completed: true, date: { $gte: from, $lte: to } }).lean();
  const labels = new Map(
    (await ChecklistItem.find({ user: userId, _id: { $in: [...new Set(logs.map((l) => String(l.itemId)))] } }).lean())
      .map((i) => [String(i._id), i.label])
  );

  const byDate = new Map();
  for (const log of logs) {
    const entry = byDate.get(log.date) ?? [];
    entry.push({ id: log.itemId, label: labels.get(String(log.itemId)) ?? 'Removed item' });
    byDate.set(log.date, entry);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, completed]) => ({ date, completedCount: completed.length, completed }));
};
