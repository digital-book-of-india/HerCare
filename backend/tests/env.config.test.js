// Each case loads the config in its own process (it validates at import time), from a folder with
// no .env file so nothing leaks in from the developer's machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONFIG_URL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'config', 'env.config.js')).href;

const VALID = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
  JWT_SECRET: 'j'.repeat(40),
  DBI_JWT_SECRET: 'd'.repeat(40),
  ENCRYPTION_KEY: 'ab'.repeat(32),
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'a-long-admin-password',
};

const load = (overrides = {}, remove = []) => {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...VALID, ...overrides };
  remove.forEach((key) => delete env[key]);
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `const { default: env } = await import(${JSON.stringify(CONFIG_URL)}); console.log(JSON.stringify(env));`],
    { cwd: tmpdir(), env, encoding: 'utf8' }
  );
  return { ok: result.status === 0, error: result.stderr, config: result.status === 0 ? JSON.parse(result.stdout) : null };
};

test('a valid configuration loads, with safe defaults', () => {
  const { ok, config } = load();
  assert.ok(ok);
  assert.equal(config.rateLimit, 600);
  assert.equal(config.userRateLimit, 300);
  assert.equal(config.authRateLimit, 5);
  assert.equal(config.trustProxy, false);
  assert.equal(config.adminJwtExpiresIn, '8h');
  assert.equal(config.dataEpoch, '1');
});

test('each required variable is enforced', () => {
  for (const key of Object.keys(VALID)) {
    const { ok, error } = load({}, [key]);
    assert.equal(ok, false, `${key} should be required`);
    assert.match(error, new RegExp(key));
  }
});

test('the encryption key must be 64 hex characters', () => {
  assert.equal(load({ ENCRYPTION_KEY: 'short' }).ok, false);
  assert.equal(load({ ENCRYPTION_KEY: 'zz'.repeat(32) }).ok, false);
});

test('JWT_SECRET must differ from DBI_JWT_SECRET', () => {
  const { ok, error } = load({ JWT_SECRET: 'same-secret-value', DBI_JWT_SECRET: 'same-secret-value' });
  assert.equal(ok, false);
  assert.match(error, /different from DBI_JWT_SECRET/);
});

test('production refuses weak secrets, development allows them', () => {
  assert.equal(load({ NODE_ENV: 'production', JWT_SECRET: 'short' }).ok, false);
  assert.equal(load({ NODE_ENV: 'production', ADMIN_PASSWORD: 'short' }).ok, false);
  assert.equal(load({ NODE_ENV: 'production' }).ok, true);
  assert.equal(load({ JWT_SECRET: 'short', ADMIN_PASSWORD: 'short' }).ok, true);
});

test('TRUST_PROXY accepts a hop count, a name, or nothing', () => {
  assert.equal(load({ TRUST_PROXY: '1' }).config.trustProxy, 1);
  assert.equal(load({ TRUST_PROXY: '2' }).config.trustProxy, 2);
  assert.equal(load({ TRUST_PROXY: 'loopback' }).config.trustProxy, 'loopback');
  assert.equal(load({ TRUST_PROXY: 'false' }).config.trustProxy, false);
  assert.equal(load({ TRUST_PROXY: '' }).config.trustProxy, false);
});

test('DATA_EPOCH can be changed after a restore', () => {
  assert.equal(load({ DATA_EPOCH: 'restored-2026-11-02' }).config.dataEpoch, 'restored-2026-11-02');
});

test('the encryption key id defaults to k1 and no retired keys are listed', () => {
  const { config } = load();
  assert.equal(config.encryptionKeyId, 'k1');
  assert.deepEqual(config.oldEncryptionKeys, []);
});

test('a new key id with the previous key kept for reading', () => {
  const oldKey = 'cd'.repeat(32);
  const { ok, config } = load({ ENCRYPTION_KEY_ID: 'k2', ENCRYPTION_KEYS_OLD: `k1:${oldKey}` });
  assert.ok(ok);
  assert.equal(config.encryptionKeyId, 'k2');
  assert.deepEqual(config.oldEncryptionKeys, [{ id: 'k1', key: oldKey }]);
  const two = load({ ENCRYPTION_KEY_ID: 'k3', ENCRYPTION_KEYS_OLD: `k2:${oldKey}, k1:${'ef'.repeat(32)}` }).config;
  assert.deepEqual(two.oldEncryptionKeys.map((k) => k.id), ['k2', 'k1']);
});

test('mistakes in the key settings stop the server from starting', () => {
  const oldKey = 'cd'.repeat(32);
  assert.equal(load({ ENCRYPTION_KEY_ID: 'bad:id' }).ok, false);
  assert.equal(load({ ENCRYPTION_KEY_ID: 'x'.repeat(33) }).ok, false);
  assert.equal(load({ ENCRYPTION_KEYS_OLD: `k1:${oldKey}` }).ok, false); // k1 is the current id too
  assert.equal(load({ ENCRYPTION_KEY_ID: 'k2', ENCRYPTION_KEYS_OLD: 'k1:not-hex' }).ok, false);
  assert.equal(load({ ENCRYPTION_KEY_ID: 'k2', ENCRYPTION_KEYS_OLD: 'just-text' }).ok, false);
  assert.equal(load({ ENCRYPTION_KEY_ID: 'k3', ENCRYPTION_KEYS_OLD: `k1:${oldKey},k1:${oldKey}` }).ok, false);
});

test('DBI_ALLOWED_ROLES is a trimmed list, empty (everyone) by default', () => {
  assert.deepEqual(load().config.dbiAllowedRoles, []);
  assert.deepEqual(load({ DBI_ALLOWED_ROLES: 'user' }).config.dbiAllowedRoles, ['user']);
  assert.deepEqual(load({ DBI_ALLOWED_ROLES: ' user , customer ,, ' }).config.dbiAllowedRoles, ['user', 'customer']);
});

test('rate limits can be set, and invalid values fall back to the safe defaults', () => {
  const custom = load({ RATE_LIMIT: '1000', USER_RATE_LIMIT: '50', AUTH_RATE_LIMIT: '3' }).config;
  assert.deepEqual([custom.rateLimit, custom.userRateLimit, custom.authRateLimit], [1000, 50, 3]);
  const bad = load({ RATE_LIMIT: 'abc', USER_RATE_LIMIT: '-5', AUTH_RATE_LIMIT: '0' }).config;
  assert.deepEqual([bad.rateLimit, bad.userRateLimit, bad.authRateLimit], [600, 300, 5]);
});
