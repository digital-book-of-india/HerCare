import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipher } from '../src/utils/cipher.util.js';

const KEY_1 = 'a1'.repeat(32);
const KEY_2 = 'b2'.repeat(32);
const KEY_3 = 'c3'.repeat(32);

const k1 = () => createCipher({ keyId: 'k1', key: KEY_1 });
const k2 = (oldKeys = [{ id: 'k1', key: KEY_1 }]) => createCipher({ keyId: 'k2', key: KEY_2, oldKeys });

// A value as the code wrote it before keys had ids: iv:tag:data.
const legacyOf = (value) => value.split(':').slice(1).join(':');

test('round trip, including empty text, accents, emoji and a full-length note', () => {
  const { encrypt, decrypt } = k1();
  for (const text of ['hello', '', 'cramps — हल्का दर्द 😴', 'x'.repeat(500)]) {
    assert.equal(decrypt(encrypt(text)), text);
  }
});

test('null and undefined pass through untouched', () => {
  const { encrypt, decrypt, needsRotation } = k1();
  assert.equal(encrypt(null), null);
  assert.equal(encrypt(undefined), undefined);
  assert.equal(decrypt(null), null);
  assert.equal(needsRotation(null), false);
});

test('the stored value names its key, and is different every time', () => {
  const { encrypt } = k1();
  const a = encrypt('same text');
  const b = encrypt('same text');
  assert.notEqual(a, b); // random IV
  assert.equal(a.split(':').length, 4);
  assert.equal(a.split(':')[0], 'k1');
  assert.ok(!a.includes('same text'));
});

test('tampering with any part is detected', () => {
  const { encrypt, decrypt } = k1();
  const [id, iv, tag, data] = encrypt('private note').split(':');
  const flip = (hex) => `${hex[0] === 'a' ? 'b' : 'a'}${hex.slice(1)}`;
  assert.throws(() => decrypt([id, iv, tag, flip(data)].join(':')));
  assert.throws(() => decrypt([id, iv, flip(tag), data].join(':')));
  assert.throws(() => decrypt([id, flip(iv), tag, data].join(':')));
});

test('a truncated authentication tag is refused (only full 16-byte tags count)', () => {
  const { encrypt, decrypt } = k1();
  const [id, iv, tag, data] = encrypt('private note').split(':');
  assert.throws(() => decrypt([id, iv, tag.slice(0, 8), data].join(':')), /Malformed/);
});

test('garbage is rejected with a clear error', () => {
  const { decrypt } = k1();
  assert.throws(() => decrypt('just plain text'), /Not an encrypted value/);
  assert.throws(() => decrypt('a:b'), /Not an encrypted value/);
  assert.throws(() => decrypt('a:b:c:d:e'), /Not an encrypted value/);
});

test('rotation: a new key reads old values and writes new ones', () => {
  const oldValue = k1().encrypt('rotate me');
  const next = k2();
  assert.equal(next.decrypt(oldValue), 'rotate me'); // still readable during the transition
  assert.equal(next.needsRotation(oldValue), true);

  const rotated = next.rotate(oldValue);
  assert.equal(rotated.split(':')[0], 'k2');
  assert.equal(next.decrypt(rotated), 'rotate me');
  assert.equal(next.needsRotation(rotated), false);
  assert.equal(next.rotate(rotated), rotated); // already current: left exactly as it is
});

test('after rotation the old key is no longer needed', () => {
  const rotated = k2().rotate(k1().encrypt('rotate me'));
  const onlyNewKey = k2([]);
  assert.equal(onlyNewKey.decrypt(rotated), 'rotate me');
});

test('removing the old key too early is caught: old values become unreadable', () => {
  const oldValue = k1().encrypt('still on the old key');
  assert.throws(() => k2([]).decrypt(oldValue), /key "k1".*not configured/);
});

test('values written before key ids existed can be read, and are rotated to the new format', () => {
  const legacy = legacyOf(k1().encrypt('from the old code'));
  assert.equal(legacy.split(':').length, 3);

  // read with the same key that is now "current"
  const sameKey = k1();
  assert.equal(sameKey.decrypt(legacy), 'from the old code');
  assert.equal(sameKey.needsRotation(legacy), true);
  assert.equal(sameKey.rotate(legacy).split(':').length, 4);

  // read with a retired key
  const nowK2 = k2();
  assert.equal(nowK2.decrypt(legacy), 'from the old code');
  assert.equal(nowK2.rotate(legacy).split(':')[0], 'k2');
});

test('a legacy value that no configured key fits is refused', () => {
  const legacy = legacyOf(k1().encrypt('secret'));
  const stranger = createCipher({ keyId: 'k9', key: KEY_3 });
  assert.throws(() => stranger.decrypt(legacy), /could not be decrypted/);
});

test('a value under an unknown key id is refused without revealing anything', () => {
  const foreign = createCipher({ keyId: 'k9', key: KEY_3 }).encrypt('secret');
  assert.throws(() => k2().decrypt(foreign), (err) => /k9/.test(err.message) && !/secret/.test(err.message));
});

test('two rotations in a row (k1 -> k2 -> k3) keep every value readable', () => {
  const v1 = k1().encrypt('journey');
  const v2 = k2().rotate(v1);
  const k3 = createCipher({ keyId: 'k3', key: KEY_3, oldKeys: [{ id: 'k2', key: KEY_2 }, { id: 'k1', key: KEY_1 }] });
  const v3 = k3.rotate(v2);
  assert.equal(v3.split(':')[0], 'k3');
  assert.equal(k3.decrypt(v3), 'journey');
  assert.equal(k3.decrypt(v1), 'journey'); // even a value nobody rotated yet
});

test('configuration mistakes are refused', () => {
  assert.throws(() => createCipher({ keyId: 'k1', key: 'short' }), /64 hex/);
  assert.throws(() => createCipher({ keyId: 'bad:id', key: KEY_1 }), /key id/);
  assert.throws(() => createCipher({ keyId: '', key: KEY_1 }), /key id/);
  assert.throws(() => createCipher({ keyId: 'k1', key: KEY_1, oldKeys: [{ id: 'k1', key: KEY_2 }] }), /used twice/);
  assert.throws(() => createCipher({ keyId: 'k2', key: KEY_2, oldKeys: [{ id: 'k1', key: 'nothex' }] }), /64 hex/);
});
