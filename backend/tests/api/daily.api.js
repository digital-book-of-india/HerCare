import 'dotenv/config';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const BACKEND = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '').replaceAll('\\', '/');
const require = createRequire(`${BACKEND}/package.json`);
const jwt = require('jsonwebtoken');
const load = (p) => import(pathToFileURL(`${BACKEND}/src/${p}`).href);

const env = process.env;
const BASE = process.env.API_BASE ?? 'http://localhost:5000/api';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const hex = () => Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const users = { A: hex(), B: hex(), D: hex(), E: hex() };
const tokens = Object.fromEntries(Object.entries(users).map(([k, id]) => [k, jwt.sign({ id, role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '1h' })]));

const call = async (method, path, body, who = 'A') => {
  const token = who === null ? null : tokens[who];
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};
const u = (p) => `/user${p}`;
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = day(0);

// ---- database access for setup/verification/cleanup (the same models the server uses)
const { default: connectDB } = await load('config/db.config.js');
await connectDB();
const { default: Tip } = await load('models/tip.model.js');
const { default: SymptomLog } = await load('models/symptomLog.model.js');
const { deleteUserData } = await load('services/userData.service.js');
await Promise.all(['periodRecord', 'userSettings', 'checklistItem', 'checklistLog', 'hydrationLog', 'reminder']
  .map((m) => load(`models/${m}.model.js`))); // registers every user-owned model for cleanup

const testTips = await Tip.insertMany([
  { category: 'food', title: 'ZZTEST Food Always', text: 'general food tip', showWhen: 'always', active: true, reviewedAt: new Date() },
  { category: 'activity', title: 'ZZTEST Activity Always', text: 'gentle activity tip', showWhen: 'always', active: true, reviewedAt: new Date() },
  { category: 'food', title: 'ZZTEST Food Period', text: 'period-only food tip', showWhen: 'period', active: true, reviewedAt: new Date() },
  { category: 'activity', title: 'ZZTEST Inactive', text: 'inactive', showWhen: 'always', active: false, reviewedAt: new Date() },
  { category: 'food', title: 'ZZTEST Unreviewed', text: 'unreviewed', showWhen: 'always', active: true, reviewedAt: null },
]);

