// The API reference is a CONTRACT. This suite sends the reference's own request examples to the real
// server and checks that every response has the documented status and matches the documented schema.
// It also insists that every documented operation was exercised, so nothing is described but untested.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import openapi from '../../src/docs/openapi.doc.js';

const env = process.env;
const API = process.env.API_BASE ?? 'http://localhost:5000/api';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

// ---------------------------------------------------------------- reading the reference
const OPS = Object.fromEntries(Object.entries(openapi.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => [operation.operationId, { method: method.toUpperCase(), path, operation }])));
const covered = new Set();
const resolve = (schema) => (schema?.$ref ? schema.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node[key], openapi) : schema);

// A small schema checker: type, nullable, enum, required, nested properties, lists, oneOf.
const conforms = (schema, value, where, errors) => {
  const s = resolve(schema);
  if (!s) return;
  if (value === null) { if (s.type && !s.nullable) errors.push(`${where} is null but the reference says it never is`); return; }
  if (s.oneOf) {
    const fits = s.oneOf.some((option) => { const inner = []; conforms(option, value, where, inner); return inner.length === 0; });
    if (!fits) errors.push(`${where} = ${JSON.stringify(value)} matches none of the documented options`);
    return;
  }
  if (s.enum && !s.enum.includes(value)) errors.push(`${where} = ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`);
  const kind = { string: 'string', integer: 'number', boolean: 'boolean' }[s.type];
  if (kind && typeof value !== kind) errors.push(`${where} should be a ${s.type}, got ${JSON.stringify(value)}`);
  if (s.type === 'integer' && typeof value === 'number' && !Number.isInteger(value)) errors.push(`${where} should be a whole number`);
  if (s.type === 'array') {
    if (!Array.isArray(value)) errors.push(`${where} should be a list`);
    else value.forEach((item, i) => conforms(s.items, item, `${where}[${i}]`, errors));
  }
  if (s.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) { errors.push(`${where} should be an object`); return; }
    for (const key of s.required ?? []) if (!(key in value)) errors.push(`${where}.${key} is documented as always present but is missing`);
    for (const [key, child] of Object.entries(s.properties ?? {})) if (key in value) conforms(child, value[key], `${where}.${key}`, errors);
    if (s.additionalProperties && typeof s.additionalProperties === 'object') {
      for (const [key, child] of Object.entries(value)) conforms(s.additionalProperties, child, `${where}.${key}`, errors);
    }
  }
};

// ---------------------------------------------------------------- calling by operation id
const hex = () => Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = day(0);
const newUser = () => { const id = hex(); return { id, token: jwt.sign({ id, role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '1h' }) }; };
const users = { main: newUser(), sync: newUser() };
let adminToken = null;

