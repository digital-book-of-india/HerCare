import Reminder from '../models/reminder.model.js';
import ApiError from '../utils/apiError.util.js';
import { addDays } from '../utils/dates.util.js';
import { REMINDER_TYPES } from '../utils/constants.util.js';
import { REMINDER_DEFAULTS, buildSchedule, reminderStatus } from './reminderSchedule.service.js';
import { getEstimate } from './cycle.service.js';

// Which settings apply to which reminder type.
const ALLOWED = {
  period: ['enabled', 'paused', 'snoozeDays', 'leadDays', 'timeOfDay'],
  daily_log: ['enabled', 'paused', 'snoozeDays', 'timeOfDay'],
  hydration: ['enabled', 'paused', 'snoozeDays', 'times'],
};

// A stored reminder merged over its defaults, so every type always has a complete value.
const normalize = (type, doc) => ({
  type,
  enabled: doc?.enabled ?? false,
  paused: doc?.paused ?? false,
  snoozedUntil: doc?.snoozedUntil ?? null,
  ...REMINDER_DEFAULTS[type],
  ...(type === 'period' && doc?.leadDays != null && { leadDays: doc.leadDays }),
  ...(type !== 'hydration' && doc?.timeOfDay && { timeOfDay: doc.timeOfDay }),
  ...(type === 'hydration' && doc?.times && { times: [...doc.times] }),
});

export const loadReminders = async (userId) => {
  const docs = await Reminder.find({ user: userId }).lean();
  return REMINDER_TYPES.map((type) => normalize(type, docs.find((d) => d.type === type)));
};

export const getReminders = async (userId, today) =>
  (await loadReminders(userId)).map((r) => ({ ...r, status: reminderStatus(r, today) }));

export const updateReminder = async (userId, type, patch, today) => {
  const invalid = Object.keys(patch).filter((key) => !ALLOWED[type].includes(key));
  if (invalid.length) throw ApiError.badRequest(`${invalid.join(', ')} does not apply to ${type} reminders`);

  const doc = (await Reminder.findOne({ user: userId, type })) ?? new Reminder({ user: userId, type });
  if (patch.enabled !== undefined) doc.enabled = patch.enabled;
  if (patch.paused !== undefined) doc.paused = patch.paused;
  if (patch.leadDays !== undefined) doc.leadDays = patch.leadDays;
  if (patch.timeOfDay !== undefined) doc.timeOfDay = patch.timeOfDay;
  if (patch.times !== undefined) doc.times = [...new Set(patch.times)].sort();
  // snoozeDays = N skips today and the next N-1 days; 0 or null cancels a snooze.
  if (patch.snoozeDays !== undefined) doc.snoozedUntil = patch.snoozeDays ? addDays(today, patch.snoozeDays - 1) : null;

  if (type === 'hydration' && doc.enabled && doc.times.length === 0) {
    throw ApiError.badRequest('Choose at least one hydration time before turning the reminder on');
  }
  await doc.save();
  return (await getReminders(userId, today)).find((r) => r.type === type);
};

// What the phone should schedule, computed fresh from the current period history on every call,
// so a changed or deleted period can never leave a stale reminder behind.
export const getSchedule = async (userId, { days = 30 }, today) => {
  const [reminders, estimate] = await Promise.all([loadReminders(userId), getEstimate(userId, today)]);
  return {
    generatedFor: today,
    days,
    estimated: true,
    notifications: buildSchedule({ reminders, estimate, today, days }),
  };
};
