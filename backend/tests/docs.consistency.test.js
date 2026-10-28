// The written documentation must stay true. These tests fail when a setting or command is added
// without being explained, when a document points at a file that does not exist, or when the
// documentation index forgets a file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEstimateVectors } from '../src/docs/estimateVectors.doc.js';

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(BACKEND, '..');
const read = (...parts) => readFileSync(join(...parts), 'utf8');
const pkg = JSON.parse(read(BACKEND, 'package.json'));

const filesIn = (dir, accept) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? filesIn(full, accept) : accept(full) ? [full] : [];
});
const docsMarkdown = filesIn(join(BACKEND, 'docs'), (f) => f.endsWith('.md'));
const allDocs = [...docsMarkdown, join(BACKEND, 'README.md'), join(REPO, 'admin', 'README.md'), join(REPO, 'mobile', 'README.md')].filter(existsSync);

test('every setting the code reads is in .env.example and explained in the setup guide', () => {
  const used = new Set(filesIn(join(BACKEND, 'src'), (f) => f.endsWith('.js'))
    .flatMap((f) => [...read(f).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1])));
  assert.ok(used.size >= 15);
  const example = read(BACKEND, '.env.example');
  const guide = read(BACKEND, 'docs', 'setup-guide.md');
  for (const name of used) {
    assert.match(example, new RegExp(`^#?\\s*${name}=`, 'm'), `${name} is missing from .env.example`);
    assert.ok(guide.includes(`\`${name}\``), `${name} is not explained in docs/setup-guide.md`);
  }
});

test('every npm command is explained in the setup guide', () => {
  const guide = read(BACKEND, 'docs', 'setup-guide.md');
  for (const name of Object.keys(pkg.scripts)) {
    const mentioned = guide.includes(`npm run ${name}`) || guide.includes(`npm run -s ${name}`)
      || (name === 'start' && guide.includes('npm start')) || (name === 'test' && guide.includes('npm test'));
    assert.ok(mentioned, `npm script "${name}" is not in docs/setup-guide.md`);
  }
});

test('the setup guide names the Node version the project requires', () => {
  assert.equal(pkg.engines.node, '>=20');
  assert.match(read(BACKEND, 'docs', 'setup-guide.md'), /Node\.js 20/);
});

test('every link between documents leads somewhere', () => {
  const broken = [];
  for (const file of allDocs) {
    for (const [, target] of read(file).matchAll(/\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      if (!existsSync(resolve(dirname(file), target))) broken.push(`${file.replace(REPO, '')} -> ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every file path written in code style in the docs exists', () => {
  const missing = [];
  for (const file of docsMarkdown) {
    for (const [, path] of read(file).matchAll(/`((?:src|tests|docs)\/[A-Za-z0-9_./-]+)`/g)) {
      if (!existsSync(join(BACKEND, path))) missing.push(`${file.replace(REPO, '')}: ${path}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the documentation index lists every file in docs/', () => {
  const index = read(BACKEND, 'docs', 'README.md');
  const unlisted = filesIn(join(BACKEND, 'docs'), () => true)
    .map((f) => f.slice(join(BACKEND, 'docs').length + 1).replaceAll('\\', '/'))
    .filter((relative) => relative !== 'README.md' && !index.includes(`(${relative})`));
  assert.deepEqual(unlisted, []);
});

test('the backend README leads to the documentation', () => {
  assert.match(read(BACKEND, 'README.md'), /\(docs\/README\.md\)/);
});

test('the number of estimate test cases quoted in the docs is the real number', () => {
  const count = buildEstimateVectors().vectors.length;
  assert.ok(read(BACKEND, 'docs', 'estimate-rule.md').includes(`${count} inputs`), 'docs/estimate-rule.md quotes the wrong number');
  assert.ok(read(BACKEND, 'docs', 'README.md').includes(`${count} inputs`), 'docs/README.md quotes the wrong number');
});

test('no document contains a real secret, token or connection string', () => {
  const secretLike = [/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, /mongodb\+srv:\/\/[^\s<]+:[^\s<@]+@/, /\b[0-9a-f]{64}\b/i];
  const offenders = [];
  for (const file of [...allDocs, join(BACKEND, '.env.example')]) {
    const text = read(file);
    secretLike.forEach((pattern, i) => { if (pattern.test(text)) offenders.push(`${file.replace(REPO, '')} (pattern ${i})`); });
  }
  assert.deepEqual(offenders, []);
});
