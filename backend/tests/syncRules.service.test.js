import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideLww, clampTimestamp, parseTimestamp, validateRecord, isObjectId, rangesOverlap, MAX_CLOCK_SKEW_MS,
} from '../src/services/syncRules.service.js';

const today = '2024-05-10';
const id = 'a'.repeat(24);
const at = (iso) => new Date(iso);

test('parseTimestamp accepts ISO date-times only', () => {
  assert.ok(parseTimestamp('2024-05-10T10:00:00.000Z') instanceof Date);
  assert.equal(parseTimestamp('2024-05-10'), null);
  assert.equal(parseTimestamp('yesterday'), null);
  assert.equal(parseTimestamp(1715335200000), null);
  assert.equal(parseTimestamp(undefined), null);
  assert.equal(parseTimestamp('2024-13-45T10:00:00Z'), null);
});

test('decideLww: create, update, unchanged (retry), stale', () => {
  assert.equal(decideLww(null, at('2024-05-10T10:00:00Z')), 'create');
  assert.equal(decideLww(at('2024-05-10T10:00:00Z'), at('2024-05-10T10:00:01Z')), 'update');
  assert.equal(decideLww(at('2024-05-10T10:00:00Z'), at('2024-05-10T10:00:00Z')), 'unchanged');
  assert.equal(decideLww(at('2024-05-10T10:00:01Z'), at('2024-05-10T10:00:00Z')), 'stale');
});

test('clampTimestamp stops a fast device clock from winning forever', () => {
  const now = at('2024-05-10T12:00:00Z');
  assert.equal(clampTimestamp(at('2030-01-01T00:00:00Z'), now), now);
  const slightlyAhead = new Date(now.getTime() + MAX_CLOCK_SKEW_MS - 1000);
  assert.equal(clampTimestamp(slightlyAhead, now), slightlyAhead); // normal clock skew is allowed
  const past = at('2024-05-01T00:00:00Z');
  assert.equal(clampTimestamp(past, now), past);
});

test('isObjectId', () => {
  assert.equal(isObjectId(id), true);
  assert.equal(isObjectId('xyz'), false);
  assert.equal(isObjectId('a'.repeat(23)), false);
  assert.equal(isObjectId(123), false);
});

test('periods', () => {
  assert.equal(validateRecord('periods', { id, startDate: '2024-05-01', endDate: '2024-05-05', notes: 'ok' }, today), null);
  assert.equal(validateRecord('periods', { id, startDate: '2024-05-01' }, today), null);
  assert.match(validateRecord('periods', { id: 'bad', startDate: '2024-05-01' }, today), /id/);
  assert.match(validateRecord('periods', { id, startDate: '2024-02-30' }, today), /startDate/);
  assert.match(validateRecord('periods', { id, startDate: '2024-05-20' }, today), /future/);
  assert.match(validateRecord('periods', { id, startDate: '2024-05-05', endDate: '2024-05-01' }, today), /before/);
  assert.match(validateRecord('periods', { id, startDate: '2024-04-01', endDate: '2024-04-30' }, today), /longer/);
  assert.match(validateRecord('periods', { id, startDate: '2024-05-01', notes: 'x'.repeat(501) }, today), /notes/);
  assert.equal(validateRecord('periods', { id, startDate: '2024-05-11' }, today), null); // one day ahead covers time zones
});

test('a delete needs only the identity', () => {
  assert.equal(validateRecord('periods', { id, deleted: true }, today), null);
  assert.equal(validateRecord('symptoms', { date: '2024-05-01', deleted: true }, today), null);
  assert.equal(validateRecord('checklistItems', { id, deleted: true }, today), null);
  assert.match(validateRecord('periods', { id: 'bad', deleted: true }, today), /id/);
  assert.match(validateRecord('reminders', { type: 'period', deleted: true }, today), /cannot be deleted/);
  assert.match(validateRecord('periods', { id, startDate: '2024-05-01', deleted: 'yes' }, today), /deleted/);
});

test('symptoms', () => {
  assert.equal(validateRecord('symptoms', { date: '2024-05-01', symptoms: ['cramps'], flow: 'light', mood: 'calm', energy: 'low', note: 'n' }, today), null);
  assert.equal(validateRecord('symptoms', { date: '2024-05-01', mood: 'calm' }, today), null);
  assert.match(validateRecord('symptoms', { date: '2024-05-01' }, today), /at least one/);
  assert.match(validateRecord('symptoms', { date: '2024-05-01', symptoms: ['PCOS'] }, today), /symptoms/);
  assert.match(validateRecord('symptoms', { date: '2024-05-01', flow: 'huge' }, today), /flow/);
  assert.match(validateRecord('symptoms', { date: '2024-05-01', mood: 'angry' }, today), /mood/);
  assert.match(validateRecord('symptoms', { date: '2024-05-01', energy: 'x' }, today), /energy/);
  assert.match(validateRecord('symptoms', { date: 'bad', mood: 'calm' }, today), /date/);
});

