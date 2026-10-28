import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'scripts', 'devToken.script.js');
const DBI_SECRET = 'd'.repeat(40);
const BASE_ENV = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
  MONGODB_URI: 'mongodb://127.0.0.1:27017/unused', JWT_SECRET: 'j'.repeat(40), DBI_JWT_SECRET: DBI_SECRET,
  ENCRYPTION_KEY: 'ab'.repeat(32), ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'a-long-admin-password',
};

// Run from an empty folder so no .env file can leak in.
const run = (args = [], env = {}) => {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: tmpdir(), env: { ...BASE_ENV, ...env }, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
};
const decode = (token) => jwt.verify(token.trim(), DBI_SECRET, { algorithms: ['HS256'] });

test('prints one token a DBI-style verifier accepts, for a fresh random user', () => {
  const { code, out } = run();
  assert.equal(code, 0);
  assert.match(out.trim(), /^[\w-]+\.[\w-]+\.[\w-]+$/, 'stdout is only the token, so $(npm run -s dev-token) works');
  const payload = decode(out);
  assert.match(payload.id, /^[0-9a-f]{24}$/);
  assert.equal(payload.role, 'user');
  assert.equal(payload.exp - payload.iat, 24 * 3600);
});

test('two runs are two different users', () => {
  assert.notEqual(decode(run().out).id, decode(run().out).id);
});

test('--user and --hours are respected', () => {
  const id = '65f1c2a4b8e9d3a7c1f20e11';
  const payload = decode(run(['--user', id, '--hours', '1']).out);
  assert.equal(payload.id, id);
  assert.equal(payload.exp - payload.iat, 3600);
});

test('bad options are refused with a message and no token', () => {
  for (const args of [['--user', 'not-an-id'], ['--user', 'a'.repeat(23)], ['--hours', '0'], ['--hours', 'abc'], ['--hours', '9999']]) {
    const { code, out, err } = run(args);
    assert.equal(code, 1, args.join(' '));
    assert.equal(out.trim(), '');
    assert.ok(err.length > 0);
  }
});

test('it refuses to run in production, because it can act as any user', () => {
  const { code, out, err } = run([], { NODE_ENV: 'production' });
  assert.equal(code, 1);
  assert.equal(out.trim(), '');
  assert.match(err, /production/);
});

test('a token signed with the wrong secret would not verify (so the tool really uses DBI_JWT_SECRET)', () => {
  const token = run().out.trim();
  assert.throws(() => jwt.verify(token, 'someone-elses-secret', { algorithms: ['HS256'] }));
});