try {
  // =============================================================== public content
  let r = await call('GET', '/content', null, null);
  check('public content: 200 without a token', r.status === 200 && r.json.data.featureEnabled === true, JSON.stringify(r.json));
  check('disclaimer says estimates are not guarantees', /estimate/i.test(r.json.data.disclaimerText) && /not a medical diagnosis/i.test(r.json.data.disclaimerText));
  check('privacy text present', r.json.data.privacyText.length > 20);
  r = await call('GET', u('/symptoms'), null, null);
  check('user routes still need a token', r.status === 401);

  // =============================================================== symptom log
  const full = { symptoms: ['cramps', 'headache', 'cramps'], flow: 'medium', mood: 'calm', energy: 'low', note: 'private symptom note' };
  r = await call('PUT', u(`/symptoms/${today}`), full);
  check('symptom log created (201), duplicates removed', r.status === 201 && r.json.data.log.symptoms.length === 2 && r.json.data.log.flow === 'medium', JSON.stringify(r.json));
  r = await call('PUT', u(`/symptoms/${today}`), full);
  check('same date again replaces it (200, not a duplicate)', r.status === 200);
  r = await call('GET', u(`/symptoms/${today}`));
  check('note round-trips decrypted', r.status === 200 && r.json.data.log.note === 'private symptom note' && r.json.data.log.mood === 'calm' && r.json.data.log.energy === 'low');
  const raw = await SymptomLog.collection.findOne({ user: SymptomLog.base.Types.ObjectId.createFromHexString(users.A), date: today });
  check('note is stored encrypted in the database, tagged with its key id (keyId:iv:tag:data)', typeof raw.note === 'string' && !/private symptom note/.test(raw.note) && raw.note.split(':').length === 4 && raw.note.startsWith(`${process.env.ENCRYPTION_KEY_ID || 'k1'}:`), String(raw?.note).slice(0, 40));

  r = await call('PUT', u(`/symptoms/${today}`), { mood: 'happy' });
  r = await call('GET', u(`/symptoms/${today}`));
  check('PUT replaces the whole entry (earlier symptoms cleared)', r.json.data.log.symptoms.length === 0 && r.json.data.log.flow === null && r.json.data.log.mood === 'happy' && r.json.data.log.note === null);

  r = await call('PUT', u(`/symptoms/${today}`), {});
  check('empty log rejected', r.status === 400);
  r = await call('PUT', u(`/symptoms/${today}`), { symptoms: ['PCOS'] });
  check('unknown symptom rejected (no diagnosis terms)', r.status === 400);
  r = await call('PUT', u(`/symptoms/${today}`), { flow: 'extreme' });
  check('invalid flow rejected', r.status === 400);
  r = await call('PUT', u(`/symptoms/${today}`), { mood: 'angry' });
  check('invalid mood rejected', r.status === 400);
  r = await call('PUT', u(`/symptoms/${today}`), { energy: 'huge' });
  check('invalid energy rejected', r.status === 400);
  r = await call('PUT', u(`/symptoms/${today}`), { note: 'x'.repeat(501) });
  check('note over 500 chars rejected', r.status === 400);
  r = await call('PUT', u(`/symptoms/${day(5)}`), { mood: 'calm' });
  check('future date rejected', r.status === 400);
  r = await call('PUT', u('/symptoms/2024-02-30'), { mood: 'calm' });
  check('impossible date rejected', r.status === 400);
  r = await call('GET', u(`/symptoms/${day(-40)}`));
  check('no log for a date -> 404', r.status === 404);

  await call('PUT', u(`/symptoms/${day(-1)}`), { flow: 'heavy' });
  await call('PUT', u(`/symptoms/${day(-2)}`), { flow: 'light', symptoms: ['bloating'] });
  r = await call('GET', u('/symptoms'));
  check('list newest first', r.status === 200 && r.json.data.total === 3 && r.json.data.items[0].date === today && r.json.data.items[2].date === day(-2), JSON.stringify(r.json).slice(0, 300));
  r = await call('GET', u(`/symptoms?from=${day(-2)}&to=${day(-1)}`));
  check('from/to filter', r.json.data.items.length === 2);
  r = await call('GET', u('/symptoms?limit=1&page=3'));
  check('pagination', r.json.data.items.length === 1 && r.json.data.items[0].date === day(-2));
  r = await call('GET', u('/symptoms?limit=500'));
  check('limit over 100 rejected', r.status === 400);

  r = await call('GET', u(`/symptoms/${today}`), null, 'B');
  check('isolation: user B cannot read A\'s log', r.status === 404);
  r = await call('GET', u('/symptoms'), null, 'B');
  check('isolation: user B list is empty', r.json.data.total === 0);
  r = await call('DELETE', u(`/symptoms/${today}`), null, 'B');
  check('isolation: user B cannot delete A\'s log', r.status === 404);

  r = await call('DELETE', u(`/symptoms/${day(-1)}`));
  check('delete log (soft)', r.status === 200);
  r = await call('GET', u(`/symptoms/${day(-1)}`));
  check('deleted log is gone', r.status === 404);
  r = await call('DELETE', u(`/symptoms/${day(-1)}`));
  check('delete twice -> 404', r.status === 404);
  r = await call('PUT', u(`/symptoms/${day(-1)}`), { flow: 'light' });
  check('a deleted date can be logged again (201)', r.status === 201);

  // =============================================================== checklist
  r = await call('GET', u('/checklist/items'));
  const items = r.json.data.items;
  check('first use: copies the 4 admin default items', r.status === 200 && items.length === 4 && items.some((i) => i.label === 'Take a rest break'), JSON.stringify(r.json));
  r = await call('GET', u('/checklist/items'));
  check('defaults are not copied twice', r.json.data.items.length === 4);
  r = await call('GET', u('/checklist'));
  check('today: 0 of 4 done', r.status === 200 && r.json.data.date === today && r.json.data.progress.done === 0 && r.json.data.progress.total === 4);

  r = await call('PUT', u(`/checklist/${today}/items/${items[0].id}`), { completed: true });
  check('mark an item done', r.status === 200 && r.json.data.completed === true);
  r = await call('GET', u('/checklist'));
  check('progress 1 of 4', r.json.data.progress.done === 1 && r.json.data.items.find((i) => i.id === items[0].id).completed === true);
  await call('PUT', u(`/checklist/${today}/items/${items[0].id}`), { completed: true });
  r = await call('GET', u('/checklist'));
  check('marking done twice does not duplicate', r.json.data.progress.done === 1);
  await call('PUT', u(`/checklist/${today}/items/${items[0].id}`), { completed: false });
  r = await call('GET', u('/checklist'));
  check('un-tick works', r.json.data.progress.done === 0);

  // a new day starts fresh while the past is kept
  await call('PUT', u(`/checklist/${day(-1)}/items/${items[1].id}`), { completed: true });
  await call('PUT', u(`/checklist/${today}/items/${items[2].id}`), { completed: true });
  r = await call('GET', u(`/checklist?date=${day(-1)}`));
  check('yesterday keeps its own completion', r.json.data.progress.done === 1 && r.json.data.items.find((i) => i.id === items[1].id).completed === true);
  r = await call('GET', u('/checklist'));
  check('today starts fresh (yesterday\'s item not ticked)', r.json.data.items.find((i) => i.id === items[1].id).completed === false && r.json.data.progress.done === 1);
  r = await call('GET', u(`/checklist/history?from=${day(-7)}&to=${today}`));
  check('history lists completed items by date, newest first', r.status === 200 && r.json.data.days.length === 2 && r.json.data.days[0].date === today && r.json.data.days[1].completed[0].label === items[1].label, JSON.stringify(r.json));

  // editable items
  r = await call('POST', u('/checklist/items'), { label: 'Stretch for 5 minutes' });
  const added = r.json.data?.item;
  check('add a custom item', r.status === 201 && added.label === 'Stretch for 5 minutes', JSON.stringify(r.json));
  r = await call('PATCH', u(`/checklist/items/${added.id}`), { label: 'Light stretching' });
  check('rename an item', r.status === 200 && r.json.data.item.label === 'Light stretching');
  r = await call('PATCH', u(`/checklist/items/${added.id}`), {});
  check('empty edit rejected', r.status === 400);
  r = await call('POST', u('/checklist/items'), { label: '' });
  check('blank label rejected', r.status === 400);
  r = await call('POST', u('/checklist/items'), { label: 'y'.repeat(81) });
  check('label over 80 chars rejected', r.status === 400);
  await call('PUT', u(`/checklist/${today}/items/${added.id}`), { completed: true });
  r = await call('DELETE', u(`/checklist/items/${added.id}`));
  check('remove an item', r.status === 200);
  r = await call('GET', u('/checklist/items'));
  check('removed item no longer in the list', r.json.data.items.length === 4 && !r.json.data.items.some((i) => i.id === added.id));
  r = await call('GET', u('/checklist'));
  check('a removed item still shows on a day it was completed', r.json.data.items.some((i) => i.id === added.id && i.completed === true));
  r = await call('GET', u(`/checklist?date=${day(-3)}`));
  check('a removed item does not show on other days', !r.json.data.items.some((i) => i.id === added.id));
  r = await call('PUT', u(`/checklist/${today}/items/${added.id}`), { completed: true });
  check('cannot tick a removed item (404)', r.status === 404);

  r = await call('PUT', u(`/checklist/${today}/items/${items[0].id}`), { completed: 'yes' });
  check('completed must be a boolean', r.status === 400);
  r = await call('PUT', u(`/checklist/${today}/items/not-an-id`), { completed: true });
  check('bad item id rejected', r.status === 400);
  r = await call('PUT', u(`/checklist/${today}/items/${hex()}`), { completed: true });
  check('unknown item 404', r.status === 404);
  r = await call('PUT', u(`/checklist/${day(5)}/items/${items[0].id}`), { completed: true });
  check('future date rejected', r.status === 400);
  r = await call('GET', u(`/checklist/history?from=${day(-200)}&to=${today}`));
  check('history range over 92 days rejected', r.status === 400);
  r = await call('GET', u(`/checklist/history?from=${today}&to=${day(-3)}`));
  check('history to before from rejected', r.status === 400);

  r = await call('GET', u('/checklist/items'), null, 'B');
  check('isolation: user B gets their own copies (different ids)', r.json.data.items.length === 4 && !r.json.data.items.some((i) => items.some((a) => a.id === i.id)));
  r = await call('PUT', u(`/checklist/${today}/items/${items[0].id}`), { completed: true }, 'B');
  check('isolation: user B cannot tick A\'s item', r.status === 404);
  r = await call('GET', u('/checklist'), null, 'B');
  check('isolation: B sees none of A\'s ticks', r.json.data.progress.done === 0);

  for (let i = 0; i < 26; i += 1) await call('POST', u('/checklist/items'), { label: `Extra ${i}` });
  r = await call('POST', u('/checklist/items'), { label: 'One too many' });
  check('checklist is capped at 30 items', r.status === 400, JSON.stringify(r.json));

  // =============================================================== reminders + hydration
  r = await call('GET', u('/reminders'));
  const byType = Object.fromEntries(r.json.data.reminders.map((x) => [x.type, x]));
  check('defaults: all three reminders exist and are off', r.status === 200 && ['period', 'daily_log', 'hydration'].every((t) => byType[t].enabled === false && byType[t].status === 'disabled'), JSON.stringify(r.json));
  check('default values', byType.period.leadDays === 2 && byType.period.timeOfDay === '09:00' && byType.daily_log.timeOfDay === '20:00' && byType.hydration.times.length === 0);

  r = await call('GET', u('/hydration'));
  check('hydration: no times chosen yet', r.status === 200 && r.json.data.reminders.length === 0);
  r = await call('PATCH', u('/reminders/hydration'), { enabled: true });
  check('cannot enable hydration without times', r.status === 400);
  r = await call('PATCH', u('/reminders/hydration'), { times: ['25:00'] });
  check('invalid time rejected', r.status === 400);
  r = await call('PATCH', u('/reminders/hydration'), { times: ['10:00', '15:00', '10:00', '12:00'], enabled: true });
  check('hydration times saved sorted and unique', r.status === 200 && JSON.stringify(r.json.data.reminder.times) === JSON.stringify(['10:00', '12:00', '15:00']) && r.json.data.reminder.status === 'active', JSON.stringify(r.json));
  r = await call('PATCH', u('/reminders/hydration'), { leadDays: 2 });
  check('period-only setting rejected on hydration', r.status === 400);
  r = await call('PATCH', u('/reminders/hydration'), { timeOfDay: '10:00' });
  check('timeOfDay rejected on hydration', r.status === 400);
  r = await call('PATCH', u('/reminders/period'), { times: ['10:00'] });
  check('times rejected on period reminder', r.status === 400);
  r = await call('PATCH', u('/reminders/period'), { leadDays: 9 });
  check('leadDays over 7 rejected', r.status === 400);
  r = await call('PATCH', u('/reminders/nonsense'), { enabled: true });
  check('unknown reminder type rejected', r.status === 400);
  r = await call('PATCH', u('/reminders/period'), {});
  check('empty reminder update rejected', r.status === 400);
  r = await call('PATCH', u('/reminders/daily_log'), { snoozeDays: 40 });
  check('snoozeDays over 30 rejected', r.status === 400);

  r = await call('GET', u('/hydration'));
  check('hydration screen lists each chosen time, none done', r.json.data.reminders.length === 3 && r.json.data.reminders.every((x) => x.done === false) && !JSON.stringify(r.json).match(/ml|litre|glass/i));
  r = await call('PUT', u(`/hydration/${today}/10:00`), { done: true });
  check('mark a hydration reminder done', r.status === 200 && r.json.data.done === true);
  r = await call('GET', u('/hydration'));
  check('hydration done flag saved', r.json.data.reminders.find((x) => x.time === '10:00').done === true && r.json.data.reminders.find((x) => x.time === '12:00').done === false);
  r = await call('PUT', u(`/hydration/${today}/11:00`), { done: true });
  check('cannot mark a time that is not a reminder', r.status === 400);
  r = await call('PUT', u(`/hydration/${today}/99:99`), { done: true });
  check('bad time format rejected', r.status === 400);
  r = await call('PUT', u(`/hydration/${today}/10:00`), { done: 'sure' });
  check('done must be boolean', r.status === 400);

  // schedule
  r = await call('PATCH', u('/reminders/period'), { enabled: true, leadDays: 3, timeOfDay: '08:30' });
  check('period reminder enabled', r.status === 200 && r.json.data.reminder.leadDays === 3 && r.json.data.reminder.timeOfDay === '08:30' && r.json.data.reminder.status === 'active');
  await call('PATCH', u('/reminders/daily_log'), { enabled: true });
  r = await call('GET', u('/reminders/schedule?days=30'));
  let n = r.json.data.notifications;
  check('schedule: no period history -> no period notification', r.status === 200 && !n.some((x) => x.type === 'period') && r.json.data.estimated === true);
  check('schedule: daily log every day for 30 days', n.filter((x) => x.type === 'daily_log').length === 30 && n.filter((x) => x.type === 'hydration').length === 90);
  check('schedule sorted by date then time', n.every((x, i) => i === 0 || `${n[i - 1].date} ${n[i - 1].time}` <= `${x.date} ${x.time}`));

  const add = (s, k) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  r = await call('POST', u('/periods'), { startDate: day(-5), endDate: day(-1) });
  const periodId = r.json.data?.period?.id;
  r = await call('GET', u('/reminders/schedule?days=30'));
  let p = r.json.data.notifications.filter((x) => x.type === 'period');
  check('period reminder appears lead-days before the estimate (28-day default)', p.length === 1 && p[0].date === add(day(-5), 28 - 3) && p[0].time === '08:30', JSON.stringify(p));
  check('period reminder text says estimated and the lead time', /estimated/.test(p[0].text) && /3 days/.test(p[0].text));

  r = await call('PATCH', u(`/periods/${periodId}`), { startDate: day(-10), endDate: day(-6) });
  r = await call('GET', u('/reminders/schedule?days=30'));
  p = r.json.data.notifications.filter((x) => x.type === 'period');
  check('editing a period moves the reminder (nothing stale)', p.length === 1 && p[0].date === add(day(-10), 28 - 3), JSON.stringify(p));
  r = await call('DELETE', u(`/periods/${periodId}`));
  r = await call('GET', u('/reminders/schedule?days=30'));
  check('deleting the period removes the reminder', !r.json.data.notifications.some((x) => x.type === 'period'));

  r = await call('PATCH', u('/reminders/daily_log'), { paused: true });
  check('pause -> status paused', r.json.data.reminder.status === 'paused');
  r = await call('GET', u('/reminders/schedule?days=5'));
  check('paused reminders are not scheduled', !r.json.data.notifications.some((x) => x.type === 'daily_log'));
  r = await call('PATCH', u('/reminders/daily_log'), { paused: false, snoozeDays: 2 });
  check('snooze 2 days -> status snoozed until tomorrow', r.json.data.reminder.status === 'snoozed' && r.json.data.reminder.snoozedUntil === day(1), JSON.stringify(r.json.data.reminder));
  r = await call('GET', u('/reminders/schedule?days=5'));
  const dl = r.json.data.notifications.filter((x) => x.type === 'daily_log').map((x) => x.date);
  check('snoozed days skipped, then reminders resume', dl[0] === day(2) && dl.length === 3, JSON.stringify(dl));
  r = await call('PATCH', u('/reminders/daily_log'), { snoozeDays: 0 });
  check('snoozeDays 0 cancels the snooze', r.json.data.reminder.status === 'active' && r.json.data.reminder.snoozedUntil === null);
  r = await call('PATCH', u('/reminders/hydration'), { enabled: false });
  check('disable -> status disabled', r.json.data.reminder.status === 'disabled');
  r = await call('GET', u('/reminders/schedule?days=5'));
  check('disabled reminders are not scheduled', !r.json.data.notifications.some((x) => x.type === 'hydration'));
  r = await call('GET', u('/reminders/schedule?days=91'));
  check('schedule horizon over 90 days rejected', r.status === 400);
  r = await call('GET', u('/reminders/schedule?days=0'));
  check('schedule days 0 rejected', r.status === 400);
  r = await call('GET', u('/reminders'), null, 'B');
  check('isolation: user B reminders are untouched defaults', r.json.data.reminders.every((x) => x.enabled === false));

  // =============================================================== tips and self-care
  r = await call('GET', u('/tips'), null, 'D');
  let titles = r.json.data.tips.map((t) => t.title);
  check('not in a period: only the always-tips', r.status === 200 && r.json.data.inPeriod === false && titles.includes('ZZTEST Food Always') && titles.includes('ZZTEST Activity Always') && !titles.includes('ZZTEST Food Period'), JSON.stringify(titles));
  check('inactive and unreviewed tips are never shown', !titles.includes('ZZTEST Inactive') && !titles.includes('ZZTEST Unreviewed'));
  check('activity tips are optional and skippable; food tips are not flagged', r.json.data.tips.find((t) => t.category === 'activity').canSkip === true && r.json.data.tips.find((t) => t.category === 'food').canSkip === undefined);
  check('seeded placeholder tips stay hidden until reviewed', !titles.some((t) => ['Balanced meals', 'Light walking', 'Iron-containing foods', 'Comfortable stretching'].includes(t)));

  r = await call('POST', u('/periods'), { startDate: day(-1) }, 'E');
  check('user E logs a period that started yesterday (no end yet)', r.status === 201);
  r = await call('GET', u('/tips'), null, 'E');
  titles = r.json.data.tips.map((t) => t.title);
  check('in a period: period tips are added', r.json.data.inPeriod === true && titles.includes('ZZTEST Food Period') && titles.includes('ZZTEST Food Always'), JSON.stringify(titles));
  r = await call('GET', u('/tips?category=activity'), null, 'E');
  check('category filter', r.json.data.tips.length > 0 && r.json.data.tips.every((t) => t.category === 'activity'));
  r = await call('GET', u('/tips?category=medicine'), null, 'E');
  check('invalid category rejected', r.status === 400);

  r = await call('GET', u('/selfcare/today'), null, 'E');
  const sc = r.json.data;
  check('self-care screen: one call returns checklist, hydration and tips', r.status === 200 && sc.date === today && sc.checklist.items.length === 4 && Array.isArray(sc.hydration) && sc.tips.length >= 3, JSON.stringify(r.json).slice(0, 300));
  check('self-care screen is period-aware', sc.inPeriod === true && sc.tips.some((t) => t.title === 'ZZTEST Food Period'));
  r = await call('GET', u('/selfcare/today'), null, 'D');
  check('self-care screen: not in a period -> no period tips', r.json.data.inPeriod === false && !r.json.data.tips.some((t) => t.title === 'ZZTEST Food Period'));
  r = await call('GET', u(`/selfcare/today?date=${day(-1)}`), null, 'D');
  check('self-care screen accepts the client\'s local date', r.status === 200 && r.json.data.date === day(-1));
  r = await call('GET', u('/selfcare/today?date=nope'), null, 'D');
  check('bad date rejected', r.status === 400);
} catch (err) {
  fail += 1;
  console.log('FAIL  script crashed:', err.message);
} finally {
  // ---- cleanup: temporary tips and every test user's data
  await Tip.deleteMany({ title: /^ZZTEST/ });
  for (const id of Object.values(users)) await deleteUserData(id);
  const remaining = await Promise.all(
    ['symptomLog', 'checklistItem', 'checklistLog', 'hydrationLog', 'reminder', 'periodRecord', 'userSettings']
      .map(async (m) => (await load(`models/${m}.model.js`)).default.countDocuments({ user: { $in: Object.values(users) } }))
  );
  console.log(`\ncleanup: test tips removed, leftover test rows = ${remaining.reduce((a, b) => a + b, 0)}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
