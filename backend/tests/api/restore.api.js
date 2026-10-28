// The restore procedure from docs/backup-restore.md, run for real against the database:
// after restoring an old backup, users who erased their data AFTER the backup are erased again,
// while users who erased BEFORE it (and have written new data since) are left alone.
// Needs no running server.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const load = (p) => import(pathToFileURL(join(ROOT, 'src', p)).href);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const { default: connectDB } = await load('config/db.config.js');
await connectDB();
const { default: PeriodRecord } = await load('models/periodRecord.model.js');
const { default: ErasureMarker } = await load('models/erasureMarker.model.js');
const { deleteUserData } = await load('services/userData.service.js');
await load('services/syncPush.service.js'); // registers every user-owned model

const hex = () => [...Array(24)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const erasedAfterBackup = hex();
const erasedBeforeBackup = hex();
const neverErased = hex();
const everyone = [erasedAfterBackup, erasedBeforeBackup, neverErased];
const backupTime = '2026-11-02T03:00:00.000Z';
const logFile = join(tmpdir(), `hercare-erasures-${Date.now()}.log`);

const script = (...args) => spawnSync(process.execPath, ['src/scripts/reapplyErasures.script.js', ...args], { cwd: ROOT, encoding: 'utf8' });
const run = (...extra) => script('--log', logFile, '--backup-time', backupTime, ...extra);
const count = (user) => PeriodRecord.countDocuments({ user });

try {
  for (const user of everyone) await PeriodRecord.create({ user, startDate: '2024-05-01', endDate: '2024-05-05', notes: 'restored from the backup' });
  writeFileSync(logFile, [
    '[2026-11-02T01:00:00.000Z] INFO Server listening on port 5000',
    `[2026-11-02T02:00:00.000Z] INFO erasure: user=${erasedBeforeBackup} at=2026-11-02T02:00:00.000Z`,
    `[2026-11-02T09:30:00.000Z] INFO erasure: user=${erasedAfterBackup} at=2026-11-02T09:30:00.000Z`,
  ].join('\n'));

  const dry = run();
  check('dry run exits cleanly and says 1 erasure is pending', dry.status === 0 && /1 erasure\(s\).*dry run/.test(dry.stdout + dry.stderr), dry.stderr);
  check('dry run changed nothing', (await count(erasedAfterBackup)) === 1 && (await count(erasedBeforeBackup)) === 1 && (await count(neverErased)) === 1);

  const missing = script('--log', logFile);
  check('a missing --backup-time is refused with usage help', missing.status === 1 && /Usage/.test(missing.stdout + missing.stderr));
  const badTime = script('--log', logFile, '--backup-time', 'yesterday');
  check('an unreadable --backup-time is refused', badTime.status === 1);

  const applied = run('--apply');
  check('--apply exits cleanly', applied.status === 0, applied.stderr);
  check('the user who erased AFTER the backup is erased again', (await count(erasedAfterBackup)) === 0);
  check('their erasure marker is recorded with the original time', (await ErasureMarker.findOne({ user: erasedAfterBackup }))?.erasedAt.toISOString() === '2026-11-02T09:30:00.000Z');
  check('the user who erased BEFORE the backup keeps the data created since', (await count(erasedBeforeBackup)) === 1);
  check('a user who never erased is untouched', (await count(neverErased)) === 1);

  const again = run('--apply');
  check('running it twice is harmless', again.status === 0 && (await count(erasedBeforeBackup)) === 1 && (await count(neverErased)) === 1);
} catch (err) {
  fail += 1;
  console.log('FAIL  script crashed:', err.stack);
} finally {
  for (const user of everyone) await deleteUserData(user);
  await ErasureMarker.deleteMany({ user: { $in: everyone } });
  rmSync(logFile, { force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
