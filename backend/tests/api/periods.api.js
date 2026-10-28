import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const BASE = `${process.env.API_BASE ?? 'http://localhost:5000/api'}/user`;
const env = process.env;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const hex = () => Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const userA = hex(), userB = hex();
const tokenOf = (id) => jwt.sign({ id, role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '1h' });
const A = tokenOf(userA), B = tokenOf(userB);

const call = async (method, path, body, token = A) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayStr = day(0);
const monthOf = (s) => s.slice(0, 7);

// ---------- auth
let r = await call('GET', '/periods', null, null);
check('no token 401', r.status === 401);

// ---------- settings
r = await call('GET', '/settings');
check('default settings', r.status === 200 && r.json.data.settings.cycleLength === 28 && r.json.data.settings.periodDuration === 5 && r.json.data.settings.usingDefaults === true, JSON.stringify(r.json));
r = await call('PATCH', '/settings', { cycleLength: 70 });
check('cycleLength 70 rejected', r.status === 400);
r = await call('PATCH', '/settings', { periodDuration: 0 });
check('periodDuration 0 rejected', r.status === 400);
r = await call('PATCH', '/settings', {});
check('empty settings body rejected', r.status === 400);
r = await call('PATCH', '/settings', { cycleLength: 30 });
check('settings saved (30)', r.status === 200 && r.json.data.settings.cycleLength === 30 && r.json.data.settings.periodDuration === 5 && r.json.data.settings.usingDefaults === false, JSON.stringify(r.json));
r = await call('GET', '/settings', null, B);
check('other user still has defaults', r.json.data.settings.cycleLength === 28 && r.json.data.settings.usingDefaults === true);

// ---------- estimate with no data
r = await call('GET', '/cycle/estimate');
check('no data: status no_data, no next date', r.status === 200 && r.json.data.estimate.status === 'no_data' && r.json.data.estimate.nextEstimatedStart === null, JSON.stringify(r.json));

// ---------- period validation
r = await call('POST', '/periods', {});
check('missing startDate 400', r.status === 400);
r = await call('POST', '/periods', { startDate: '2024-02-30' });
check('impossible date 400', r.status === 400);
r = await call('POST', '/periods', { startDate: '01/02/2024' });
check('wrong date format 400', r.status === 400);
r = await call('POST', '/periods', { startDate: day(-10), endDate: day(-12) });
check('end before start 400', r.status === 400);
r = await call('POST', '/periods', { startDate: day(5) });
check('future start 400', r.status === 400);
r = await call('POST', '/periods', { startDate: day(-60), endDate: day(-30) });
check('period longer than 20 days 400', r.status === 400);
r = await call('POST', '/periods', { startDate: day(-10), notes: 'x'.repeat(501) });
check('notes over 500 chars 400', r.status === 400);

// ---------- create three regular cycles (28 days apart, 5 days long)
const starts = [day(-84), day(-56), day(-28)];
const ids = [];
for (const [i, s] of starts.entries()) {
  const endD = new Date(s + 'T00:00:00Z'); endD.setUTCDate(endD.getUTCDate() + 4);
  r = await call('POST', '/periods', { startDate: s, endDate: endD.toISOString().slice(0, 10), notes: i === 0 ? 'private note one' : undefined });
  check(`create period ${i + 1}: 201, 5 days`, r.status === 201 && r.json.data.period.durationDays === 5, JSON.stringify(r.json));
  ids.push(r.json.data?.period?.id);
}
check('notes round-trip (decrypted)', (await call('GET', `/periods/${ids[0]}`)).json.data.period.notes === 'private note one');

