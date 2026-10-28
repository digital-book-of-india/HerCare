import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPostmanCollection } from '../src/utils/postman.util.js';
import openapi from '../src/docs/openapi.doc.js';

const collection = buildPostmanCollection(openapi);
const requests = collection.item.flatMap((folder) => folder.item);
const byName = (name) => requests.find((r) => r.name === name);

test('every operation becomes a request, grouped in folders by tag', () => {
  const operationCount = Object.values(openapi.paths).reduce((sum, methods) => sum + Object.keys(methods).length, 0);
  assert.equal(requests.length, operationCount);
  assert.deepEqual(collection.item.map((f) => f.name), openapi.tags.map((t) => t.name));
  assert.ok(collection.info.schema.endsWith('collection.json') && collection.info.schema.includes('v2.1.0'));
});

test('variables for the address and both tokens, with no secrets inside', () => {
  assert.deepEqual(collection.variable.map((v) => v.key), ['baseUrl', 'userToken', 'adminToken']);
  assert.equal(collection.variable.find((v) => v.key === 'userToken').value, '');
  assert.equal(collection.variable.find((v) => v.key === 'adminToken').value, '');
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(JSON.stringify(collection)), 'a real token ended up in the collection');
});

test('public, user and admin requests use the right authorisation', () => {
  assert.equal(byName('Is the server (and its database) up?').request.auth.type, 'noauth');
  assert.equal(byName('Sign in as the admin').request.auth.type, 'noauth');
  assert.equal(byName('The period history, newest first').request.auth.bearer[0].value, '{{userToken}}');
  assert.equal(byName('Aggregate numbers (never an individual\'s data)').request.auth.bearer[0].value, '{{adminToken}}');
});

test('signing in as the admin stores the token for every other request', () => {
  const login = byName('Sign in as the admin');
  const script = login.event[0].script.exec.join('\n');
  assert.equal(login.event[0].listen, 'test');
  assert.match(script, /pm\.collectionVariables\.set\('adminToken', body\.data\.token\)/);
});

test('paths: {id} becomes :id with a variable; required query parameters are on, optional ones off', () => {
  const one = byName('One period');
  assert.deepEqual(one.request.url.path, ['user', 'periods', ':id']);
  assert.equal(one.request.url.variable[0].key, 'id');
  assert.ok(one.request.url.raw.startsWith('{{baseUrl}}/user/periods/:id'));

  const calendar = byName('One month, with logged days and estimated days');
  assert.equal(calendar.request.url.query.find((q) => q.key === 'month').disabled, false);
  assert.ok(calendar.request.url.raw.includes('?month=2026-10'));

  const list = byName('The period history, newest first');
  assert.ok(list.request.url.query.every((q) => q.disabled === true), 'optional filters start switched off');
  assert.ok(!list.request.url.raw.includes('?'));
});

test('bodies are the documented examples, as valid JSON, with a JSON header', () => {
  const create = byName('Log a period');
  assert.equal(create.request.method, 'POST');
  assert.ok(create.request.header.some((h) => h.key === 'Content-Type' && h.value === 'application/json'));
  const body = JSON.parse(create.request.body.raw);
  assert.equal(body.startDate, '2026-09-01');
  for (const request of requests.filter((r) => r.request.body)) assert.doesNotThrow(() => JSON.parse(request.request.body.raw), request.name);
  assert.ok(requests.filter((r) => !r.request.body).every((r) => r.request.header.length === 0));
});

test('a tiny spec converts correctly (edge cases)', () => {
  const tiny = {
    info: { title: 'Tiny', description: 'd' },
    servers: [{ url: 'http://example.test/api' }],
    tags: [{ name: 'A' }, { name: 'Unused' }],
    paths: { '/things/{id}/parts/{part}': { get: {
      operationId: 'x', summary: 'Get a part', tags: ['A'], security: [{ userToken: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { example: 'abc' } }, { name: 'part', in: 'path', required: true, schema: { enum: ['one', 'two'] } },
        { name: 'n', in: 'query', required: true, schema: { default: 5 } }, { name: 'q', in: 'query', required: false, schema: {} }],
    } } },
  };
  const result = buildPostmanCollection(tiny);
  assert.deepEqual(result.item.map((f) => f.name), ['A'], 'folders with no requests are left out');
  const request = result.item[0].item[0].request;
  assert.equal(request.url.raw, '{{baseUrl}}/things/:id/parts/:part?n=5');
  assert.deepEqual(request.url.variable.map((v) => [v.key, v.value]), [['id', 'abc'], ['part', 'one']]);
  assert.equal(result.variable[0].value, 'http://example.test/api');
});
