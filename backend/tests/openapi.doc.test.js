// The API reference must describe the API that really exists. These tests fail when someone adds,
// renames or removes an endpoint without updating src/docs/openapi.doc.js, or edits the spec without
// regenerating the files in docs/ (npm run docs:build).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapi from '../src/docs/openapi.doc.js';
import { buildArtifacts } from '../src/docs/artifacts.doc.js';
import { SYMPTOMS, FLOWS, MOODS, ENERGY_LEVELS, REMINDER_TYPES, TIP_CATEGORIES, TIP_SHOW_WHEN } from '../src/utils/constants.util.js';

// Loading the routers loads the config, which needs these. Dummies are enough: nothing connects.
Object.assign(process.env, {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/unused', JWT_SECRET: 'x'.repeat(32), DBI_JWT_SECRET: 'y'.repeat(32),
  ENCRYPTION_KEY: 'a'.repeat(64), ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'unused-password',
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OPERATIONS = Object.entries(openapi.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ method: method.toUpperCase(), path, operation })));

let realRoutes;
before(async () => {
  const [{ default: user }, { default: content }, { default: admin }] = await Promise.all([
    import('../src/routes/user.routes.js'),
    import('../src/routes/content.routes.js'),
    import('../src/routes/admin/admin.routes.js'),
  ]);
  const routesOf = (prefix, router) => router.stack.filter((layer) => layer.route).flatMap((layer) =>
    Object.keys(layer.route.methods).map((method) =>
      `${method.toUpperCase()} ${prefix}${layer.route.path}`.replace(/\/$/, '').replace(/:(\w+)/g, '{$1}')));
  realRoutes = [...routesOf('/user', user), ...routesOf('/content', content), ...routesOf('/admin', admin), 'GET /health'].sort();
});

test('the API reference describes exactly the routes that exist', () => {
  const documented = OPERATIONS.map(({ method, path }) => `${method} ${path}`).sort();
  const missing = realRoutes.filter((route) => !documented.includes(route));
  const invented = documented.filter((route) => !realRoutes.includes(route));
  assert.deepEqual(missing, [], `routes without documentation: ${missing.join(', ')}`);
  assert.deepEqual(invented, [], `documented routes that do not exist: ${invented.join(', ')}`);
});

test('every $ref points at something that exists', () => {
  const broken = [];
  const walk = (value, where) => {
    if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${where}[${i}]`));
    if (value && typeof value === 'object') {
      if (typeof value.$ref === 'string') {
        const target = value.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node?.[key], openapi);
        if (target === undefined) broken.push(`${where} -> ${value.$ref}`);
      }
      Object.entries(value).forEach(([key, child]) => walk(child, `${where}.${key}`));
    }
  };
  walk(openapi, 'openapi');
  assert.deepEqual(broken, []);
});

test('operation ids are unique, and every operation is described', () => {
  const ids = OPERATIONS.map(({ operation }) => operation.operationId);
  assert.equal(new Set(ids).size, ids.length, 'duplicate operationId');
  const tags = new Set(openapi.tags.map((tag) => tag.name));
  for (const { method, path, operation } of OPERATIONS) {
    assert.ok(operation.summary?.length > 5, `${method} ${path} needs a summary`);
    assert.ok(operation.tags?.length === 1 && tags.has(operation.tags[0]), `${method} ${path} has an unknown tag`);
  }
});

test('every path parameter is declared, and nothing extra is', () => {
  for (const { method, path, operation } of OPERATIONS) {
    const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const declared = (operation.parameters ?? []).filter((p) => p.in === 'path');
    assert.deepEqual(declared.map((p) => p.name).sort(), inPath, `${method} ${path}`);
    assert.ok(declared.every((p) => p.required === true), `${method} ${path}: path parameters are required`);
  }
});

test('each operation has one success response, with an example, and the errors it can really give', () => {
  for (const { method, path, operation } of OPERATIONS) {
    const label = `${method} ${path}`;
    const success = Object.keys(operation.responses).filter((code) => code.startsWith('2'));
    assert.equal(success.length, 1, `${label} needs exactly one 2xx response`);
    assert.ok(operation.responses[success[0]].content?.['application/json']?.example, `${label}: the success response needs an example`);
    if (operation.security.length > 0) assert.ok(operation.responses['401'], `${label} is protected, so it must document 401`);
    if (operation.requestBody) {
      assert.ok(operation.responses['400'], `${label} takes a body, so it must document 400`);
      assert.ok(operation.requestBody.content['application/json'].example, `${label}: the request body needs an example`);
    }
  }
});

test('who may call what: public, user and admin routes use the right token type', () => {
  for (const { method, path, operation } of OPERATIONS) {
    const scheme = operation.security[0] && Object.keys(operation.security[0])[0];
    const expected = path === '/admin/auth/login' || path === '/health' || path === '/content' ? undefined
      : path.startsWith('/admin') ? 'adminToken' : 'userToken';
    assert.equal(scheme, expected, `${method} ${path}`);
    if (scheme) assert.ok(openapi.components.securitySchemes[scheme], `${scheme} is not defined`);
  }
});

test('the allowed values in the reference are the ones the code enforces', () => {
  const s = openapi.components.schemas;
  assert.deepEqual(s.SymptomLog.properties.symptoms.items.enum, SYMPTOMS);
  assert.deepEqual(s.SymptomInput.properties.symptoms.items.enum, SYMPTOMS);
  assert.deepEqual(s.SymptomInput.properties.flow.enum, FLOWS);
  assert.deepEqual(s.SymptomInput.properties.mood.enum, MOODS);
  assert.deepEqual(s.SymptomInput.properties.energy.enum, ENERGY_LEVELS);
  assert.deepEqual(s.Reminder.properties.type.enum, REMINDER_TYPES);
  assert.deepEqual(s.UserTip.properties.category.enum, TIP_CATEGORIES);
  assert.deepEqual(s.AdminTip.properties.showWhen.enum, TIP_SHOW_WHEN);
  const reminderPath = openapi.paths['/user/reminders/{type}'].patch.parameters.find((p) => p.name === 'type');
  assert.deepEqual(reminderPath.schema.enum, REMINDER_TYPES);
});

test('the reference never describes a route that returns an individual user\'s data to the admin', () => {
  const adminPaths = Object.keys(openapi.paths).filter((path) => path.startsWith('/admin'));
  assert.equal(adminPaths.length, 9); // login, me, dashboard, tips (+ id, review, active), content, settings
  assert.ok(adminPaths.every((path) => !/user|period|symptom|reminder|checklist|hydration|export|sync/i.test(path.replace('/admin/me', ''))));
});

test('the generated files in docs/ are up to date (run: npm run docs:build)', () => {
  for (const [relative, expected] of Object.entries(buildArtifacts())) {
    const committed = readFileSync(join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(committed, expected, `${relative} is out of date. Run \`npm run docs:build\` and commit the result.`);
  }
});
