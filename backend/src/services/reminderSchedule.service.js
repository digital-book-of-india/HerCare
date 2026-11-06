// Pure reminder logic (no DB, no clock). The backend only computes WHAT should fire and WHEN;
// the phone schedules the actual notifications. Times are the user's local time of day,
// so the backend never converts time zones. Nothing here mentions a water quantity.
import { addDays, eachDate } from '../utils/dates.util.js';
import { predictedRanges } from './cycleEstimator.service.js';

export const REMINDER_DEFAULTS = {
  period: { leadDays: 2, timeOfDay: '09:00' },
  daily_log: { timeOfDay: '20:00' },
  hydration: { times: [] },
};

// disabled > paused > snoozed > active
export const reminderStatus = (reminder, today) => {
  if (!reminder.enabled) return 'disabled';
  if (reminder.paused) return 'paused';
  if (reminder.snoozedUntil && reminder.snoozedUntil >= today) return 'snoozed';
  return 'active';
};

export const DAILY_LOG_TEXT = 'Time to log how you feel today.';
export const HYDRATION_TEXT = 'Time for a water break.';

export const periodReminderText = (leadDays) => {
  if (leadDays === 0) return 'Your period is estimated to start today.';
  if (leadDays === 1) return 'Your period is estimated to start tomorrow.';
  return `Your period is estimated to start in ${leadDays} days.`;
};

// reminders: array of normalized reminders ({ type, enabled, paused, snoozedUntil, ... }).
// Returns [{ type, date, time, text }] sorted by date and time, for `days` days from `today`.
export const buildSchedule = ({ reminders, estimate, today, days }) => {
  const end = addDays(today, days - 1);
  const window = eachDate(today, end);
  const items = [];

  for (const reminder of reminders) {
    if (reminderStatus(reminder, today) === 'disabled' || reminder.paused) continue;
    // Snoozed dates are skipped; the first date after the snooze ends is scheduled normally.
    const isSnoozed = (date) => Boolean(reminder.snoozedUntil) && date <= reminder.snoozedUntil;

    if (reminder.type === 'period') {
      for (const { startDate } of predictedRanges(estimate)) {
        const date = addDays(startDate, -reminder.leadDays);
        if (date >= today && date <= end && !isSnoozed(date)) {
          items.push({ type: 'period', date, time: reminder.timeOfDay, text: periodReminderText(reminder.leadDays) });
        }
      }
    } else if (reminder.type === 'daily_log') {
      for (const date of window.filter((d) => !isSnoozed(d))) {
        items.push({ type: 'daily_log', date, time: reminder.timeOfDay, text: DAILY_LOG_TEXT });
      }
    } else if (reminder.type === 'hydration') {
      for (const date of window.filter((d) => !isSnoozed(d))) {
        for (const time of reminder.times) {
          items.push({ type: 'hydration', date, time, text: HYDRATION_TEXT });
        }
      }
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.type.localeCompare(b.type));
};
