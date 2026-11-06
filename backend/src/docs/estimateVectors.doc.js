// Test cases for the next-period estimate rule, generated from the real implementation.
//
// The phone has to compute the estimate offline, so it must implement exactly the same rule as the
// server (docs/estimate-rule.md). `docs/estimate-test-vectors.json` holds inputs and the expected
// outputs: run your implementation over every case and compare. A unit test fails if the rule ever
// changes without this file being regenerated (`npm run docs:build`), which is the signal to update
// the phone as well.
import {
  estimateCycle, buildCalendar, MIN_VALID_CYCLE, MAX_VALID_CYCLE, RECENT_COUNT, MIN_SAMPLES, PREDICTED_CYCLES,
} from '../services/cycleEstimator.service.js';
import { addDays } from '../utils/dates.util.js';

const DEFAULTS = { cycleLength: 28, periodDuration: 5 };

// Period start dates from a first date and the gaps (in days) between them.
const startsFrom = (first, gaps) => gaps.reduce((dates, gap) => [...dates, addDays(dates.at(-1), gap)], [first]);
const periods = (starts, length = null) => starts.map((startDate) => ({ startDate, endDate: length ? addDays(startDate, length - 1) : null }));

const SCENARIOS = [
  { name: 'no_records', today: '2026-05-10', records: [] },
  { name: 'one_period_uses_the_chosen_cycle_length', today: '2026-05-10', records: [{ startDate: '2026-05-01', endDate: '2026-05-05' }], months: ['2026-05', '2026-06'] },
  { name: 'one_period_without_an_end_date', today: '2026-05-10', records: [{ startDate: '2026-05-01', endDate: null }] },
  { name: 'one_gap_is_not_enough_to_average', today: '2026-02-05', records: periods(['2026-01-01', '2026-01-31']) },
  { name: 'two_gaps_are_averaged', today: '2026-03-05', records: periods(['2026-01-01', '2026-01-31', '2026-03-01']) },
  { name: 'an_average_of_28_5_rounds_up', today: '2026-03-01', records: periods(['2026-01-01', '2026-01-29', '2026-02-27']) },
  { name: 'irregular_gaps_26_31_29_average_28_67_rounds_to_29', today: '2026-04-02', records: periods(startsFrom('2026-01-01', [26, 31, 29])) },
  { name: 'a_gap_over_60_days_is_ignored', today: '2026-07-01', records: periods(startsFrom('2026-01-01', [28, 120, 28])) },
  { name: 'a_gap_under_15_days_is_ignored', today: '2026-04-15', records: periods(startsFrom('2026-01-01', [10, 28, 28])) },
  { name: 'gaps_of_exactly_15_and_60_days_are_valid', today: '2026-06-01', records: periods(startsFrom('2026-01-01', [15, 60])) },
  { name: 'gaps_of_14_and_61_days_are_not_valid', today: '2026-09-01', records: periods(startsFrom('2026-01-01', [14, 61, 28, 28])) },
  { name: 'only_the_most_recent_six_gaps_count', today: '2026-12-30', records: periods(startsFrom('2026-01-01', [40, 40, 28, 28, 28, 28, 28, 28])) },
  { name: 'overdue_by_four_days', today: '2026-06-02', records: [{ startDate: '2026-05-01', endDate: '2026-05-05' }] },
  { name: 'today_is_inside_the_period', today: '2026-05-03', records: [{ startDate: '2026-05-01', endDate: '2026-05-05' }] },
  { name: 'the_day_after_the_period_ends', today: '2026-05-06', records: [{ startDate: '2026-05-01', endDate: '2026-05-05' }] },
  { name: 'an_ongoing_period_counts_as_the_usual_length', today: '2026-05-04', records: [{ startDate: '2026-05-01', endDate: null }] },
  { name: 'an_ongoing_period_past_the_usual_length', today: '2026-05-09', records: [{ startDate: '2026-05-01', endDate: null }] },
  { name: 'the_period_starts_today', today: '2026-05-01', records: [{ startDate: '2026-05-01', endDate: null }] },
  { name: 'the_last_period_starts_tomorrow', today: '2026-04-30', records: [{ startDate: '2026-05-01', endDate: null }] },
  { name: 'leap_year_february', today: '2024-02-12', records: [{ startDate: '2024-02-10', endDate: null }], months: ['2024-02', '2024-03'] },
  { name: 'not_a_leap_year_february', today: '2026-02-12', records: [{ startDate: '2026-02-10', endDate: null }] },
  { name: 'prediction_crosses_the_year_end', today: '2025-12-22', records: [{ startDate: '2025-12-20', endDate: null }], months: ['2025-12', '2026-01'] },
  { name: 'prediction_from_the_31st', today: '2026-02-02', records: [{ startDate: '2026-01-31', endDate: null }] },
  { name: 'period_length_is_averaged_from_recorded_lengths', today: '2026-03-10', records: [{ startDate: '2026-01-01', endDate: '2026-01-04' }, { startDate: '2026-01-29', endDate: '2026-02-03' }] },
  { name: 'period_length_is_capped_at_15_days', today: '2026-03-10', records: [{ startDate: '2026-01-01', endDate: '2026-01-20' }, { startDate: '2026-01-29', endDate: '2026-02-17' }] },
  { name: 'records_may_arrive_in_any_order', today: '2026-03-05', records: [{ startDate: '2026-03-01', endDate: null }, { startDate: '2026-01-01', endDate: null }, { startDate: '2026-01-31', endDate: null }] },
  { name: 'the_users_own_cycle_and_period_length', today: '2026-05-10', settings: { cycleLength: 35, periodDuration: 7 }, records: [{ startDate: '2026-05-01', endDate: null }] },
];

export const buildEstimateVectors = () => ({
  description: 'Inputs and the exact expected output of the next-period estimate. Dates are YYYY-MM-DD calendar dates; `today` is the user\'s local date. See docs/estimate-rule.md.',
  rule: { validCycleMinDays: MIN_VALID_CYCLE, validCycleMaxDays: MAX_VALID_CYCLE, recentGapsUsed: RECENT_COUNT, gapsNeededToAverage: MIN_SAMPLES, predictedPeriodsOnCalendar: PREDICTED_CYCLES, maxPeriodDays: 15 },
  vectors: SCENARIOS.map(({ name, today, records, settings = DEFAULTS, months = [] }) => ({
    name,
    input: { today, settings, records },
    estimate: estimateCycle({ records, settings, today }),
    calendar: months.map((month) => {
      const { days } = buildCalendar({ records, settings, today, month });
      return { month, days };
    }),
  })),
});
