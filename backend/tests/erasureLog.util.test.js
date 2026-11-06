import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseErasureLog, erasuresToReapply } from '../src/utils/erasureLog.util.js';

const idA = 'a'.repeat(24);
const idB = 'b'.repeat(24);

const LOG = [
  '[2026-10-28T07:00:00.000Z] INFO Server listening on port 5000',
  `[2026-10-28T07:05:00.000Z] INFO erasure: user=${idA} at=2026-10-28T07:05:00.000Z`,
  '[2026-10-28T07:06:00.000Z] WARN security: failed admin login',
  `[2026-10-29T09:00:00.000Z] INFO erasure: user=${idB} at=2026-10-29T09:00:00.000Z`,
  `[2026-10-30T10:00:00.000Z] INFO erasure: user=${idA} at=2026-10-30T10:00:00.000Z`,
  'erasure: user=not-an-id at=2026-10-30T10:00:00.000Z',
  `erasure: user=${idB} at=garbage`,
].join('\n');

test('finds every valid erasure line and ignores everything else', () => {
  const entries = parseErasureLog(LOG);
  assert.deepEqual(entries.map((e) => e.userId).sort(), [idA, idB].sort());
});

test('keeps only the newest erasure per user, oldest first', () => {
  const entries = parseErasureLog(LOG);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].userId, idB); // 2026-10-29
  assert.equal(entries[1].userId, idA); // newest of A is 2026-10-30
  assert.equal(entries[1].at.toISOString(), '2026-10-30T10:00:00.000Z');
});

test('an empty or unrelated log yields nothing', () => {
  assert.deepEqual(parseErasureLog(''), []);
  assert.deepEqual(parseErasureLog('nothing to see here'), []);
  assert.deepEqual(parseErasureLog(undefined), []);
});

test('only erasures after the backup are repeated', () => {
  const entries = parseErasureLog(LOG);
  const after = (iso) => erasuresToReapply(entries, new Date(iso)).map((e) => e.userId);
  assert.deepEqual(after('2026-10-01T00:00:00Z'), [idB, idA]); // backup older than every erasure
  assert.deepEqual(after('2026-10-29T12:00:00Z'), [idA]); // B's erasure is already inside the backup
  assert.deepEqual(after('2026-11-01T00:00:00Z'), []); // backup newer than all of them
});

test('an erasure at exactly the backup time is treated as already included', () => {
  const entries = parseErasureLog(LOG);
  assert.deepEqual(erasuresToReapply(entries, new Date('2026-10-30T10:00:00.000Z')), []);
});
