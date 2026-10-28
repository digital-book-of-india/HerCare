import * as checklistService from './checklist.service.js';
import * as hydrationService from './hydration.service.js';
import { getTips } from './tip.service.js';

// Everything the single Daily Self-Care screen needs, in one call.
export const getToday = async (userId, date) => {
  const [checklist, hydration, tips] = await Promise.all([
    checklistService.getDay(userId, date),
    hydrationService.getDay(userId, date),
    getTips(userId, {}, date),
  ]);
  return {
    date,
    inPeriod: tips.inPeriod,
    checklist,
    hydration: hydration.reminders,
    tips: tips.tips,
  };
};
