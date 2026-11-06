// Cycle estimation: plain, documented rules, no AI. Pure functions (no DB, no clock),
// so the mobile app can implement the identical rule. See "Estimate rule" in context.md.
//
// Rule:
//  1. A cycle interval is the number of days between two consecutive ACTUAL period start dates.
//  2. An interval is valid only if it is 15-60 days (gaps from missed logging are ignored).
//  3. With 2+ valid intervals, cycle length = rounded average of the most recent 6 valid intervals.
//     Otherwise it is the user's chosen cycle length (and tooLittleHistory is true).
//  4. Next estimated start = last actual start + cycle length. It is always an estimate.
//  5. Period duration = rounded average of the last 6 recorded durations (2+ needed),
//     otherwise the user's chosen duration.
import { addDays, diffDays, eachDate, monthRange } from '../utils/dates.util.js';

export const MIN_VALID_CYCLE = 15;
export const MAX_VALID_CYCLE = 60;
export const RECENT_COUNT = 6;
export const MIN_SAMPLES = 2;
export const PREDICTED_CYCLES = 3;
const MAX_DURATION = 15;

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const validIntervals = (starts) =>
  starts
    .slice(1)
    .map((start, i) => diffDays(starts[i], start))
    .filter((days) => days >= MIN_VALID_CYCLE && days <= MAX_VALID_CYCLE);

const sortByStart = (records) => [...records].sort((a, b) => a.startDate.localeCompare(b.startDate));

// records: actual periods [{ startDate, endDate|null }]; settings: { cycleLength, periodDuration }.
export const estimateCycle = ({ records, settings, today }) => {
  const actual = sortByStart(records);

  if (actual.length === 0) {
    return {
      status: 'no_data',
      estimated: true,
      basis: 'none',
      tooLittleHistory: true,
      intervalsUsed: 0,
      cycleLength: settings.cycleLength,
      periodDuration: settings.periodDuration,
      lastPeriodStart: null,
      nextEstimatedStart: null,
      nextEstimatedEnd: null,
      daysUntilNextPeriod: null,
      overdueDays: 0,
      cycleDay: null,
      inPeriod: false,
    };
  }

  const intervals = validIntervals(actual.map((r) => r.startDate)).slice(-RECENT_COUNT);
  const useAverage = intervals.length >= MIN_SAMPLES;
  const cycleLength = useAverage ? Math.round(mean(intervals)) : settings.cycleLength;

  const durations = actual
    .filter((r) => r.endDate)
    .map((r) => diffDays(r.startDate, r.endDate) + 1)
    .slice(-RECENT_COUNT);
  const periodDuration =
    durations.length >= MIN_SAMPLES ? clamp(Math.round(mean(durations)), 1, MAX_DURATION) : settings.periodDuration;

  const last = actual.at(-1);
  const nextEstimatedStart = addDays(last.startDate, cycleLength);
  const daysUntilNextPeriod = diffDays(today, nextEstimatedStart);
  const lastEnd = last.endDate ?? addDays(last.startDate, periodDuration - 1);
  const cycleDay = diffDays(last.startDate, today) + 1;

  return {
    status: daysUntilNextPeriod < 0 ? 'overdue' : 'upcoming',
    estimated: true,
    basis: useAverage ? 'recorded_cycles' : 'chosen_length',
    tooLittleHistory: !useAverage,
    intervalsUsed: intervals.length,
    cycleLength,
    periodDuration,
    lastPeriodStart: last.startDate,
    nextEstimatedStart,
    nextEstimatedEnd: addDays(nextEstimatedStart, periodDuration - 1),
    daysUntilNextPeriod,
    overdueDays: Math.max(0, -daysUntilNextPeriod),
    cycleDay: cycleDay >= 1 ? cycleDay : null,
    inPeriod: today >= last.startDate && today <= lastEnd,
  };
};

// The next few estimated periods as [{ startDate, endDate }]. Empty when there is no history.
export const predictedRanges = (estimate) => {
  if (!estimate.nextEstimatedStart) return [];
  return Array.from({ length: PREDICTED_CYCLES }, (_, i) => {
    const startDate = addDays(estimate.nextEstimatedStart, i * estimate.cycleLength);
    return { startDate, endDate: addDays(startDate, estimate.periodDuration - 1) };
  });
};

// Days of an actual record. A period with no end date yet runs from its start to today,
// capped at the usual duration.
export const actualRange = (record, { periodDuration, today }) => {
  if (record.endDate) return { startDate: record.startDate, endDate: record.endDate };
  const cap = addDays(record.startDate, periodDuration - 1);
  const endDate = today > record.startDate ? (today < cap ? today : cap) : record.startDate;
  return { startDate: record.startDate, endDate };
};

// Day-by-day view of one month. Actual days always win over estimated ones.
export const buildCalendar = ({ records, settings, today, month }) => {
  const estimate = estimateCycle({ records, settings, today });
  const { start, end } = monthRange(month);
  const days = new Map();

  const mark = (range, type) => {
    const from = range.startDate > start ? range.startDate : start;
    const to = range.endDate < end ? range.endDate : end;
    if (from > to) return;
    for (const date of eachDate(from, to)) days.set(date, type);
  };

  predictedRanges(estimate).forEach((range) => mark(range, 'predicted'));
  records.forEach((record) => mark(actualRange(record, { periodDuration: estimate.periodDuration, today }), 'actual'));

  return {
    month,
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, type]) => ({ date, type })),
    estimate,
  };
};
