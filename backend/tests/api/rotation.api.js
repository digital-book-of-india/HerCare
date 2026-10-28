// Encryption key rotation, run for real: the actual `npm run rotate-key` script against the
// actual database, using a throwaway "old key" and "new key". Needs no running server.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const load = (p) => import(pathToFileURL(join(ROOT, 'src', p)).href);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const { default: connectDB } = await load('config/db.config.js');
await connectDB();
const { createCipher } = await load('utils/cipher.util.js');
const { encryptedFields } = await load('services/keyRotation.service.js');
const { default: PeriodRecord } = await load('models/periodRecord.model.js');
const { default: SymptomLog } = await load('models/symptomLog.model.js');
const { deleteUserData } = await load('services/userData.service.js');
await load('services/syncPush.service.js'); // registers every user-owned model

// The data starts on the key this environment uses (so notes written by the app itself are part of
// the test) and is rotated to a throwaway new key. The real key is only handed to the child
// process as its "retired key"; it is never printed.
const oldKey = process.env.ENCRYPTION_KEY;
const oldKeyId = process.env.ENCRYPTION_KEY_ID || 'k1';
const newKey = randomBytes(32).toString('hex');
const strangerKey = randomBytes(32).toString('hex');
const oldCipher = createCipher({ keyId: oldKeyId, key: oldKey });
const newCipher = createCipher({ keyId: 'k2', key: newKey, oldKeys: [{ id: oldKeyId, key: oldKey }] });
const stranger = createCipher({ keyId: 'k9', key: strangerKey });

const { ObjectId } = PeriodRecord.base.Types;
const user = new ObjectId();
const userHex = String(user);
const SECRETS = ['rotation note one', 'a note from the old code', 'symptom note on old key', 'note after rotation', 'unknown key note'];
const before = new Date('2026-01-01T00:00:00.000Z');

// Run the real script as its own process, configured as an operator would after a key change.
const allOutput = []; // everything the script ever printed, searched for note text at the end
const rotate = (flags, { keepOldKey = true } = {}) => {
  const env = { ...process.env, ENCRYPTION_KEY: newKey, ENCRYPTION_KEY_ID: 'k2', ENCRYPTION_KEYS_OLD: keepOldKey ? `${oldKeyId}:${oldKey}` : '' };
  const run = spawnSync(process.execPath, ['src/scripts/rotateKey.script.js', ...flags], { cwd: ROOT, env, encoding: 'utf8' });
  const out = `${run.stdout}${run.stderr}`;
  allOutput.push(out);
  return { code: run.status, out };
};
const rawNote = async (model, id, field) => (await model.collection.findOne({ _id: id }))[field];

const period = (extra) => ({
  user, startDate: '2024-05-01', endDate: '2024-05-05', source: 'actual', deletedAt: null,
  createdAt: before, updatedAt: before, clientUpdatedAt: before, ...extra,
});
const symptom = (date, extra) => ({
  user, date, symptoms: [], flow: null, mood: null, energy: null, deletedAt: null,
  createdAt: before, updatedAt: before, clientUpdatedAt: before, ...extra,
});