// ---------- duplicate and overlap
r = await call('POST', '/periods', { startDate: starts[1] });
check('duplicate start date 409 DUPLICATE_PERIOD', r.status === 409 && r.json.error.code === 'DUPLICATE_PERIOD', JSON.stringify(r.json));
r = await call('POST', '/periods', { startDate: starts[1], confirmOverlap: true });
check('duplicate cannot be confirmed away', r.status === 409 && r.json.error.code === 'DUPLICATE_PERIOD');
const inside = (() => { const d = new Date(starts[1] + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })();
r = await call('POST', '/periods', { startDate: inside });
check('overlap 409 OVERLAPPING_PERIOD with details', r.status === 409 && r.json.error.code === 'OVERLAPPING_PERIOD' && r.json.error.details.requiresConfirmation && r.json.error.details.overlapping.length === 1, JSON.stringify(r.json));
r = await call('POST', '/periods', { startDate: inside, confirmOverlap: true });
check('overlap saved after confirmation', r.status === 201, JSON.stringify(r.json));
const overlapId = r.json.data?.period?.id;
r = await call('DELETE', `/periods/${overlapId}`);
check('delete the confirmed overlap', r.status === 200);

// ---------- estimate from recorded cycles
r = await call('GET', '/cycle/estimate');
const e = r.json.data.estimate;
check('estimate uses recorded cycles (28), not the chosen 30', e.basis === 'recorded_cycles' && e.cycleLength === 28 && e.intervalsUsed === 2 && e.tooLittleHistory === false, JSON.stringify(e));
check('estimate flagged as estimated', e.estimated === true);
check('next estimated start = last start + 28', e.nextEstimatedStart === day(0), JSON.stringify(e));
check('today is cycle day 29 and not overdue', e.cycleDay === 29 && e.status === 'upcoming' && e.daysUntilNextPeriod === 0);

// ---------- list, pagination, filters
r = await call('GET', '/periods');
check('list newest first', r.status === 200 && r.json.data.total === 3 && r.json.data.items[0].startDate === starts[2], JSON.stringify(r.json));
r = await call('GET', '/periods?limit=2&page=2');
check('pagination page 2 holds the oldest', r.json.data.items.length === 1 && r.json.data.items[0].startDate === starts[0]);
r = await call('GET', `/periods?from=${starts[1]}&to=${starts[2]}`);
check('from/to filter', r.json.data.items.length === 2);
r = await call('GET', '/periods?limit=500');
check('limit over 200 rejected', r.status === 400);
r = await call('GET', '/periods?limit=2&page=1');
check('page and limit come back as numbers (query values are converted)', r.json.data.limit === 2 && r.json.data.page === 1 && typeof r.json.data.limit === 'number', JSON.stringify([r.json.data.limit, r.json.data.page]));

// ---------- edit
r = await call('PATCH', `/periods/${ids[2]}`, {});
check('empty edit 400', r.status === 400);
r = await call('PATCH', `/periods/${ids[2]}`, { notes: 'edited note' });
check('edit notes only', r.status === 200 && r.json.data.period.notes === 'edited note' && r.json.data.period.startDate === starts[2]);
r = await call('PATCH', `/periods/${ids[2]}`, { endDate: null });
check('endDate null clears it', r.status === 200 && r.json.data.period.endDate === null && r.json.data.period.durationDays === null);
r = await call('PATCH', `/periods/${ids[2]}`, { startDate: starts[1] });
check('edit into a duplicate start date 409', r.status === 409 && r.json.error.code === 'DUPLICATE_PERIOD', JSON.stringify(r.json));
r = await call('GET', '/periods');
check('other records untouched by edits', r.json.data.items.find((p) => p.id === ids[0]).startDate === starts[0] && r.json.data.items.find((p) => p.id === ids[1]).startDate === starts[1]);
r = await call('PATCH', `/periods/${ids[2]}`, { endDate: day(-27) });
check('restore a valid end date', r.status === 200);
r = await call('GET', '/periods/not-an-id');
check('bad id 400', r.status === 400);
r = await call('GET', `/periods/${hex()}`);
check('unknown id 404', r.status === 404);

// ---------- calendar
r = await call('GET', `/cycle/calendar?month=${monthOf(starts[2])}`);
check('calendar returns actual days', r.status === 200 && r.json.data.days.some((d) => d.date === starts[2] && d.type === 'actual'), JSON.stringify(r.json).slice(0, 300));
r = await call('GET', `/cycle/calendar?month=${monthOf(day(0))}`);
const todayEntry = r.json.data.days.find((d) => d.date === day(0));
check('calendar marks the predicted period as predicted', todayEntry?.type === 'predicted', JSON.stringify(r.json).slice(0, 400));
r = await call('GET', '/cycle/calendar?month=2024-13');
check('bad month 400', r.status === 400);
r = await call('GET', '/cycle/calendar');
check('missing month 400', r.status === 400);

// ---------- isolation between users
r = await call('GET', '/periods', null, B);
check('user B sees none of A\'s periods', r.json.data.total === 0);
r = await call('GET', `/periods/${ids[0]}`, null, B);
check('user B cannot read A\'s period (404)', r.status === 404);
r = await call('PATCH', `/periods/${ids[0]}`, { notes: 'hijack' }, B);
check('user B cannot edit A\'s period (404)', r.status === 404);
r = await call('DELETE', `/periods/${ids[0]}`, null, B);
check('user B cannot delete A\'s period (404)', r.status === 404);
r = await call('GET', '/cycle/estimate', null, B);
check('user B estimate is empty', r.json.data.estimate.status === 'no_data');

// ---------- delete (soft) and recompute
r = await call('DELETE', `/periods/${ids[2]}`);
check('delete 200', r.status === 200);
r = await call('GET', `/periods/${ids[2]}`);
check('deleted period is gone (404)', r.status === 404);
r = await call('DELETE', `/periods/${ids[2]}`);
check('delete twice 404', r.status === 404);
r = await call('GET', '/periods');
check('deleted period not listed', r.json.data.total === 2);
r = await call('GET', '/cycle/estimate');
check('estimate recomputed after delete (one interval -> chosen length 30)', r.json.data.estimate.basis === 'chosen_length' && r.json.data.estimate.cycleLength === 30 && r.json.data.estimate.lastPeriodStart === starts[1], JSON.stringify(r.json.data.estimate));
r = await call('POST', '/periods', { startDate: starts[2] });
check('a deleted date can be logged again', r.status === 201, JSON.stringify(r.json));

// ---- a double tap: simultaneous requests for the same start date
const racers = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/periods', { startDate: day(-300), endDate: day(-296) })));
const created = racers.filter((x) => x.status === 201).length;
const refused = racers.filter((x) => x.status === 409 && x.json.error.code === 'DUPLICATE_PERIOD').length;
check('double tap: of 10 simultaneous requests for one start date exactly one creates it', created === 1 && refused === 9 && racers.every((x) => x.status < 500), `created=${created} refused=${refused} statuses=${racers.map((x) => x.status)}`);
r = await call('GET', `/periods?from=${day(-300)}&to=${day(-300)}`);
check('double tap: and only one period is stored', r.json.data.total === 1, String(r.json.data.total));

// ---- clean up the two test users this script created, so other suites start from an empty database
const loadBackend = (p) => import(new URL(`../../src/${p}`, import.meta.url).href);
const { default: connectDB } = await loadBackend('config/db.config.js');
await connectDB();
const { deleteUserData } = await loadBackend('services/userData.service.js');
await loadBackend('services/syncPush.service.js'); // registers every user-owned model
for (const id of [userA, userB]) await deleteUserData(id);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