test('checklist items and logs', () => {
  assert.equal(validateRecord('checklistItems', { id, label: 'Rest', order: 2 }, today), null);
  assert.match(validateRecord('checklistItems', { id, label: '  ' }, today), /label/);
  assert.match(validateRecord('checklistItems', { id, label: 'y'.repeat(81) }, today), /label/);
  assert.match(validateRecord('checklistItems', { id, label: 'ok', order: -1 }, today), /order/);
  assert.equal(validateRecord('checklistLogs', { date: '2024-05-01', itemId: id, completed: true }, today), null);
  assert.match(validateRecord('checklistLogs', { date: '2024-05-01', itemId: 'bad', completed: true }, today), /itemId/);
  assert.match(validateRecord('checklistLogs', { date: '2024-05-01', itemId: id, completed: 'yes' }, today), /completed/);
});

test('hydration logs', () => {
  assert.equal(validateRecord('hydrationLogs', { date: '2024-05-01', time: '10:00', done: true }, today), null);
  assert.match(validateRecord('hydrationLogs', { date: '2024-05-01', time: '25:00', done: true }, today), /time/);
  assert.match(validateRecord('hydrationLogs', { date: '2024-05-01', time: '10:00', done: 1 }, today), /done/);
});

test('reminders only accept the settings that apply to their type', () => {
  assert.equal(validateRecord('reminders', { type: 'period', enabled: true, leadDays: 3, timeOfDay: '08:30' }, today), null);
  assert.equal(validateRecord('reminders', { type: 'hydration', enabled: true, times: ['10:00', '15:00'] }, today), null);
  assert.equal(validateRecord('reminders', { type: 'daily_log', timeOfDay: '20:00', snoozedUntil: '2024-05-12' }, today), null);
  assert.match(validateRecord('reminders', { type: 'nonsense' }, today), /type/);
  assert.match(validateRecord('reminders', { type: 'hydration', leadDays: 2 }, today), /leadDays/);
  assert.match(validateRecord('reminders', { type: 'period', leadDays: 9 }, today), /leadDays/);
  assert.match(validateRecord('reminders', { type: 'hydration', timeOfDay: '10:00' }, today), /timeOfDay/);
  assert.match(validateRecord('reminders', { type: 'period', times: ['10:00'] }, today), /times/);
  assert.match(validateRecord('reminders', { type: 'hydration', times: ['99:99'] }, today), /times/);
  assert.match(validateRecord('reminders', { type: 'daily_log', snoozedUntil: 'tomorrow' }, today), /snoozedUntil/);
});

test('settings', () => {
  assert.equal(validateRecord('settings', { cycleLength: 30 }, today), null);
  assert.equal(validateRecord('settings', { periodDuration: 6 }, today), null);
  assert.match(validateRecord('settings', {}, today), /Provide/);
  assert.match(validateRecord('settings', { cycleLength: 70 }, today), /cycleLength/);
  assert.match(validateRecord('settings', { periodDuration: 0 }, today), /periodDuration/);
  assert.match(validateRecord('settings', { cycleLength: 28.5 }, today), /cycleLength/);
});

test('non-objects are rejected', () => {
  assert.match(validateRecord('periods', null, today), /object/);
  assert.match(validateRecord('periods', 'x', today), /object/);
  assert.match(validateRecord('periods', [], today), /object/);
});

test('rangesOverlap: two closed periods', () => {
  const a = { startDate: '2026-05-01', endDate: '2026-05-05' };
  const period = (startDate, endDate) => ({ startDate, endDate });
  assert.equal(rangesOverlap(a, period('2026-05-03', '2026-05-04')), true); // inside
  assert.equal(rangesOverlap(a, period('2026-04-20', '2026-05-01')), true); // ends on a's first day
  assert.equal(rangesOverlap(a, period('2026-05-05', '2026-05-09')), true); // starts on a's last day
  assert.equal(rangesOverlap(a, period('2026-04-25', '2026-05-10')), true); // contains a
  assert.equal(rangesOverlap(a, period('2026-05-06', '2026-05-09')), false); // the day after
  assert.equal(rangesOverlap(a, period('2026-04-20', '2026-04-30')), false); // the day before
  assert.equal(rangesOverlap(a, period('2026-05-01', '2026-05-05')), true); // the same period
});

test('rangesOverlap: a period with no end date counts as a single day', () => {
  const open = (startDate) => ({ startDate, endDate: null });
  const a = { startDate: '2026-05-01', endDate: '2026-05-05' };
  assert.equal(rangesOverlap(a, open('2026-05-03')), true);
  assert.equal(rangesOverlap(a, open('2026-04-01')), false);
  assert.equal(rangesOverlap(a, open('2026-05-06')), false);
  // when the new period is the open one, only its first day counts
  assert.equal(rangesOverlap(open('2026-05-01'), { startDate: '2026-04-28', endDate: '2026-05-01' }), true);
  assert.equal(rangesOverlap(open('2026-05-01'), { startDate: '2026-05-02', endDate: '2026-05-06' }), false);
  assert.equal(rangesOverlap(open('2026-05-01'), open('2026-05-01')), true); // same start date
});
