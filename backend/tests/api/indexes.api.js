// Checks, against the real database, that the queries the app runs actually use indexes
// (no full collection scans, no in-memory sorts on the big lists) and that the uniqueness
// rules are enforced by the database itself. Needs no running server.
import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';

const BACKEND = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '').replaceAll('\\', '/');
const load = (p) => import(pathToFileURL(`${BACKEND}/src/${p}`).href);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const { default: connectDB } = await load('config/db.config.js');
await connectDB();
const { syncAllIndexes } = await load('services/indexes.service.js');
const { deleteUserData } = await load('services/userData.service.js');
const models = Object.fromEntries(await Promise.all(
  ['periodRecord', 'symptomLog', 'checklistItem', 'checklistLog', 'hydrationLog', 'reminder', 'userSettings', 'tip', 'erasureMarker']
    .map(async (name) => [name, (await load(`models/${name}.model.js`)).default])
));

const user = [...Array(24)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const since = new Date(Date.now() - 86_400_000);

// Which stages did the winner use? e.g. "IXSCAN FETCH". An empty collection plans as EOF, so the
// test user gets a row in every collection first.
const stagesOf = async (query) => {
  const explain = await query.explain('queryPlanner');
  return JSON.stringify(explain.queryPlanner.winningPlan);
};
// MongoDB reports a single-document lookup as EXPRESS_IXSCAN, so match any index scan.
const usesIndex = (plan) => /IXSCAN/.test(plan) && !plan.includes('"COLLSCAN"');
const sortsInMemory = (plan) => plan.includes('"SORT"');

try {
  const dropped = await syncAllIndexes();
  check('index sync runs for every model', Object.keys(dropped).length === 10);

  await models.periodRecord.create({ user, startDate: '2024-05-01', endDate: '2024-05-05' });
  await models.symptomLog.create({ user, date: '2024-05-01', mood: 'calm' });
  const item = await models.checklistItem.create({ user, label: 'x', order: 0 });
  await models.checklistLog.create({ user, date: '2024-05-01', itemId: item._id, completed: true });
  await models.hydrationLog.create({ user, date: '2024-05-01', time: '10:00', done: true });
  await models.reminder.create({ user, type: 'daily_log', enabled: true, timeOfDay: '20:00' });
  await models.userSettings.create({ user, cycleLength: 30 });

  // ---- sync pull: "everything of this user changed since T", for each of the 7 collections
  for (const [name, model] of Object.entries(models).filter(([n]) => !['tip', 'erasureMarker'].includes(n))) {
    const plan = await stagesOf(model.find({ user, updatedAt: { $gte: since } }).sort({ updatedAt: 1 }));
    // A user has at most ONE settings row, so the planner rightly walks the unique `user` index
    // there and "sorts" that single row; every other collection must need no sort at all.
    const sortAllowed = name === 'userSettings';
    check(`sync pull on ${name} uses an index${sortAllowed ? '' : ' and needs no in-memory sort'}`, usesIndex(plan) && (sortAllowed || !sortsInMemory(plan)), plan.slice(0, 200));
  }

  // ---- the lists the app shows
  let plan = await stagesOf(models.periodRecord.find({ user, deletedAt: null }).sort({ startDate: -1 }).limit(50));
  check('period list (newest first) uses an index with no in-memory sort', usesIndex(plan) && !sortsInMemory(plan), plan.slice(0, 200));
  plan = await stagesOf(models.periodRecord.find({
    user, deletedAt: null, startDate: { $lte: '2024-05-05' },
    $or: [{ endDate: { $gte: '2024-05-01' } }, { endDate: null, startDate: { $gte: '2024-05-01' } }],
  }));
  check('the overlap check uses an index', usesIndex(plan), plan.slice(0, 200));
  plan = await stagesOf(models.symptomLog.find({ user, deletedAt: null, date: { $gte: '2024-05-01', $lte: '2024-05-31' } }).sort({ date: -1 }).limit(31));
  check('symptom list (by date range) uses an index with no in-memory sort', usesIndex(plan) && !sortsInMemory(plan), plan.slice(0, 200));
  plan = await stagesOf(models.checklistLog.find({ user, date: '2024-05-01' }));
  check('checklist for one day uses an index', usesIndex(plan), plan.slice(0, 200));
  plan = await stagesOf(models.checklistLog.find({ user, completed: true, date: { $gte: '2024-04-01', $lte: '2024-05-31' } }));
  check('checklist history uses an index', usesIndex(plan), plan.slice(0, 200));
  plan = await stagesOf(models.hydrationLog.find({ user, date: '2024-05-01' }));
  check('hydration for one day uses an index', usesIndex(plan), plan.slice(0, 200));
  plan = await stagesOf(models.reminder.find({ user }));
  check('reminders of a user use an index', usesIndex(plan), plan.slice(0, 200));
  plan = await stagesOf(models.userSettings.find({ user }));
  check('settings of a user use an index', usesIndex(plan), plan.slice(0, 200));
  plan = await stagesOf(models.checklistItem.find({ user, deletedAt: null }).sort({ order: 1, createdAt: 1 }));
  check('checklist items of a user use an index (the sort is at most 30 rows)', usesIndex(plan), plan.slice(0, 200));

  // ---- uniqueness is enforced by the database, not only by the code
  const duplicate = async (create) => { try { await create(); return false; } catch (err) { return err.code === 11000; } };
  check('one symptom log per user per date (database-enforced)', await duplicate(() => models.symptomLog.create({ user, date: '2024-05-01', mood: 'sad' })));
  check('one tick per user, date and item', await duplicate(() => models.checklistLog.create({ user, date: '2024-05-01', itemId: item._id })));
  check('one hydration mark per user, date and time', await duplicate(() => models.hydrationLog.create({ user, date: '2024-05-01', time: '10:00' })));
  check('one reminder per user and type', await duplicate(() => models.reminder.create({ user, type: 'daily_log' })));
  check('one settings row per user', await duplicate(() => models.userSettings.create({ user })));
  const tipTitle = `ZZINDEX ${user.slice(0, 6)}`;
  await models.tip.create({ category: 'food', title: tipTitle, text: 'x' });
  check('one tip per category and title (database-enforced)', await duplicate(() => models.tip.create({ category: 'food', title: tipTitle, text: 'y' })));
  check('the same title in the other category is allowed', !(await duplicate(() => models.tip.create({ category: 'activity', title: tipTitle, text: 'z' }))));
  check('one erasure marker per user', await duplicate(async () => {
    await models.erasureMarker.create({ user, erasedAt: new Date() });
    await models.erasureMarker.create({ user, erasedAt: new Date() });
  }));

  // ---- housekeeping indexes
  const markerIndexes = await models.erasureMarker.collection.indexes();
  check('erasure markers expire on their own after a year (TTL index)', markerIndexes.some((i) => i.expireAfterSeconds === 365 * 24 * 60 * 60), JSON.stringify(markerIndexes.map((i) => i.name)));
} catch (err) {
  fail += 1;
  console.log('FAIL  script crashed:', err.stack);
} finally {
  await deleteUserData(user);
  await models.erasureMarker.deleteMany({ user });
  await models.tip.deleteMany({ title: /^ZZINDEX/ });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
