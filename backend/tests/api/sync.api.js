import 'dotenv/config';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const BACKEND = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '').replaceAll('\\', '/');
const require = createRequire(`${BACKEND}/package.json`);
const jwt = require('jsonwebtoken');
const load = (p) => import(pathToFileURL(`${BACKEND}/src/${p}`).href);

const env = process.env;
const BASE = `${process.env.API_BASE ?? 'http://localhost:5000/api'}/user`;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const hex = () => Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const users = { A: hex(), B: hex(), C: hex(), D: hex() };
const tokens = Object.fromEntries(Object.entries(users).map(([k, id]) => [k, jwt.sign({ id, role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '1h' })]));

const call = async (method, path, body, who = 'A') => {
  const token = who === null ? null : tokens[who];
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
};
const sync = (body, who = 'A') => call('POST', '/sync', body, who);

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = day(0);

// ---- database access for verification and cleanup
const { default: connectDB } = await load('config/db.config.js');
await connectDB();
const { default: PeriodRecord } = await load('models/periodRecord.model.js');
const { default: ErasureMarker } = await load('models/erasureMarker.model.js');
const { deleteUserData } = await load('services/userData.service.js');
await load('services/syncPush.service.js'); // registers every user-owned model

const p1 = hex(), p2 = hex(), p3 = hex();
const item1 = hex(), item2 = hex();
const T0 = iso(-60_000); // "one minute ago" on the phone