try {
  // ---- which fields get rotated is discovered from the models, not from a hand-kept list
  const fields = encryptedFields().map((f) => `${f.model.modelName}.${f.path}`).sort();
  check('the encrypted fields are discovered automatically: PeriodRecord.notes and SymptomLog.note', JSON.stringify(fields) === JSON.stringify(['PeriodRecord.notes', 'SymptomLog.note']), JSON.stringify(fields));

  // ---- the app itself writes the new format
  const viaApp = await PeriodRecord.create({ user, startDate: '2023-01-01', notes: 'note after rotation' });
  const stored = await rawNote(PeriodRecord, viaApp._id, 'notes');
  check('notes written by the app carry their key id (keyId:iv:tag:data)', stored.split(':').length === 4 && stored.startsWith(`${oldKeyId}:`) && !stored.includes('note after rotation'), stored.slice(0, 30));
  check('and read back as plain text through the model', (await PeriodRecord.findById(viaApp._id)).notes === 'note after rotation');

  // ---- data as it was before the rotation: three flavours of "old"
  const p1 = (await PeriodRecord.collection.insertOne(period({ startDate: '2024-01-01', notes: oldCipher.encrypt('rotation note one') }))).insertedId;
  const legacyValue = oldCipher.encrypt('a note from the old code').split(':').slice(1).join(':');
  const p2 = (await PeriodRecord.collection.insertOne(period({ startDate: '2024-02-01', notes: legacyValue }))).insertedId;
  const p3 = (await PeriodRecord.collection.insertOne(period({ startDate: '2024-03-01' }))).insertedId; // no note at all
  const p4 = (await PeriodRecord.collection.insertOne(period({ startDate: '2024-04-01', notes: null }))).insertedId;
  const s1 = (await SymptomLog.collection.insertOne(symptom('2024-05-01', { note: oldCipher.encrypt('symptom note on old key') }))).insertedId;
  const originals = { p1: await rawNote(PeriodRecord, p1, 'notes'), p2: await rawNote(PeriodRecord, p2, 'notes'), s1: await rawNote(SymptomLog, s1, 'note') };

  // ---- verify, before rotating: must say work is outstanding
  let run = rotate(['--verify']);
  check('--verify before rotating: exits 1 and says values are still on an old key', run.code === 1 && /still on an old key/.test(run.out), run.out.slice(-400));
  check('the output counts the values to rotate (4: two period notes + the app\'s own + one symptom note)', /PeriodRecord\.notes: scanned 3, already on k2: 0, to rotate: 3/.test(run.out) && /SymptomLog\.note: scanned 1, already on k2: 0, to rotate: 1/.test(run.out), run.out.slice(-600));

  // ---- dry run: reports, changes nothing
  run = rotate([]);
  check('dry run exits 0 and says what it would do', run.code === 0 && /would be re-encrypted/.test(run.out) && /dry run/.test(run.out), run.out.slice(-400));
  check('dry run changed nothing in the database', (await rawNote(PeriodRecord, p1, 'notes')) === originals.p1 && (await rawNote(PeriodRecord, p2, 'notes')) === originals.p2 && (await rawNote(SymptomLog, s1, 'note')) === originals.s1);

  // ---- apply
  run = rotate(['--apply']);
  check('--apply exits 0 and rotates all 4 values', run.code === 0 && /PeriodRecord\.notes: .*rotated: 3/.test(run.out) && /SymptomLog\.note: .*rotated: 1/.test(run.out), run.out.slice(-500));
  const rotated = { p1: await rawNote(PeriodRecord, p1, 'notes'), p2: await rawNote(PeriodRecord, p2, 'notes'), s1: await rawNote(SymptomLog, s1, 'note'), app: await rawNote(PeriodRecord, viaApp._id, 'notes') };
  check('every rotated value now names the new key (k2) and has the 4-part format', Object.values(rotated).every((v) => v.split(':').length === 4 && v.startsWith('k2:')), JSON.stringify(Object.values(rotated).map((v) => v.slice(0, 4))));
  check('the text is unchanged: each value decrypts to what was written', newCipher.decrypt(rotated.p1) === 'rotation note one' && newCipher.decrypt(rotated.p2) === 'a note from the old code' && newCipher.decrypt(rotated.s1) === 'symptom note on old key' && newCipher.decrypt(rotated.app) === 'note after rotation');
  check('even the old-code (no key id) value was brought into the new format', originals.p2.split(':').length === 3 && rotated.p2.split(':').length === 4);
  const doc = await PeriodRecord.collection.findOne({ _id: p1 });
  check('timestamps were NOT touched (sync clients see no change)', doc.updatedAt.getTime() === before.getTime() && doc.clientUpdatedAt.getTime() === before.getTime());
  const untouched = await PeriodRecord.collection.findOne({ _id: p3 });
  const nulled = await PeriodRecord.collection.findOne({ _id: p4 });
  check('records with no note, or a null note, are left alone', !('notes' in untouched) && nulled.notes === null);
  check('the old key can no longer decrypt the rotated values', (() => { try { oldCipher.decrypt(rotated.p1); return false; } catch { return true; } })());

  // ---- verify and idempotence
  run = rotate(['--verify']);
  check('--verify after rotating: exits 0, everything readable and current', run.code === 0 && /Every encrypted value is readable and on the current key/.test(run.out), run.out.slice(-300));
  run = rotate(['--apply']);
  check('running --apply again rotates nothing (safe to repeat)', run.code === 0 && /rotated: 0/.test(run.out) && (await rawNote(PeriodRecord, p1, 'notes')) === rotated.p1);

  // ---- removing the old key too soon is detected, not silently accepted
  const late = (await PeriodRecord.collection.insertOne(period({ startDate: '2024-06-01', notes: oldCipher.encrypt('rotation note one') }))).insertedId;
  run = rotate(['--verify'], { keepOldKey: false });
  check('--verify without the old key: exits 1 and warns not to remove any old key', run.code === 1 && /cannot be read/.test(run.out) && /Do NOT remove any old key/.test(run.out), run.out.slice(-400));
  check('and it names the entry that could not be read (by id, not by content)', run.out.includes(String(late)) && !SECRETS.some((s) => run.out.includes(s)));
  const lateBefore = await rawNote(PeriodRecord, late, 'notes');
  run = rotate(['--apply'], { keepOldKey: false });
  check('--apply without the old key exits 1 and leaves the unreadable value untouched', run.code === 1 && (await rawNote(PeriodRecord, late, 'notes')) === lateBefore);
  run = rotate(['--apply']);
  check('once the old key is configured again, it finishes the job', run.code === 0 && (await rawNote(PeriodRecord, late, 'notes')).startsWith('k2:'));

  // ---- damaged and foreign values: reported, never crash the run, never altered
  const tampered = oldCipher.encrypt('unknown key note').split(':');
  tampered[3] = `${tampered[3][0] === 'a' ? 'b' : 'a'}${tampered[3].slice(1)}`;
  const bad1 = (await SymptomLog.collection.insertOne(symptom('2024-06-02', { note: tampered.join(':') }))).insertedId;
  const bad2 = (await SymptomLog.collection.insertOne(symptom('2024-06-03', { note: stranger.encrypt('unknown key note') }))).insertedId;
  const bad3 = (await SymptomLog.collection.insertOne(symptom('2024-06-04', { note: 'plain text that was never encrypted' }))).insertedId;
  const damaged = { bad1: await rawNote(SymptomLog, bad1, 'note'), bad2: await rawNote(SymptomLog, bad2, 'note'), bad3: await rawNote(SymptomLog, bad3, 'note') };
  run = rotate(['--apply']);
  check('a tampered value, a value from an unknown key and an unencrypted value are all reported (3 unreadable)', run.code === 1 && /unreadable: 3/.test(run.out), run.out.slice(-500));
  check('each is listed by id', [bad1, bad2, bad3].every((id) => run.out.includes(String(id))));
  check('none of them was changed', (await rawNote(SymptomLog, bad1, 'note')) === damaged.bad1 && (await rawNote(SymptomLog, bad2, 'note')) === damaged.bad2 && (await rawNote(SymptomLog, bad3, 'note')) === damaged.bad3);
  check('the good values in the same run were still handled', (await rawNote(PeriodRecord, p1, 'notes')) === rotated.p1);

  // ---- nothing readable ever leaves the script
  const everything = allOutput.join('\n');
  check(`no note text appears anywhere in the ${allOutput.length} runs' output`, allOutput.length >= 8 && !SECRETS.some((s) => everything.includes(s)) && !everything.includes('never encrypted') && !everything.includes(oldKey) && !everything.includes(newKey));
} catch (err) {
  fail += 1;
  console.log('FAIL  script crashed:', err.stack);
} finally {
  await deleteUserData(userHex);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
