import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, reminderStatus } from '../src/services/reminderSchedule.service.js';
import { estimateCycle } from '../src/services/cycleEstimator.service.js';

const settings = { cycleLength: 28, periodDuration: 5 };
const today = '2024-05-10';
// last period 05-01 -> next estimated start 05-29
const estimate = estimateCycle({ records: [{ startDate: '2024-05-01', endDate: '2024-05-05' }], settings, today });

const period = (extra = {}) => ({ type: 'period', enabled: true, paused: false, snoozedUntil: null, leadDays: 2, timeOfDay: '09:00', ...extra });
const daily = (extra = {}) => ({ type: 'daily_log', enabled: true, paused: false, snoozedUntil: null, timeOfDay: '20:00', ...extra });
const water = (extra = {}) => ({ type: 'hydration', enabled: true, paused: false, snoozedUntil: null, times: ['10:00', '15:00'], ...extra });

test('status order: disabled > paused > snoozed > active', () => {
  assert.equal(reminderStatus({ enabled: false, paused: true, snoozedUntil: '2099-01-01' }, today), 'disabled');
  assert.equal(reminderStatus({ enabled: true, paused: true, snoozedUntil: '2099-01-01' }, today), 'paused');
  assert.equal(reminderStatus({ enabled: true, paused: false, snoozedUntil: '2024-05-10' }, today), 'snoozed');
  assert.equal(reminderStatus({ enabled: true, paused: false, snoozedUntil: '2024-05-09' }, today), 'active');
  assert.equal(reminderStatus({ enabled: true, paused: false, snoozedUntil: null }, today), 'active');
});

test('period reminder fires lead days before the estimated start', () => {
  const s = buildSchedule({ reminders: [period()], estimate, today, days: 30 });
  assert.deepEqual(s.map((i) => [i.type, i.date, i.time]), [['period', '2024-05-27', '09:00']]);
  assert.match(s[0].text, /estimated/);
  assert.match(s[0].text, /2 days/);
});

test('period reminder wording for lead 0 and 1', () => {
  assert.match(buildSchedule({ reminders: [period({ leadDays: 0 })], estimate, today, days: 30 })[0].text, /today/);
  assert.match(buildSchedule({ reminders: [period({ leadDays: 1 })], estimate, today, days: 30 })[0].text, /tomorrow/);
});

test('period reminder honours the horizon and skips triggers already in the past', () => {
  assert.deepEqual(buildSchedule({ reminders: [period()], estimate, today, days: 10 }), []); // 05-27 is outside 05-10..05-19
  const late = estimateCycle({ records: [{ startDate: '2024-05-01' }], settings, today: '2024-05-28' });
  // estimated start 05-29, lead 2 -> 05-27 is already past on 05-28
  assert.deepEqual(buildSchedule({ reminders: [period()], estimate: late, today: '2024-05-28', days: 5 }).map((i) => i.date), []);
});

test('period reminder with no history schedules nothing', () => {
  const none = estimateCycle({ records: [], settings, today });
  assert.deepEqual(buildSchedule({ reminders: [period()], estimate: none, today, days: 30 }), []);
});

test('recalculates when the period history changes (no stale dates)', () => {
  const before = buildSchedule({ reminders: [period()], estimate, today, days: 30 });
  const edited = estimateCycle({ records: [{ startDate: '2024-05-04', endDate: '2024-05-08' }], settings, today });
  const after = buildSchedule({ reminders: [period()], estimate: edited, today, days: 30 });
  assert.deepEqual(before.map((i) => i.date), ['2024-05-27']);
  assert.deepEqual(after.map((i) => i.date), ['2024-05-30']);
});

test('daily log reminder fires every day in the window', () => {
  const s = buildSchedule({ reminders: [daily()], estimate, today, days: 3 });
  assert.deepEqual(s.map((i) => i.date), ['2024-05-10', '2024-05-11', '2024-05-12']);
  assert.ok(s.every((i) => i.time === '20:00'));
});

test('hydration reminder fires at every chosen time, with no quantity in the text', () => {
  const s = buildSchedule({ reminders: [water()], estimate, today, days: 2 });
  assert.deepEqual(s.map((i) => `${i.date} ${i.time}`), [
    '2024-05-10 10:00', '2024-05-10 15:00', '2024-05-11 10:00', '2024-05-11 15:00',
  ]);
  assert.ok(s.every((i) => !/\d\s?(ml|l|litre|liter|glass|cup)/i.test(i.text)));
});

test('disabled and paused reminders schedule nothing', () => {
  assert.deepEqual(buildSchedule({ reminders: [daily({ enabled: false })], estimate, today, days: 5 }), []);
  assert.deepEqual(buildSchedule({ reminders: [daily({ paused: true })], estimate, today, days: 5 }), []);
});

test('snoozed dates are skipped, then reminders resume', () => {
  const s = buildSchedule({ reminders: [daily({ snoozedUntil: '2024-05-11' })], estimate, today, days: 4 });
  assert.deepEqual(s.map((i) => i.date), ['2024-05-12', '2024-05-13']);
});

test('schedule is sorted by date then time, across reminder types', () => {
  const s = buildSchedule({ reminders: [daily(), water()], estimate, today, days: 1 });
  assert.deepEqual(s.map((i) => `${i.time} ${i.type}`), ['10:00 hydration', '15:00 hydration', '20:00 daily_log']);
});

test('schedule crosses a month and year end', () => {
  const e = estimateCycle({ records: [{ startDate: '2023-12-20' }], settings, today: '2023-12-30' });
  const s = buildSchedule({ reminders: [daily()], estimate: e, today: '2023-12-30', days: 4 });
  assert.deepEqual(s.map((i) => i.date), ['2023-12-30', '2023-12-31', '2024-01-01', '2024-01-02']);
  // estimated start 2024-01-17 with 2 days lead -> 2024-01-15
  assert.deepEqual(buildSchedule({ reminders: [period()], estimate: e, today: '2023-12-30', days: 30 }).map((i) => i.date), ['2024-01-15']);
});