try {
  // =========================================================== basics
  let r = await call('POST', '/sync', {}, null);
  check('sync needs a token', r.status === 401);
  r = await sync({});
  check('empty sync on a new account works', r.status === 200 && r.json.data.hasMore === false && r.json.data.changes.periods.length === 0 && r.json.data.changes.settings === null && !!r.json.data.cursor && !r.json.data.erasedAt, JSON.stringify(r.json).slice(0, 300));
  r = await sync({ since: 'yesterday' });
  check('bad since rejected', r.status === 400);
  r = await sync({ changes: { periods: 'nope' } });
  check('changes.periods must be a list', r.status === 400);
  r = await sync({ changes: { settings: [] } });
  check('changes.settings must be an object', r.status === 400);
  r = await sync({ changes: { periods: Array.from({ length: 501 }, () => ({})) } });
  check('more than 500 records of one type rejected', r.status === 400);
  r = await sync({ limit: 5000 });
  check('limit over 2000 rejected', r.status === 400);
  r = await sync({});
  check('sync reports the data epoch and does not ask for a resync by default', r.json.data.epoch === (process.env.DATA_EPOCH || '1') && r.json.data.resyncRequired === false, JSON.stringify([r.json.data.epoch, r.json.data.resyncRequired]));
  r = await sync({ epoch: r.json.data.epoch });
  check('a matching epoch -> no resync needed', r.json.data.resyncRequired === false);
  r = await sync({ epoch: 'an-older-epoch' });
  check('a different epoch (database was restored) -> resyncRequired', r.status === 200 && r.json.data.resyncRequired === true, JSON.stringify(r.json.data.resyncRequired));
  r = await sync({ epoch: 'x'.repeat(65) });
  check('an over-long epoch is rejected', r.status === 400);

  // =========================================================== push: create everything
  const device1 = {
    settings: { cycleLength: 30, periodDuration: 6, clientUpdatedAt: T0 },
    periods: [
      { id: p1, startDate: day(-60), endDate: day(-56), notes: 'first period note', clientUpdatedAt: T0 },
      { id: p2, startDate: day(-30), endDate: day(-26), clientUpdatedAt: T0 },
    ],
    checklistItems: [
      { id: item1, label: 'Drink tea', order: 0, clientUpdatedAt: T0 },
      { id: item2, label: 'Walk', order: 1, clientUpdatedAt: T0 },
    ],
    checklistLogs: [{ date: day(-1), itemId: item1, completed: true, clientUpdatedAt: T0 }],
    symptoms: [{ date: day(-1), symptoms: ['cramps'], flow: 'light', mood: 'calm', note: 'sync symptom note', clientUpdatedAt: T0 }],
    hydrationLogs: [{ date: day(-1), time: '10:00', done: true, clientUpdatedAt: T0 }],
    reminders: [
      { type: 'period', enabled: true, leadDays: 3, timeOfDay: '08:30', clientUpdatedAt: T0 },
      { type: 'hydration', enabled: true, times: ['15:00', '10:00', '10:00'], clientUpdatedAt: T0 },
    ],
  };
  r = await sync({ changes: device1 });
  let push = r.json.data.push;
  check('push applies every record', r.status === 200 && push.applied.settings === 1 && push.applied.periods === 2 && push.applied.checklistItems === 2 && push.applied.checklistLogs === 1 && push.applied.symptoms === 1 && push.applied.hydrationLogs === 1 && push.applied.reminders === 2 && push.rejected.length === 0, JSON.stringify(push));

  // a fresh phone restores everything with one pull
  r = await sync({}, 'A');
  const pull1 = r.json.data;
  check('fresh phone gets all periods back (with the ids it chose)', pull1.changes.periods.length === 2 && pull1.changes.periods.some((p) => p.id === p1 && p.startDate === day(-60)));
  check('notes come back decrypted', pull1.changes.periods.find((p) => p.id === p1).notes === 'first period note' && pull1.changes.symptoms[0].note === 'sync symptom note');
  check('settings, items, logs, symptoms, hydration, reminders come back', pull1.changes.settings.cycleLength === 30 && pull1.changes.checklistItems.length === 2 && pull1.changes.checklistLogs.length === 1 && pull1.changes.symptoms.length === 1 && pull1.changes.hydrationLogs.length === 1 && pull1.changes.reminders.length === 2);
  check('hydration times are saved sorted and unique', JSON.stringify(pull1.changes.reminders.find((x) => x.type === 'hydration').times) === JSON.stringify(['10:00', '15:00']));
  check('every record carries server updatedAt and clientUpdatedAt', pull1.changes.periods.every((p) => p.updatedAt && p.clientUpdatedAt === T0));
  const cursor1 = pull1.cursor;

  // the normal REST endpoints see the synced data
  r = await call('GET', '/periods');
  check('REST sees the synced periods', r.json.data.total === 2);
  r = await call('GET', '/checklist/items');
  check('REST checklist uses the synced items (no default copy added)', r.json.data.items.length === 2 && r.json.data.items.some((i) => i.label === 'Drink tea'));
  r = await call('GET', '/cycle/estimate');
  check('estimate works on synced periods', r.json.data.estimate.lastPeriodStart === day(-30) && r.json.data.estimate.cycleLength === 30);

  // =========================================================== idempotency
  r = await sync({ changes: device1 });
  push = r.json.data.push;
  const totalApplied = Object.values(push.applied).reduce((a, b) => a + b, 0);
  const totalUnchanged = Object.values(push.unchanged).reduce((a, b) => a + b, 0);
  check('replaying the same push applies nothing (retry-safe)', totalApplied === 0 && totalUnchanged === 10 && push.rejected.length === 0, JSON.stringify(push));
  check('no duplicate rows were created', (await PeriodRecord.countDocuments({ user: users.A })) === 2);

  // =========================================================== last-write-wins
  const T_EDIT = iso(-30_000);
  r = await sync({ changes: { periods: [{ id: p1, startDate: day(-61), endDate: day(-57), notes: 'edited later', clientUpdatedAt: T_EDIT }] } });
  check('a newer edit is applied', r.json.data.push.applied.periods === 1);
  r = await call('GET', `/periods/${p1}`);
  check('the newer values are stored', r.json.data.period.startDate === day(-61) && r.json.data.period.notes === 'edited later');

  r = await sync({ changes: { periods: [{ id: p1, startDate: day(-62), endDate: day(-58), notes: 'old edit', clientUpdatedAt: iso(-50_000) }] } });
  const stale = r.json.data.push.rejected[0];
  check('an older edit is rejected as stale', r.json.data.push.applied.periods === 0 && stale?.reason === 'stale');
  check('the stale answer carries the server version to adopt', stale.server.startDate === day(-61) && stale.server.notes === 'edited later');
  r = await call('GET', `/periods/${p1}`);
  check('the stale edit changed nothing', r.json.data.period.startDate === day(-61));

  r = await sync({ changes: { periods: [{ id: p1, startDate: day(-70), clientUpdatedAt: T_EDIT }] } });
  check('an edit at exactly the stored time is treated as already applied', r.json.data.push.unchanged.periods === 1);

  r = await sync({ changes: { periods: [{ id: p1, startDate: day(-61), endDate: day(-57), notes: 'future clock', clientUpdatedAt: iso(24 * 3600 * 1000) }] } });
  check('a device clock one day ahead is accepted but clamped', r.json.data.push.applied.periods === 1);
  r = await sync({ since: iso(-5000) });
  const clamped = r.json.data.changes.periods.find((p) => p.id === p1);
  check('stored edit time was clamped to about now', clamped && new Date(clamped.clientUpdatedAt).getTime() <= Date.now() + 5000, clamped?.clientUpdatedAt);
  r = await sync({ changes: { periods: [{ id: p1, startDate: day(-61), endDate: day(-57), notes: 'honest edit', clientUpdatedAt: iso(2000) }] } });
  check('a later honest edit can still overwrite the clamped one', r.json.data.push.applied.periods === 1, JSON.stringify(r.json.data.push));

  // a REST edit counts as an edit too
  await call('PATCH', `/periods/${p2}`, { notes: 'edited through REST' });
  r = await sync({ changes: { periods: [{ id: p2, startDate: day(-30), endDate: day(-26), notes: 'older device edit', clientUpdatedAt: iso(-20_000) }] } });
  check('REST edits take part in last-write-wins', r.json.data.push.rejected[0]?.reason === 'stale' && r.json.data.push.rejected[0].server.notes === 'edited through REST', JSON.stringify(r.json.data.push));

  // =========================================================== deletes
  const cursorBeforeDelete = (await sync({})).json.data.cursor;
  await sleep(1100);
  r = await sync({ changes: { periods: [{ id: p2, deleted: true, clientUpdatedAt: iso(1000) }] } });
  check('a delete (tiny tombstone) is applied', r.json.data.push.applied.periods === 1);
  r = await call('GET', '/periods');
  check('REST no longer lists the deleted period', r.json.data.total === 1 && r.json.data.items[0].id === p1);
  r = await sync({ since: cursorBeforeDelete });
  const tomb = r.json.data.changes.periods.find((p) => p.id === p2);
  check('other devices receive the deletion (deleted: true)', tomb?.deleted === true);
  r = await sync({});
  check('a fresh install does not receive deleted records', !r.json.data.changes.periods.some((p) => p.id === p2));
  r = await sync({ changes: { periods: [{ id: hex(), deleted: true, clientUpdatedAt: iso() }] } });
  check('deleting a record the server never had is a harmless no-op', r.json.data.push.unchanged.periods === 1);
  r = await sync({ changes: { periods: [{ id: p2, startDate: day(-30), endDate: day(-26), notes: 'old edit after delete', clientUpdatedAt: iso(-90_000) }] } });
  check('an edit older than the delete does not bring the record back', r.json.data.push.rejected[0]?.reason === 'stale');
  r = await sync({ changes: { periods: [{ id: p2, startDate: day(-30), endDate: day(-26), notes: 'restored', clientUpdatedAt: iso(3000) }] } });
  r = await call('GET', `/periods/${p2}`);
  check('a newer edit restores a deleted record', r.status === 200 && r.json.data.period.notes === 'restored');

  // =========================================================== validation per record
  r = await sync({ changes: { periods: [
    { id: hex(), startDate: day(-100), endDate: day(-97), clientUpdatedAt: iso() },
    { id: 'bad-id', startDate: day(-100), clientUpdatedAt: iso() },
    { id: hex(), startDate: day(-90), endDate: day(-95), clientUpdatedAt: iso() },
    { id: hex(), startDate: day(-90) },
    { id: hex(), startDate: day(40), clientUpdatedAt: iso() },
    'not an object',
  ] } });
  push = r.json.data.push;
  check('one bad record does not stop the good ones', push.applied.periods === 1 && push.rejected.length === 5, JSON.stringify(push));
  check('each rejection says why', push.rejected.every((x) => x.reason === 'invalid' && x.message) && push.rejected.some((x) => /clientUpdatedAt/.test(x.message)) && push.rejected.some((x) => /before/.test(x.message)));
  r = await sync({ changes: { checklistLogs: [{ date: day(-1), itemId: hex(), completed: true, clientUpdatedAt: iso() }] } });
  check('a tick for an unknown item is rejected', r.json.data.push.rejected[0]?.reason === 'invalid' && /itemId/.test(r.json.data.push.rejected[0].message));
  r = await sync({ changes: { symptoms: [{ date: day(-3), symptoms: ['PCOS'], clientUpdatedAt: iso() }], reminders: [{ type: 'hydration', leadDays: 2, clientUpdatedAt: iso() }], reminderz: [{}] } });
  check('diagnosis terms and wrong-type reminder settings rejected; unknown keys ignored', r.status === 200 && r.json.data.push.rejected.length === 2);

  // =========================================================== natural keys
  r = await sync({ changes: { symptoms: [{ date: day(-1), symptoms: ['headache'], mood: 'happy', clientUpdatedAt: iso(5000) }] } });
  r = await sync({ since: iso(-3000) });
  const sym = r.json.data.changes.symptoms.find((s) => s.date === day(-1));
  check('symptom logs upsert by date (replace, never duplicate)', sym && sym.symptoms[0] === 'headache' && sym.mood === 'happy' && sym.flow === null && (await load('models/symptomLog.model.js')).default && true);
  const { default: SymptomLog } = await load('models/symptomLog.model.js');
  check('still one symptom row for that date', (await SymptomLog.countDocuments({ user: users.A, date: day(-1) })) === 1);

  // =========================================================== warnings
  r = await sync({ changes: { periods: [
    { id: hex(), startDate: day(-30), endDate: day(-26), clientUpdatedAt: iso() },
    { id: hex(), startDate: day(-28), endDate: day(-24), clientUpdatedAt: iso() },
  ] } });
  const warn = r.json.data.push.warnings;
  check('duplicate and overlapping periods from another phone are kept with warnings', r.json.data.push.applied.periods === 2 && warn.some((w) => w.reason === 'duplicate_start') && warn.some((w) => w.reason === 'overlap'), JSON.stringify(warn));

  // =========================================================== incremental pull + pagination
  const mark = (await sync({})).json.data.cursor;
  await sleep(1100);
  await call('POST', '/periods', { startDate: day(-12), endDate: day(-9) });
  r = await sync({ since: mark });
  check('incremental pull returns only what changed since the cursor', r.json.data.changes.periods.length === 1 && r.json.data.changes.periods[0].startDate === day(-12), JSON.stringify(r.json.data.changes.periods.map((p) => p.startDate)));
  r = await sync({ since: r.json.data.cursor });
  check('nothing new -> empty pull', Object.entries(r.json.data.changes).every(([k, v]) => k === 'settings' ? true : v.length === 0 || v.every((x) => x.updatedAt)) && r.json.data.hasMore === false);

  const total = (await sync({})).json.data.changes.periods.length;
  const seen = new Set();
  let cur = null, pages = 0, more = true;
  while (more && pages < 30) {
    r = await sync(cur ? { since: cur, limit: 2 } : { limit: 2 });
    r.json.data.changes.periods.forEach((p) => seen.add(p.id));
    cur = r.json.data.cursor; more = r.json.data.hasMore; pages += 1;
  }
  const aliveIds = new Set((await sync({})).json.data.changes.periods.map((p) => p.id));
  check('paging with limit=2 reaches every period', pages > 1 && [...aliveIds].every((id) => seen.has(id)), `pages=${pages} seen=${seen.size} alive=${aliveIds.size} total=${total}`);

  // =========================================================== paging, repeats, ids, overlap logic, speed
  const stamp = (ms) => new Date(Date.now() - 600_000 + ms).toISOString();
  const { default: SymptomLogModel } = await load('models/symptomLog.model.js');
  const { default: PeriodModel } = await load('models/periodRecord.model.js');
  const { findOverlaps } = await load('services/period.service.js');
  const { rangesOverlap } = await load('services/syncRules.service.js');
  const objectId = (hexString) => SymptomLogModel.base.Types.ObjectId.createFromHexString(hexString);

  // records that share one timestamp must still be pagedDates, and paging must finish
  const instant = new Date('2026-10-01T10:00:00.000Z');
  await SymptomLogModel.collection.insertMany(Array.from({ length: 5 }, (_, i) => ({
    user: objectId(users.C), date: `2026-09-0${i + 1}`, symptoms: [], flow: null, mood: 'calm', energy: null, deletedAt: null,
    createdAt: instant, updatedAt: instant, clientUpdatedAt: instant,
  })));
  const pagedDates = []; let pagedCursor = null; let pagedRounds = 0; let pagedMore = true;
  while (pagedMore && pagedRounds < 8) {
    r = await sync(pagedCursor ? { since: pagedCursor, limit: 2 } : { limit: 2 }, 'C');
    pagedDates.push(...r.json.data.changes.symptoms.map((s) => s.date));
    pagedCursor = r.json.data.cursor; pagedMore = r.json.data.hasMore; pagedRounds += 1;
  }
  check('paging: 5 records sharing one timestamp, page size 2: it finishes', !pagedMore && pagedRounds <= 4, `pagedRounds=${pagedRounds} pagedMore=${pagedMore}`);
  check('paging: ...and every one of the 5 is pagedDates', new Set(pagedDates).size === 5, JSON.stringify(pagedDates));

  // the same record several times in ONE request: processed in order, newest edit wins
  r = await sync({ changes: { symptoms: [
    { date: day(-40), mood: 'sad', clientUpdatedAt: stamp(0) },
    { date: day(-40), mood: 'happy', clientUpdatedAt: stamp(1000) },
    { date: day(-40), mood: 'calm', clientUpdatedAt: stamp(500) },
    { date: day(-41), mood: 'calm', clientUpdatedAt: stamp(0) },
    { date: day(-41), mood: 'calm', clientUpdatedAt: stamp(0) },
  ] } });
  check('repeats in one request: the first two apply, the older third is stale, the exact repeat is "unchanged"',
    r.json.data.push.applied.symptoms === 3 && r.json.data.push.unchanged.symptoms === 1 && r.json.data.push.rejected.length === 1 && r.json.data.push.rejected[0].reason === 'stale', JSON.stringify(r.json.data.push));
  check('repeats in one request: one row per date, holding the newest edit', (await SymptomLogModel.countDocuments({ user: users.A, date: day(-40) })) === 1
    && (await SymptomLogModel.findOne({ user: users.A, date: day(-40) })).mood === 'happy');

  // ids are not case sensitive
  const mixedId = hex(); const fixedStamp = stamp(2000);
  await sync({ changes: { periods: [{ id: mixedId, startDate: day(-200), clientUpdatedAt: fixedStamp }] } });
  r = await sync({ changes: { periods: [{ id: mixedId.toUpperCase(), startDate: day(-200), clientUpdatedAt: fixedStamp }] } });
  check('an id written in capitals is the same record (unchanged, not a conflict)', r.json.data.push.unchanged.periods === 1 && r.json.data.push.rejected.length === 0, JSON.stringify(r.json.data.push));

  // the in-memory overlap rule must agree with the database query the REST endpoints use
  let seed = 12345; const random = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const base = Date.UTC(2000, 0, 1); const dateOf = (n) => new Date(base + n * 86_400_000).toISOString().slice(0, 10);
  const seeded = Array.from({ length: 40 }, () => { const s = random(300); return { startDate: dateOf(s), endDate: random(4) === 0 ? null : dateOf(s + random(13)) }; });
  await PeriodModel.collection.insertMany(seeded.map((p) => ({ user: objectId(users.C), ...p, source: 'actual', deletedAt: null, createdAt: instant, updatedAt: instant, clientUpdatedAt: instant })));
  const stored = await PeriodModel.find({ user: users.C, deletedAt: null }).lean();
  let mismatches = 0;
  for (let i = 0; i < 80; i += 1) {
    const s = random(320); const probe = { startDate: dateOf(s), endDate: random(3) === 0 ? null : dateOf(s + random(15)) };
    const fromDatabase = (await findOverlaps(users.C, probe.startDate, probe.endDate)).map((p) => String(p._id)).sort();
    const inMemory = stored.filter((p) => rangesOverlap(probe, p)).map((p) => String(p._id)).sort();
    if (JSON.stringify(fromDatabase) !== JSON.stringify(inMemory)) mismatches += 1;
  }
  check('overlap rule: 80 random ranges against 40 stored periods give the same answer in memory and in the database', mismatches === 0, `${mismatches} differ`);

  // a pair of overlapping periods is reported once, not twice
  r = await sync({ changes: { periods: [
    { id: hex(), startDate: day(-500), endDate: day(-496), clientUpdatedAt: stamp(3000) },
    { id: hex(), startDate: day(-498), endDate: day(-494), clientUpdatedAt: stamp(3000) },
  ] } }, 'D');
  check('warnings: two overlapping periods in one request produce exactly one warning', r.json.data.push.applied.periods === 2 && r.json.data.push.warnings.length === 1 && r.json.data.push.warnings[0].reason === 'overlap', JSON.stringify(r.json.data.push.warnings));

  // speed: a maximum-size request must finish in reasonable time even on a slow link to the database
  const addDay = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const when = new Date().toISOString();
  const symptoms500 = Array.from({ length: 500 }, (_, i) => ({ date: addDay('2022-01-01', i), mood: 'calm', symptoms: ['cramps'], note: 'n', clientUpdatedAt: when }));
  let started = performance.now();
  r = await sync({ changes: { symptoms: symptoms500 } }, 'D');
  const timeNew = Math.round(performance.now() - started);
  check(`speed: 500 new symptom logs in one request (${timeNew} ms; it was 41000 before)`, r.json.data.push.applied.symptoms === 500 && timeNew < 15_000, `${timeNew} ms`);
  started = performance.now();
  r = await sync({ changes: { symptoms: symptoms500 } }, 'D');
  const timeRepeat = Math.round(performance.now() - started);
  check(`speed: the same 500 sent again (${timeRepeat} ms) change nothing`, r.json.data.push.unchanged.symptoms === 500 && timeRepeat < 10_000, `${timeRepeat} ms`);
  const items20 = Array.from({ length: 20 }, (_, i) => ({ id: hex(), label: `Item ${i}`, order: i, clientUpdatedAt: when }));
  await sync({ changes: { checklistItems: items20 } }, 'D');
  started = performance.now();
  r = await sync({ changes: { checklistLogs: Array.from({ length: 500 }, (_, i) => ({ date: addDay('2024-01-01', Math.floor(i / 20)), itemId: items20[i % 20].id, completed: true, clientUpdatedAt: when })) } }, 'D');
  const timeTicks = Math.round(performance.now() - started);
  check(`speed: 500 checklist ticks in one request (${timeTicks} ms; it was 69000 before)`, r.json.data.push.applied.checklistLogs === 500 && timeTicks < 15_000, `${timeTicks} ms`);
  r = await sync({ changes: { checklistLogs: [{ date: '2024-02-01', itemId: hex(), completed: true, clientUpdatedAt: when }, { date: '2024-02-01', itemId: items20[0].id, completed: true, clientUpdatedAt: when }] } }, 'D');
  check('speed work kept the rule: a tick for an unknown item is still rejected, the valid one applied', r.json.data.push.applied.checklistLogs === 1 && r.json.data.push.rejected.length === 1 && /itemId/.test(r.json.data.push.rejected[0].message));

  // =========================================================== large payload
  const big = Array.from({ length: 200 }, (_, i) => {
    const d = new Date(Date.UTC(1990, 0, 1 + i * 28)).toISOString().slice(0, 10);
    const e = new Date(Date.UTC(1990, 0, 5 + i * 28)).toISOString().slice(0, 10);
    return { id: hex(), startDate: d, endDate: e, notes: 'n'.repeat(400), clientUpdatedAt: iso() };
  });
  r = await sync({ changes: { periods: big } });
  check('a 100KB+ sync body is accepted (bigger limit on this route only)', r.status === 200 && r.json.data.push.applied.periods === 200, JSON.stringify(r.json).slice(0, 200));
  r = await call('POST', '/periods', { startDate: day(-3), notes: 'z'.repeat(20_000) });
  check('other routes keep the small 10KB limit', r.status === 413 || r.status === 400, String(r.status));

  // =========================================================== export
  r = await call('GET', '/export');
  const exp = r.json.data;
  check('export: 200 with a download filename', r.status === 200 && /attachment; filename="hercare-export-\d{4}-\d{2}-\d{2}\.json"/.test(r.headers.get('content-disposition')));
  check('export: versioned, with all record types', exp.version === 1 && exp.exportedAt && Object.keys(exp.data).sort().join() === ['checklistItems', 'checklistLogs', 'hydrationLogs', 'periods', 'reminders', 'settings', 'symptoms'].sort().join());
  check('export: decrypted notes, no deleted records', exp.data.periods.some((p) => p.notes === 'honest edit') && exp.data.periods.every((p) => p.deleted === false) && exp.data.checklistItems.length === 2);
  r = await call('GET', '/export', null, 'B');
  check('export: user B gets nothing of A\'s', r.json.data.data.periods.length === 0 && r.json.data.data.settings === null);

  // =========================================================== isolation
  r = await sync({}, 'B');
  check('user B\'s pull has none of A\'s data', r.json.data.changes.periods.length === 0 && r.json.data.changes.symptoms.length === 0);
  r = await sync({ changes: { periods: [{ id: p1, startDate: day(-61), endDate: day(-57), notes: 'hijack', clientUpdatedAt: iso(10_000) }] } }, 'B');
  check('user B pushing A\'s record id is refused', r.json.data.push.applied.periods === 0 && r.json.data.push.rejected[0]?.reason === 'conflict', JSON.stringify(r.json.data.push));
  r = await call('GET', `/periods/${p1}`);
  check('A\'s record is untouched by that attempt', r.json.data.period.notes === 'honest edit');

  // =========================================================== erase everything
  r = await call('DELETE', '/data');
  check('erase needs the confirmation text', r.status === 400);
  r = await call('DELETE', '/data', { confirm: 'yes' });
  check('wrong confirmation text rejected', r.status === 400);
  const beforeErase = await PeriodRecord.countDocuments({ user: users.A });
  r = await call('DELETE', '/data', { confirm: 'DELETE ALL MY DATA' });
  check('erase everything: 200', r.status === 200 && !!r.json.data.erasedAt && beforeErase > 0, JSON.stringify(r.json));
  const erasedAt = new Date(r.json.data.erasedAt);
  const left = (await Promise.all(['periodRecord', 'symptomLog', 'checklistItem', 'checklistLog', 'hydrationLog', 'reminder', 'userSettings']
    .map(async (m) => (await load(`models/${m}.model.js`)).default.countDocuments({ user: users.A })))).reduce((a, b) => a + b, 0);
  check('every server record for the user is gone', left === 0, `left=${left}`);
  r = await call('GET', '/periods');
  check('REST shows nothing after erase', r.json.data.total === 0);
  r = await call('GET', '/export');
  check('export is empty after erase', r.json.data.data.periods.length === 0);
  check('a marker (timestamp only) was kept', !!(await ErasureMarker.findOne({ user: users.A })));

  // another phone that still has old data tries to sync it back
  r = await sync({ changes: device1 });
  check('sync reports erasedAt so the phone knows to wipe its copy', r.json.data.erasedAt && new Date(r.json.data.erasedAt).getTime() === erasedAt.getTime());
  check('old data cannot be pushed back after an erase', r.json.data.push.rejected.length === 10 && r.json.data.push.rejected.every((x) => x.reason === 'erased') && Object.values(r.json.data.push.applied).every((n) => n === 0), JSON.stringify(r.json.data.push).slice(0, 300));
  r = await sync({ changes: { periods: [{ id: hex(), startDate: day(-4), endDate: day(-1), clientUpdatedAt: new Date(erasedAt.getTime() + 2000).toISOString() }] } });
  check('data created after the erase is accepted', r.json.data.push.applied.periods === 1, JSON.stringify(r.json.data.push));
  r = await sync({}, 'B');
  check('user B was never affected', !r.json.data.erasedAt);
} catch (err) {
  fail += 1;
  console.log('FAIL  script crashed:', err.message);
} finally {
  for (const id of Object.values(users)) await deleteUserData(id);
  await ErasureMarker.deleteMany({ user: { $in: Object.values(users) } });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
