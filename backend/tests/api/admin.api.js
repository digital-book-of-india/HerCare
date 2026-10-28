import 'dotenv/config';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const BACKEND = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '').replaceAll('\\', '/');
const require = createRequire(`${BACKEND}/package.json`);
const jwt = require('jsonwebtoken');
const load = (p) => import(pathToFileURL(`${BACKEND}/src/${p}`).href);

const env = process.env;
const API = process.env.API_BASE ?? 'http://localhost:5000/api';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const hex = () => Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = day(0);
const dbiToken = (id) => jwt.sign({ id, role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '1h' });

const raw = async (method, path, body, token) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

// ---- login as the predefined admin
let r = await raw('POST', '/admin/auth/login', { identifier: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
const adminToken = r.json.data.token;
const admin = (method, path, body) => raw(method, `/admin${path}`, body, adminToken);

const allUsers = [];
const newUser = () => { const id = hex(); allUsers.push(id); return { id, token: dbiToken(id) }; };
const asUser = (u) => (method, path, body) => raw(method, `/user${path}`, body, u.token);

// ---- database access for cleanup
const { default: connectDB } = await load('config/db.config.js');
await connectDB();
const { default: Tip } = await load('models/tip.model.js');
const { default: ErasureMarker } = await load('models/erasureMarker.model.js');
const { deleteUserData } = await load('services/userData.service.js');
await load('services/syncPush.service.js'); // registers every user-owned model

const original = {
  settings: (await admin('GET', '/settings')).json.data.settings,
  content: (await admin('GET', '/content')).json.data.content,
};
const adminResponses = []; // every admin GET body, searched for personal data at the end
const adminGet = async (path) => { const res = await admin('GET', path); adminResponses.push(JSON.stringify(res.json)); return res; };

try {
  // =========================================================== dashboard (database has no user data yet)
  r = await adminGet('/dashboard');
  const base = r.json.data;
  check('dashboard: has every section', r.status === 200 && base.users && base.records && base.activeReminders && base.tips && base.feature && base.privacyNote && base.generatedAt, JSON.stringify(r.json).slice(0, 300));
  const emptyDb = base.users.total === 0 && base.records.periods === 0;
  check('dashboard: starts empty (needed for the exact-count checks below)', emptyDb, JSON.stringify(base.users));

  const noteOf = new Map();
  const logActivity = async (u) => {
    const call = asUser(u);
    noteOf.set(u.id, `SECRET-NOTE-${u.id}`);
    await call('POST', '/periods', { startDate: day(-10), endDate: day(-7), notes: noteOf.get(u.id) });
    await call('PUT', `/symptoms/${today}`, { mood: 'calm', note: `SECRET-SYMPTOM-${u.id}` });
    await call('PATCH', '/reminders/period', { enabled: true });
    await call('PATCH', '/reminders/hydration', { times: ['10:00'], enabled: true });
    await call('PUT', `/hydration/${today}/10:00`, { done: true });
    const items = (await call('GET', '/checklist/items')).json.data.items;
    await call('PUT', `/checklist/${today}/items/${items[0].id}`, { completed: true });
  };

  const dash = [newUser(), newUser(), newUser(), newUser(), newUser(), newUser()];
  for (const u of dash.slice(0, 2)) await logActivity(u);
  r = await adminGet('/dashboard');
  let d = r.json.data;
  check('2 users: every user-derived count is hidden as "<5"', d.users.total === '<5' && d.users.activeLast7Days === '<5' && d.users.activeLast30Days === '<5' && d.records.periods === '<5' && d.records.symptomLogs === '<5' && d.records.checklistItemsCompleted === '<5' && d.records.hydrationRemindersDone === '<5' && d.activeReminders.period === '<5' && d.activeReminders.hydration === '<5', JSON.stringify(d));
  check('2 users: zero still shows as exactly 0', d.activeReminders.daily_log === 0);

  for (const u of dash.slice(2)) await logActivity(u);
  r = await adminGet('/dashboard');
  d = r.json.data;
  check('6 users: exact counts are shown', d.users.total === 6 && d.users.activeLast7Days === 6 && d.users.activeLast30Days === 6, JSON.stringify(d.users));
  check('6 users: record counts', d.records.periods === 6 && d.records.symptomLogs === 6 && d.records.checklistItemsCompleted === 6 && d.records.hydrationRemindersDone === 6, JSON.stringify(d.records));
  check('6 users: active reminders by type', d.activeReminders.period === 6 && d.activeReminders.hydration === 6 && d.activeReminders.daily_log === 0, JSON.stringify(d.activeReminders));

  const first = asUser(dash[0]);
  const firstPeriod = (await first('GET', '/periods')).json.data.items[0];
  await first('DELETE', `/periods/${firstPeriod.id}`);
  await first('PATCH', '/reminders/period', { paused: true });
  r = await adminGet('/dashboard');
  d = r.json.data;
  check('a deleted period is not counted', d.records.periods === 5, JSON.stringify(d.records));
  check('a paused reminder is not counted as active', d.activeReminders.period === 5, JSON.stringify(d.activeReminders));

  await asUser(dash[1])('DELETE', '/data', { confirm: 'DELETE ALL MY DATA' });
  r = await adminGet('/dashboard');
  check('erasing a user\'s data removes them from the counts (6 -> 5)', r.json.data.users.total === 5, JSON.stringify(r.json.data.users));
  await asUser(dash[2])('DELETE', '/data', { confirm: 'DELETE ALL MY DATA' });
  r = await adminGet('/dashboard');
  check('and below 5 the number is hidden again', r.json.data.users.total === '<5', JSON.stringify(r.json.data.users));

  const dashboardJson = JSON.stringify(r.json.data);
  check('the dashboard contains no ids at all', !/[0-9a-f]{24}/i.test(dashboardJson) && !/SECRET/.test(dashboardJson));

  // tidy up the dashboard users now, so later sections start from an empty database
  for (const u of dash) { await deleteUserData(u.id); await ErasureMarker.deleteOne({ user: u.id }); }
  r = await adminGet('/dashboard');
  check('dashboard is back to empty after cleanup', r.json.data.users.total === 0 && r.json.data.records.periods === 0);

  // =========================================================== access control
  const probeUser = newUser();
  for (const [method, path] of [['GET', '/dashboard'], ['GET', '/tips'], ['POST', '/tips'], ['GET', '/content'], ['PATCH', '/content'], ['GET', '/settings'], ['PATCH', '/settings'], ['GET', '/me']]) {
    r = await raw(method, `/admin${path}`, method === 'GET' ? undefined : {});
    check(`admin ${method} ${path}: 401 without a token`, r.status === 401);
  }
  r = await raw('GET', '/admin/dashboard', undefined, probeUser.token);
  check('a DBI user token cannot open the admin dashboard', r.status === 401);
  r = await raw('GET', '/admin/tips', undefined, jwt.sign({ id: probeUser.id, role: 'admin' }, env.DBI_JWT_SECRET));
  check('a DBI token claiming role admin is still refused', r.status === 401);
  r = await raw('GET', '/user/periods', undefined, adminToken);
  check('the admin token cannot read user data either', r.status === 401);
  for (const path of ['/users', `/users/${probeUser.id}`, `/users/${probeUser.id}/periods`, '/periods', '/symptoms', '/reminders', '/checklist', '/export', '/sync']) {
    r = await admin('GET', path);
    check(`no admin route for ${path} (404)`, r.status === 404);
  }

  // =========================================================== tips
  const T = (extra = {}) => ({ category: 'food', title: `ZZADMIN ${hex().slice(0, 6)}`, text: 'A general wellness tip.', ...extra });
  const tipUser = newUser();
  const userTips = asUser(tipUser);
  const visible = async (category) => (await userTips('GET', `/tips${category ? `?category=${category}` : ''}`)).json.data.tips;

  r = await admin('POST', '/tips', { category: 'nonsense', title: 'x', text: 'y' });
  check('tip: bad category rejected', r.status === 400);
  r = await admin('POST', '/tips', T({ title: '   ' }));
  check('tip: blank title rejected', r.status === 400);
  r = await admin('POST', '/tips', T({ title: 'x'.repeat(101) }));
  check('tip: title over 100 chars rejected', r.status === 400);
  r = await admin('POST', '/tips', T({ text: 'x'.repeat(501) }));
  check('tip: text over 500 chars rejected', r.status === 400);
  r = await admin('POST', '/tips', T({ showWhen: 'sometimes' }));
  check('tip: bad showWhen rejected', r.status === 400);

  const base1 = (await adminGet('/dashboard')).json.data.tips;
  const t1Body = T({ title: 'ZZADMIN Alpha', category: 'food' });
  r = await admin('POST', '/tips', t1Body);
  const t1 = r.json.data?.tip;
  check('tip: created inactive and unreviewed', r.status === 201 && t1.active === false && t1.reviewedAt === null && t1.reviewedBy === null, JSON.stringify(r.json));
  r = await admin('POST', '/tips', t1Body);
  check('tip: duplicate title in the same category -> 409', r.status === 409);
  r = await admin('POST', '/tips', { ...t1Body, category: 'activity' });
  const t2 = r.json.data?.tip;
  check('tip: the same title in another category is fine', r.status === 201);
  r = await admin('POST', '/tips', T({ title: 'ZZADMIN Period Only', showWhen: 'period' }));
  const t3 = r.json.data?.tip;

  r = await adminGet('/dashboard');
  check('dashboard tip counts follow (+3 total, +3 awaiting review, +0 active)', r.json.data.tips.total === base1.total + 3 && r.json.data.tips.awaitingReview === base1.awaitingReview + 3 && r.json.data.tips.active === base1.active);

  r = await adminGet('/tips?category=food&reviewed=false&active=false');
  check('tip list: filters work', r.status === 200 && r.json.data.items.some((t) => t.id === t1.id) && r.json.data.items.every((t) => t.category === 'food' && t.active === false && t.reviewedAt === null));
  r = await adminGet('/tips?limit=1&page=2');
  check('tip list: pagination', r.status === 200 && r.json.data.items.length === 1 && r.json.data.limit === 1);
  r = await admin('GET', '/tips?limit=500');
  check('tip list: limit over 200 rejected', r.status === 400);
  r = await adminGet(`/tips/${t1.id}`);
  check('tip: get one', r.status === 200 && r.json.data.tip.title === 'ZZADMIN Alpha');
  const chosenId = hex();
  r = await admin('POST', '/tips', T({ title: 'ZZADMIN Chosen id', _id: chosenId, active: true, reviewedAt: new Date().toISOString() }));
  check('tip: an id, an "active" flag or a review date sent by the admin when creating is ignored', r.status === 201 && r.json.data.tip.id !== chosenId && r.json.data.tip.active === false && r.json.data.tip.reviewedAt === null, JSON.stringify(r.json));
  const dashboardAfterExtra = (await admin('GET', '/dashboard')).json.data.tips;
  r = await admin('DELETE', `/tips/${r.json.data.tip.id}`);
  check('tip: that extra tip is removed again', r.status === 200 && dashboardAfterExtra.total === base1.total + 4);
  r = await admin('GET', `/tips/${hex()}`);
  check('tip: unknown id 404', r.status === 404);
  r = await admin('GET', '/tips/not-an-id');
  check('tip: bad id 400', r.status === 400);

  r = await admin('PATCH', `/tips/${t1.id}/active`, { active: true });
  check('tip: cannot be activated before it is reviewed', r.status === 409 && r.json.error.code === 'TIP_NOT_REVIEWED', JSON.stringify(r.json));
  check('tip: users do not see it', !(await visible()).some((t) => t.title === 'ZZADMIN Alpha'));
  r = await admin('POST', `/tips/${t1.id}/review`, { reviewedAt: '2099-01-01' });
  check('tip: review date in the future rejected', r.status === 400);
  r = await admin('POST', `/tips/${t1.id}/review`, { reviewedAt: '2024-02-30' });
  check('tip: impossible review date rejected', r.status === 400);
  r = await admin('POST', `/tips/${t1.id}/review`, { reviewedBy: 'Dr. Test Reviewer' });
  check('tip: reviewed (defaults to today) with the reviewer recorded', r.status === 200 && r.json.data.tip.reviewedBy === 'Dr. Test Reviewer' && r.json.data.tip.reviewedAt.startsWith(today), JSON.stringify(r.json));
  check('tip: still hidden from users until activated', !(await visible()).some((t) => t.title === 'ZZADMIN Alpha'));
  r = await admin('PATCH', `/tips/${t1.id}/active`, { active: 'maybe' });
  check('tip: active must be a boolean', r.status === 400);
  r = await admin('PATCH', `/tips/${t1.id}/active`, { active: true });
  check('tip: activated after review', r.status === 200 && r.json.data.tip.active === true);
  check('tip: now visible to users', (await visible('food')).some((t) => t.title === 'ZZADMIN Alpha'));

  await admin('POST', `/tips/${t3.id}/review`, {});
  await admin('PATCH', `/tips/${t3.id}/active`, { active: true });
  check('tip: a period-only tip is hidden while not in a period', !(await visible()).some((t) => t.title === 'ZZADMIN Period Only'));
  const inPeriod = newUser();
  await asUser(inPeriod)('POST', '/periods', { startDate: day(-1) });
  check('tip: and shown while a period is logged', (await asUser(inPeriod)('GET', '/tips')).json.data.tips.some((t) => t.title === 'ZZADMIN Period Only'));

  r = await admin('PATCH', `/tips/${t1.id}`, { text: 'A general wellness tip.' });
  check('tip: saving unchanged wording keeps the review', r.status === 200 && r.json.data.reviewReset === false && r.json.data.tip.active === true && r.json.data.tip.reviewedAt !== null);
  r = await admin('PATCH', `/tips/${t1.id}`, {});
  check('tip: empty edit rejected', r.status === 400);
  r = await admin('PATCH', `/tips/${t1.id}`, { text: 'Reworded advice that nobody has reviewed yet.' });
  check('tip: changing the wording resets the review and takes it offline', r.status === 200 && r.json.data.reviewReset === true && r.json.data.tip.active === false && r.json.data.tip.reviewedAt === null && r.json.data.tip.reviewedBy === null, JSON.stringify(r.json));
  check('tip: so users no longer see the unreviewed wording', !(await visible()).some((t) => t.title === 'ZZADMIN Alpha'));
  r = await admin('PATCH', `/tips/${t1.id}/active`, { active: true });
  check('tip: and it cannot be switched back on without a new review', r.status === 409);
  await admin('POST', `/tips/${t1.id}/review`, {});
  await admin('PATCH', `/tips/${t1.id}/active`, { active: true });
  check('tip: re-reviewed and back online with the new wording', (await visible('food')).some((t) => t.title === 'ZZADMIN Alpha' && /Reworded/.test(t.text)));
  r = await admin('PATCH', `/tips/${t1.id}`, { title: 'ZZADMIN Period Only', category: 'food' });
  check('tip: renaming onto an existing title -> 409', r.status === 409);

  r = await admin('PATCH', `/tips/${t1.id}/active`, { active: false });
  check('tip: deactivated', r.status === 200 && r.json.data.tip.active === false);
  check('tip: hidden again', !(await visible()).some((t) => t.title === 'ZZADMIN Alpha'));
  r = await admin('DELETE', `/tips/${t2.id}`);
  check('tip: deleted', r.status === 200);
  r = await admin('GET', `/tips/${t2.id}`);
  check('tip: gone after delete', r.status === 404);
  r = await admin('DELETE', `/tips/${t2.id}`);
  check('tip: deleting twice -> 404', r.status === 404);

  // =========================================================== default content
  const contentUserOld = newUser();
  const oldCall = asUser(contentUserOld);
  const oldItems = (await oldCall('GET', '/checklist/items')).json.data.items;
  check('content: existing user starts with the original default checklist', oldItems.length === original.content.defaultChecklistItems.length);

  r = await adminGet('/content');
  check('content: read', r.status === 200 && r.json.data.content.disclaimerText.length > 20 && Array.isArray(r.json.data.content.defaultChecklistItems));
  for (const [name, body] of [
    ['too-short disclaimer', { disclaimerText: 'short' }],
    ['blank disclaimer', { disclaimerText: '                         ' }],
    ['too-short privacy text', { privacyText: 'short' }],
    ['more than 20 checklist items', { defaultChecklistItems: Array.from({ length: 21 }, (_, i) => ({ id: `item-${i}`, label: 'x' })) }],
    ['bad checklist item id', { defaultChecklistItems: [{ id: 'Bad Id!', label: 'x' }] }],
    ['duplicate checklist item ids', { defaultChecklistItems: [{ id: 'a', label: 'x' }, { id: 'a', label: 'y' }] }],
    ['empty checklist label', { defaultChecklistItems: [{ id: 'a', label: '' }] }],
    ['an empty request', {}],
  ]) {
    r = await admin('PATCH', '/content', body);
    check(`content: ${name} rejected`, r.status === 400);
  }
  const newDisclaimer = 'ZZTEST disclaimer: this app gives estimates, not medical advice or guarantees.';
  r = await admin('PATCH', '/content', {
    disclaimerText: newDisclaimer,
    privacyText: 'ZZTEST privacy: your data stays yours and can be deleted any time.',
    defaultChecklistItems: [{ id: 'zz-one', label: 'ZZ first item' }, { id: 'zz-two', label: 'ZZ second item' }],
  });
  check('content: saved', r.status === 200 && r.json.data.content.defaultChecklistItems.length === 2, JSON.stringify(r.json));
  r = await raw('GET', '/content');
  check('content: the public endpoint shows the new disclaimer and privacy text', r.json.data.disclaimerText === newDisclaimer && /ZZTEST privacy/.test(r.json.data.privacyText));
  const contentUserNew = newUser();
  r = await asUser(contentUserNew)('GET', '/checklist/items');
  check('content: a NEW user gets the new default checklist', r.json.data.items.length === 2 && r.json.data.items[0].label === 'ZZ first item', JSON.stringify(r.json));
  r = await oldCall('GET', '/checklist/items');
  check('content: an EXISTING user keeps their own checklist', r.json.data.items.length === oldItems.length && r.json.data.items.every((i) => oldItems.some((o) => o.id === i.id)));

  // =========================================================== settings and feature switch
  for (const [name, body] of [
    ['cycle length 70', { defaultCycleLength: 70 }], ['cycle length 10', { defaultCycleLength: 10 }],
    ['period duration 0', { defaultPeriodDuration: 0 }], ['period duration 16', { defaultPeriodDuration: 16 }],
    ['featureEnabled "perhaps"', { featureEnabled: 'perhaps' }], ['an empty request', {}],
  ]) {
    r = await admin('PATCH', '/settings', body);
    check(`settings: ${name} rejected`, r.status === 400);
  }
  r = await adminGet('/settings');
  check('settings: read', r.status === 200 && typeof r.json.data.settings.featureEnabled === 'boolean');

  const ownCycle = newUser();
  await asUser(ownCycle)('PATCH', '/settings', { cycleLength: 26 });
  const defaultsUser = newUser();
  r = await admin('PATCH', '/settings', { defaultCycleLength: 31, defaultPeriodDuration: 6 });
  check('settings: defaults changed', r.status === 200 && r.json.data.settings.defaultCycleLength === 31 && r.json.data.settings.defaultPeriodDuration === 6);
  r = await asUser(defaultsUser)('GET', '/settings');
  check('settings: a user with no settings of their own gets the new defaults', r.json.data.settings.cycleLength === 31 && r.json.data.settings.periodDuration === 6 && r.json.data.settings.usingDefaults === true, JSON.stringify(r.json));
  r = await asUser(ownCycle)('GET', '/settings');
  check('settings: a user who chose their own cycle length keeps it', r.json.data.settings.cycleLength === 26 && r.json.data.settings.periodDuration === 6);

  const switchUser = newUser();
  const sw = asUser(switchUser);
  await sw('POST', '/periods', { startDate: day(-3), endDate: day(-1), notes: 'kept through the switch' });
  r = await admin('PATCH', '/settings', { featureEnabled: false });
  check('feature switch: turned off', r.status === 200 && r.json.data.settings.featureEnabled === false);
  for (const [method, path, body] of [['GET', '/periods'], ['POST', '/periods', { startDate: day(-20) }], ['GET', '/cycle/estimate'], ['GET', '/tips'], ['GET', '/selfcare/today'], ['GET', '/reminders'], ['POST', '/sync', {}], ['GET', '/settings']]) {
    r = await sw(method, path, body);
    check(`feature switch off: ${method} /user${path} -> 503 FEATURE_DISABLED`, r.status === 503 && r.json.error.code === 'FEATURE_DISABLED', JSON.stringify(r.json));
  }
  r = await sw('GET', '/me');
  check('feature switch off: /me still works', r.status === 200);
  r = await sw('GET', '/export');
  check('feature switch off: the user can still export their data', r.status === 200 && r.json.data.data.periods.length === 1 && r.json.data.data.periods[0].notes === 'kept through the switch');
  r = await raw('GET', '/content');
  check('feature switch off: the public content says so', r.status === 200 && r.json.data.featureEnabled === false);
  r = await admin('GET', '/dashboard');
  check('feature switch off: the admin panel keeps working', r.status === 200 && r.json.data.feature.enabled === false);
  r = await admin('PATCH', '/settings', { featureEnabled: true });
  r = await sw('GET', '/periods');
  check('feature switch back on: data is intact and the feature works again', r.status === 200 && r.json.data.total === 1);

  const eraseWhileOff = newUser();
  await asUser(eraseWhileOff)('POST', '/periods', { startDate: day(-3) });
  await admin('PATCH', '/settings', { featureEnabled: false });
  r = await asUser(eraseWhileOff)('DELETE', '/data', { confirm: 'DELETE ALL MY DATA' });
  check('feature switch off: the user can still erase their data', r.status === 200);
  await admin('PATCH', '/settings', { featureEnabled: true });

  // =========================================================== privacy: nothing personal in any admin response
  adminResponses.push(JSON.stringify((await admin('GET', '/tips?limit=200')).json));
  const everything = adminResponses.join('\n');
  const leaked = allUsers.filter((id) => everything.includes(id));
  check('privacy: no test user id appears in any admin response', leaked.length === 0, leaked.join(','));
  check('privacy: no note or symptom text appears in any admin response', !/SECRET|kept through the switch/.test(everything));
} catch (err) {
  fail += 1;
  console.log('FAIL  script crashed:', err.stack);
} finally {
  // ---- restore settings and content, remove test tips and every test user's data
  await admin('PATCH', '/settings', {
    featureEnabled: original.settings.featureEnabled,
    defaultCycleLength: original.settings.defaultCycleLength,
    defaultPeriodDuration: original.settings.defaultPeriodDuration,
  });
  await admin('PATCH', '/content', {
    disclaimerText: original.content.disclaimerText,
    privacyText: original.content.privacyText,
    defaultChecklistItems: original.content.defaultChecklistItems.length ? original.content.defaultChecklistItems : undefined,
  });
  await Tip.deleteMany({ title: /^ZZADMIN/ });
  for (const id of allUsers) await deleteUserData(id);
  await ErasureMarker.deleteMany({ user: { $in: allUsers } });
  const after = await admin('GET', '/settings');
  const afterContent = await admin('GET', '/content');
  const restored = JSON.stringify(after.json.data.settings) !== undefined
    && after.json.data.settings.defaultCycleLength === original.settings.defaultCycleLength
    && after.json.data.settings.featureEnabled === original.settings.featureEnabled
    && afterContent.json.data.content.disclaimerText === original.content.disclaimerText
    && afterContent.json.data.content.defaultChecklistItems.length === original.content.defaultChecklistItems.length;
  console.log(`\ncleanup: settings and content restored = ${restored}, test tips and users removed`);
  if (!restored) fail += 1;
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
