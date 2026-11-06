import ApiError from './apiError.util.js';
import { addDays, todayUTC } from './dates.util.js';

// A date may be at most one day ahead of the server's UTC date, which covers every time zone.
export const assertNotTooFarAhead = (date, label = 'date') => {
  if (date > addDays(todayUTC(), 1)) throw ApiError.badRequest(`${label} cannot be in the future`);
};
