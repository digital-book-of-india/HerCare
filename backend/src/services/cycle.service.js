import { actualPeriods } from './period.service.js';
import { getSettings } from './settings.service.js';
import { estimateCycle, buildCalendar } from './cycleEstimator.service.js';

const load = async (userId) => {
  const [records, settings] = await Promise.all([actualPeriods(userId), getSettings(userId)]);
  return { records, settings };
};

export const getEstimate = async (userId, today) => {
  const { records, settings } = await load(userId);
  return estimateCycle({ records, settings, today });
};

export const getCalendar = async (userId, month, today) => {
  const { records, settings } = await load(userId);
  return buildCalendar({ records, settings, today, month });
};
