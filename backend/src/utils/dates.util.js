// Calendar dates are plain 'YYYY-MM-DD' strings, never timestamps. All math goes through
// UTC day numbers, so time zones and daylight-saving changes cannot shift a date.
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MS_PER_DAY = 86_400_000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export const isValidDate = (value) => {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const isValidMonth = (value) => typeof value === 'string' && MONTH_RE.test(value);

const toDayNumber = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
};

const fromDayNumber = (dayNumber) => new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);

export const addDays = (value, days) => fromDayNumber(toDayNumber(value) + days);

// Whole days from `from` to `to` (negative when `to` is earlier).
export const diffDays = (from, to) => toDayNumber(to) - toDayNumber(from);

export const todayUTC = (now = new Date()) => now.toISOString().slice(0, 10);

// First and last date of a 'YYYY-MM' month.
export const monthRange = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
};

// Every date from `start` to `end`, inclusive.
export const eachDate = (start, end) => {
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
};
