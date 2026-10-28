// Runs every live API suite against its own server: npm run test:api
//
//  - It starts the servers itself, on ports 5055 and 5056, with explicit settings, so a leftover
//    server on port 5000 or the wrong rate limits can never spoil a run.
//  - It needs backend/.env (database, secrets) and a seeded database (npm run seed).
//    Use a TEST database: the suites create and remove their own users, but the admin suite
//    also counts every user in the database, so it needs one with no other user data.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import mongoose from 'mongoose';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RELAXED = { port: 5055, env: { RATE_LIMIT: '100000', USER_RATE_LIMIT: '100000', AUTH_RATE_LIMIT: '100000' } };
const STRICT = { port: 5056, env: { RATE_LIMIT: '250', USER_RATE_LIMIT: '20', AUTH_RATE_LIMIT: '5', DBI_ALLOWED_ROLES: 'user' } };

const SUITES = [
  { name: 'auth and permissions', file: 'auth.api.js', server: RELAXED },
  { name: 'admin panel', file: 'admin.api.js', server: RELAXED },
  { name: 'API reference is true', file: 'docs.api.js', server: RELAXED },
  { name: 'periods and estimates', file: 'periods.api.js', server: RELAXED },
  { name: 'daily tracking', file: 'daily.api.js', server: RELAXED },
  { name: 'sync, export and erase', file: 'sync.api.js', server: RELAXED },
  { name: 'indexes and uniqueness', file: 'indexes.api.js', server: null },
  { name: 'backup restore procedure', file: 'restore.api.js', server: null },
  { name: 'encryption key rotation', file: 'rotation.api.js', server: null },
  { name: 'security hardening', file: 'hardening.api.js', server: STRICT },
];

// `npm run test:api -- hardening` runs only the suites whose file or name contains that word.
const only = process.argv[2];
const selected = SUITES.filter((suite) => !only || suite.file.includes(only) || suite.name.includes(only));
if (selected.length === 0) {
  console.error(`No suite matches "${only}". Available: ${SUITES.map((s) => s.file.replace('.api.js', '')).join(', ')}`);
  process.exit(1);
}

const children = [];
const stopAll = () => children.forEach((child) => child.kill());
process.on('SIGINT', () => { stopAll(); process.exit(130); });

const startServer = async ({ port, env }) => {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  children.push(child);
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) throw new Error(`The test server on port ${port} stopped:\n${output.slice(-600)}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return child;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`The test server on port ${port} did not start:\n${output.slice(-600)}`);
};

const runSuite = (suite) => new Promise((resolve) => {
  const child = spawn(process.execPath, [`tests/api/${suite.file}`], {
    cwd: ROOT,
    env: { ...process.env, ...(suite.server && { API_BASE: `http://127.0.0.1:${suite.server.port}/api` }) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  child.on('close', (code) => {
    const summary = /(\d+) passed, (\d+) failed/.exec(output);
    resolve({
      ...suite,
      code,
      passed: summary ? Number(summary[1]) : 0,
      failed: summary ? Number(summary[2]) : 1,
      problems: output.split('\n').filter((line) => /^FAIL|Error|crashed/.test(line)).slice(0, 12),
    });
  });
});

// ---- before anything: make sure the database is in a state the suites can rely on
await import('../../src/config/db.config.js').then((m) => m.default());
const { default: AdminSettings } = await import('../../src/models/adminSettings.model.js');
const { syncAllIndexes } = await import('../../src/services/indexes.service.js');
const { getDashboard } = await import('../../src/services/admin/adminDashboard.service.js');
const seeded = await AdminSettings.exists({ key: 'global' });
const dashboard = await getDashboard();
await syncAllIndexes();
await mongoose.disconnect();

if (!seeded) {
  console.error('The database is not seeded. Run `npm run seed` first.');
  process.exit(1);
}
if (dashboard.users.total !== 0) {
  console.error(`The database already holds data from ${dashboard.users.total} user(s). Point MONGODB_URI at an empty test database: the admin suite counts all users.`);
  process.exit(1);
}

const results = [];
try {
  console.log('Starting test servers...');
  for (const server of [RELAXED, STRICT]) {
    if (selected.some((suite) => suite.server === server)) await startServer(server);
  }

  for (const suite of selected) {
    process.stdout.write(`  ${suite.name.padEnd(26)}`);
    const result = await runSuite(suite);
    results.push(result);
    console.log(`${String(result.passed).padStart(4)} passed, ${result.failed} failed${result.code === 0 ? '' : '   <-- FAILED'}`);
    result.problems.forEach((line) => console.log(`      ${line}`));
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  stopAll();
}

const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
console.log(`\n${totalPassed} checks passed, ${totalFailed} failed across ${results.length} suites`);
process.exit(process.exitCode || (totalFailed > 0 || results.length !== selected.length ? 1 : 0));
