import HydrationLog from '../models/hydrationLog.model.js';
import ApiError from '../utils/apiError.util.js';
import { assertNotTooFarAhead } from '../utils/dateGuards.util.js';
import { loadReminders } from './reminder.service.js';

const hydrationTimes = async (userId) => (await loadReminders(userId)).find((r) => r.type === 'hydration').times;

// The user's hydration reminder times for a date, each with a done flag. No quantities.
export const getDay = async (userId, date) => {
  assertNotTooFarAhead(date);
  const [times, logs] = await Promise.all([hydrationTimes(userId), HydrationLog.find({ user: userId, date }).lean()]);
  const done = new Set(logs.filter((l) => l.done).map((l) => l.time));
  return { date, reminders: times.map((time) => ({ time, done: done.has(time) })) };
};

export const setDone = async (userId, date, time, done) => {
  assertNotTooFarAhead(date);
  if (!(await hydrationTimes(userId)).includes(time)) {
    throw ApiError.badRequest('That is not one of your hydration reminder times');
  }
  await HydrationLog.updateOne({ user: userId, date, time }, { $set: { done, clientUpdatedAt: new Date() } }, { upsert: true });
  return { date, time, done };
};
