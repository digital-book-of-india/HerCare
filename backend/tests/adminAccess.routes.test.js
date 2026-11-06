// PRIVACY RULE: the admin never reads an individual user's period or symptom data.
// These tests fail if anyone adds an admin route, or admin code, that could break that rule.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Importing the router loads the config, which needs these values. Dummies are enough: no database
// connection is opened here.
Object.assign(process.env, {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
  JWT_SECRET: 'x'.repeat(32),
  DBI_JWT_SECRET: 'y'.repeat(32),
  ENCRYPTION_KEY: 'a'.repeat(64),
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'unused-password',
});

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (relative) => readFileSync(join(SRC, relative), 'utf8');
const listJs = (relative) => readdirSync(join(SRC, relative)).filter((f) => f.endsWith('.js')).map((f) => `${relative}/${f}`);

// Every admin endpoint that exists. Adding a route means adding it here on purpose.
const ALLOWED_ROUTES = [
  'POST /auth/login',
  'GET /me',
  'GET /dashboard',
  'GET /tips',
  'POST /tips',
  'GET /tips/:id',
  'PATCH /tips/:id',
  'POST /tips/:id/review',
  'PATCH /tips/:id/active',
  'DELETE /tips/:id',
  'GET /content',
  'PATCH /content',
  'GET /settings',
  'PATCH /settings',
].sort();

let router;
before(async () => {
  ({ default: router } = await import('../src/routes/admin/admin.routes.js'));
});

const routesOf = () => router.stack
  .map((layer, index) => ({ layer, index }))
  .filter(({ layer }) => layer.route)
  .flatMap(({ layer, index }) => Object.keys(layer.route.methods).map((method) => ({
    label: `${method.toUpperCase()} ${layer.route.path}`, path: layer.route.path, index,
  })));

test('the admin router exposes exactly the allow-listed routes', () => {
  assert.deepEqual(routesOf().map((r) => r.label).sort(), ALLOWED_ROUTES);
});

test('no admin route is about an individual user or their health data', () => {
  const forbidden = /user|period|symptom|reminder|checklist|hydration|note|export|sync|account|profile/i;
  for (const { path } of routesOf()) {
    assert.ok(!forbidden.test(path.replace('/me', '')), `admin route ${path} looks like it exposes user data`);
  }
});

test('every admin route except login sits behind the admin check', () => {
  const guard = router.stack.findIndex((layer) => !layer.route && layer.name === 'authenticateAdmin');
  assert.ok(guard >= 0, 'authenticateAdmin must be applied to the admin router');
  for (const { label, index } of routesOf()) {
    if (label === 'POST /auth/login') continue;
    assert.ok(index > guard, `${label} is registered before the admin check`);
  }
});

test('the dashboard only counts: it never reads documents', () => {
  const code = read('services/admin/adminDashboard.service.js')
    .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /\.(find|findOne|findById|findOneAndUpdate|lean|distinct|populate|cursor)\s*\(/, 'dashboard must not read documents');
  assert.doesNotMatch(code, /\b(notes?|startDate|endDate|symptoms|mood|flow|energy|label)\b/, 'dashboard must not touch health fields');
  assert.match(code, /\$project:\s*\{\s*user:\s*1\s*\}/, 'the user-count pipeline must project only the user id');
});

test('only the dashboard may import models that hold user data', () => {
  const userDataModels = /models\/(periodRecord|symptomLog|userSettings|checklistItem|checklistLog|hydrationLog|reminder|erasureMarker)\.model\.js/;
  const adminFiles = [...listJs('services/admin'), ...listJs('controllers/admin'), 'routes/admin/admin.routes.js'];
  for (const file of adminFiles) {
    if (file === 'services/admin/adminDashboard.service.js') continue;
    assert.doesNotMatch(read(file), userDataModels, `${file} must not import a user-data model`);
  }
});

test('admin controllers go through services, never straight to a model', () => {
  for (const file of listJs('controllers/admin')) {
    assert.doesNotMatch(read(file), /models\//, `${file} must not import a model`);
  }
});

test('the admin code never returns a user id or token field', () => {
  for (const file of listJs('services/admin')) {
    const code = read(file);
    assert.doesNotMatch(code, /req\.user|\buser:\s*1\b.*\$push|\$push/, `${file} must not collect user ids`);
  }
});
