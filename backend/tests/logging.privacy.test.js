// Health data must never reach the logs. These tests fail if code starts logging request data,
// or if the scrubber stops hiding sensitive fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import logger, { redact } from '../src/utils/logger.util.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const sourceFiles = (dir = SRC) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.js') ? [full] : [];
});
const codeLines = (file) => readFileSync(file, 'utf8').split('\n').map((text, index) => ({ text, line: index + 1 }))
  .filter(({ text }) => !text.trim().startsWith('//'));
const rel = (file) => relative(SRC, file).replaceAll('\\', '/');

test('no logger call includes request data', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    for (const { text, line } of codeLines(file)) {
      if (/logger\.\w+\(/.test(text) && /\breq\.(body|query|headers|params|cookies)\b|\brecord\b|\brec\b/.test(text)) {
        offenders.push(`${rel(file)}:${line}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('console is used only by the logger and by command-line scripts', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    const name = rel(file);
    if (name === 'utils/logger.util.js' || name.startsWith('scripts/')) continue;
    for (const { text, line } of codeLines(file)) {
      if (/\bconsole\.\w+\(/.test(text)) offenders.push(`${name}:${line}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the error handler never logs the request body and hides stacks in production', () => {
  const code = readFileSync(join(SRC, 'middlewares', 'errorHandler.middleware.js'), 'utf8');
  assert.doesNotMatch(code, /logger\.\w+\([^)]*req\.(body|query|headers)/);
  assert.match(code, /env\.nodeEnv === 'production' \? undefined/);
});

test('the scrubber hides credentials, personal details and health data, at any depth', () => {
  const dirty = {
    identifier: 'a@b.com', email: 'a@b.com', phone: '999', password: 'p', token: 't', authorization: 'Bearer x', cookie: 'c',
    notes: 'private', note: 'private', symptoms: ['cramps'], mood: 'sad', flow: 'heavy', energy: 'low',
    startDate: '2024-05-01', endDate: '2024-05-05', date: '2024-05-01', time: '10:00', times: ['10:00'],
    label: 'take my medicine', text: 'free text',
    nested: { deeper: [{ notes: 'private', ok: 'visible' }] },
  };
  const clean = redact(dirty);
  const json = JSON.stringify(clean);
  for (const secret of ['a@b.com', 'private', 'cramps', 'sad', 'heavy', '2024-05-01', '10:00', 'take my medicine', 'free text', 'Bearer x']) {
    assert.ok(!json.includes(secret), `${secret} leaked through the scrubber`);
  }
  assert.equal(clean.nested.deeper[0].ok, 'visible');
  assert.equal(clean.notes, '[REDACTED]');
});

test('what the logger prints is scrubbed, and plain messages pass through', () => {
  const printed = [];
  const original = console.error;
  console.error = (...args) => printed.push(args.join(' '));
  try {
    logger.error('request failed', { notes: 'very private', code: 500 });
    logger.error('plain message');
  } finally {
    console.error = original;
  }
  assert.ok(printed[0].includes('[REDACTED]') && !printed[0].includes('very private') && printed[0].includes('500'));
  assert.ok(printed[1].endsWith('ERROR plain message'));
});