const call = async (operationId, { who = users.main, path = {}, query = {}, body } = {}) => {
  const { method, path: template, operation } = OPS[operationId];
  covered.add(operationId);
  const url = template.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(path[key]));
  const queryString = new URLSearchParams(query).toString();
  const scheme = operation.security[0] && Object.keys(operation.security[0])[0];
  const token = scheme === 'adminToken' ? adminToken : scheme === 'userToken' ? who.token : null;
  const example = operation.requestBody?.content['application/json'].example;
  const payload = body === undefined ? example : body;

  const res = await fetch(`${API}${url}${queryString ? `?${queryString}` : ''}`, {
    method,
    headers: { ...(payload !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const json = await res.json();

  const documented = Object.keys(operation.responses).find((code) => code.startsWith('2'));
  const errors = [];
  if (String(res.status) !== documented) errors.push(`status ${res.status}, the reference says ${documented}: ${JSON.stringify(json).slice(0, 200)}`);
  else {
    conforms(operation.responses[documented].content['application/json'].schema, json, 'response', errors);
  }
  check(`${operationId}: ${method} ${template} -> ${documented}, and the response matches the reference`, errors.length === 0, errors.slice(0, 3).join(' | '));
  return { status: res.status, json, data: json.data };
};

// ---------------------------------------------------------------- setup for cleanup
const { default: connectDB } = await import('../../src/config/db.config.js').then((m) => ({ default: m.default }));
await connectDB();
const { default: Tip } = await import('../../src/models/tip.model.js');
const { default: ErasureMarker } = await import('../../src/models/erasureMarker.model.js');
const { deleteUserData } = await import('../../src/services/userData.service.js');
await import('../../src/services/syncPush.service.js'); // registers every user-owned model

let originalSettings, originalContent;

try {
  // ---- public
  let r = await call('health');
  check('health reports the database as up', r.data.db === 'up');
  r = await call('getPublicContent');
  check('public content has the disclaimer', r.data.disclaimerText.length > 20 && typeof r.data.featureEnabled === 'boolean');

  // ---- a signed-in user, using the reference's own examples
  r = await call('getMe');
  check('getMe returns the id from the token', r.data.user.id === users.main.id);

  r = await call('getSettings');
  check('settings start on the defaults', r.data.settings.usingDefaults === true);
  r = await call('updateSettings');
  check('the documented settings example is accepted and stored', r.data.settings.cycleLength === 30 && r.data.settings.usingDefaults === false);

  r = await call('createPeriod');
  const periodId = r.data.period.id;
  check('the documented period example is accepted', r.data.period.startDate === '2026-09-01' && r.data.period.durationDays === 5);
  r = await call('getPeriod', { path: { id: periodId } });
  r = await call('updatePeriod', { path: { id: periodId } });
  check('the documented edit example is applied', r.data.period.endDate === '2026-09-06' && r.data.period.durationDays === 6);
  r = await call('listPeriods');
  check('the list holds the period', r.data.total === 1);
  r = await call('getEstimate', { query: { date: today } });
  check('the estimate is flagged as an estimate', r.data.estimate.estimated === true && r.data.estimate.lastPeriodStart === '2026-09-01');
  r = await call('getCalendar', { query: { month: '2026-09' } });
  check('the calendar marks the logged days as actual', r.data.days.some((d) => d.date === '2026-09-01' && d.type === 'actual'));

  r = await call('saveSymptoms', { path: { date: '2026-10-27' } });
  check('the documented symptom example is accepted (201 the first time)', r.data.log.symptoms.includes('cramps') && r.data.log.flow === 'medium');
  await call('getSymptoms', { path: { date: '2026-10-27' } });
  await call('listSymptoms');
  await call('deleteSymptoms', { path: { date: '2026-10-27' } });

  r = await call('listChecklistItems');
  const firstItem = r.data.items[0];
  check('a new user is given the default checklist', r.data.items.length >= 1);
  r = await call('addChecklistItem');
  const addedItem = r.data.item;
  r = await call('updateChecklistItem', { path: { itemId: addedItem.id } });
  check('the documented rename example is applied', r.data.item.label === 'Light stretching');
  r = await call('setChecklistItem', { path: { date: today, itemId: firstItem.id } });
  r = await call('getChecklist', { query: { date: today } });
  check('the tick shows in the day\'s progress', r.data.progress.done === 1);
  r = await call('getChecklistHistory', { query: { from: day(-2), to: today } });
  check('history lists the day with its completed item', r.data.days.length === 1 && r.data.days[0].completed[0].label === firstItem.label);
  await call('deleteChecklistItem', { path: { itemId: addedItem.id } });

  await call('updateReminder', { path: { type: 'hydration' }, body: { times: ['10:00', '15:00'], enabled: true } });
  r = await call('updateReminder', { path: { type: 'period' } });
  check('the documented reminder example is applied', r.data.reminder.enabled === true && r.data.reminder.leadDays === 2 && r.data.reminder.status === 'active');
  r = await call('getReminders', { query: { date: today } });
  check('all three reminders are listed', r.data.reminders.length === 3);
  r = await call('getReminderSchedule', { query: { days: 7, date: today } });
  check('the schedule is flagged as estimated and holds the hydration reminders', r.data.estimated === true && r.data.notifications.filter((n) => n.type === 'hydration').length === 14);
  r = await call('getHydration', { query: { date: today } });
  r = await call('setHydrationDone', { path: { date: today, time: '10:00' } });
  check('the documented hydration example is accepted', r.data.done === true);

  await call('getTips', { query: { date: today } });
  r = await call('getSelfCareToday', { query: { date: today } });
  check('the one-call self-care screen holds the checklist and hydration', r.data.checklist.items.length >= 1 && r.data.hydration.length === 2);
  await call('deletePeriod', { path: { id: periodId } });

  // ---- sync, export and erase (a second user, so the first one's data is not disturbed)
  r = await call('sync', { who: users.sync });
  check('the documented sync example is applied (1 period, 1 symptom log)', r.data.push.applied.periods === 1 && r.data.push.applied.symptoms === 1 && r.data.push.rejected.length === 0, JSON.stringify(r.data.push));
  check('and the sync answer reports the epoch and no resync', r.data.epoch === (env.DATA_EPOCH || '1') && r.data.resyncRequired === false);
  r = await call('exportData', { who: users.sync });
  check('the export holds what was synced', r.data.data.periods.length === 1 && r.data.data.symptoms.length === 1);
  r = await call('eraseData', { who: users.sync });
  r = await call('exportData', { who: users.sync });
  check('after the documented erase request the export is empty', r.data.data.periods.length === 0);

  // ---- the admin
  const login = await fetch(`${API}/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
  adminToken = (await login.json()).data.token;
  r = await call('adminLogin', { body: { identifier: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  await call('adminMe');
  r = await call('adminDashboard');
  check('the dashboard is aggregates only (no ids)', !/[0-9a-f]{24}/i.test(JSON.stringify(r.data)));

  originalSettings = (await call('adminGetSettings')).data.settings;
  originalContent = (await call('adminGetContent')).data.content;
  await call('adminListTips');
  const exampleTip = OPS.adminCreateTip.operation.requestBody.content['application/json'].example;
  r = await call('adminCreateTip', { body: { ...exampleTip, title: `ZZDOCS ${hex().slice(0, 6)}` } });
  const tipId = r.data.tip.id;
  check('a new tip starts hidden and unreviewed', r.data.tip.active === false && r.data.tip.reviewedAt === null);
  await call('adminGetTip', { path: { id: tipId } });
  r = await call('adminUpdateTip', { path: { id: tipId } });
  check('the documented tip edit is applied', r.data.tip.text === 'A gentle walk is optional. You can rest instead.');
  r = await call('adminReviewTip', { path: { id: tipId } });
  check('the documented review example is accepted and recorded', r.data.tip.reviewedBy === 'Dr. A. Rao' && r.data.tip.reviewedAt.startsWith('2026-10-20'));
  r = await call('adminSetTipActive', { path: { id: tipId } });
  check('after review the tip can be activated', r.data.tip.active === true);
  await call('adminDeleteTip', { path: { id: tipId } });

  r = await call('adminUpdateSettings');
  check('the documented settings example is accepted', r.data.settings.featureEnabled === true);
  r = await call('adminUpdateContent');
  check('the documented content example is applied', /can be deleted at any time/.test(r.data.content.privacyText));

  // ---- every documented operation was tried
  const missed = Object.keys(OPS).filter((id) => !covered.has(id));
  check(`all ${Object.keys(OPS).length} documented operations were exercised`, missed.length === 0, `not exercised: ${missed.join(', ')}`);
} catch (err) {
  fail += 1;
  console.log('FAIL  script crashed:', err.stack);
} finally {
  // put the admin's settings and texts back exactly as they were
  try {
    if (originalSettings) {
      const { featureEnabled, defaultCycleLength, defaultPeriodDuration } = originalSettings;
      await call('adminUpdateSettings', { body: { featureEnabled, defaultCycleLength, defaultPeriodDuration } });
    }
    if (originalContent) {
      const { disclaimerText, privacyText, defaultChecklistItems } = originalContent;
      await call('adminUpdateContent', { body: { disclaimerText, privacyText, ...(defaultChecklistItems.length > 0 && { defaultChecklistItems }) } });
    }
  } catch (err) {
    fail += 1;
    console.log('FAIL  could not restore the admin settings:', err.message);
  }
  await Tip.deleteMany({ title: /^ZZDOCS/ });
  for (const user of Object.values(users)) await deleteUserData(user.id);
  await ErasureMarker.deleteMany({ user: { $in: Object.values(users).map((u) => u.id) } });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
