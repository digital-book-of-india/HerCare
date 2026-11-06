import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findUnsafeKey } from '../src/utils/unsafeKeys.util.js';

test('clean payloads pass', () => {
  assert.equal(findUnsafeKey({ startDate: '2024-05-01', symptoms: ['cramps'], nested: { a: [{ b: 1 }] } }), null);
  assert.equal(findUnsafeKey({ changes: { periods: [{ id: 'a'.repeat(24), notes: null }] } }), null);
  assert.equal(findUnsafeKey(null), null);
  assert.equal(findUnsafeKey('text'), null);
  assert.equal(findUnsafeKey([]), null);
  assert.equal(findUnsafeKey({}), null);
});

test('MongoDB operator keys are found at any depth', () => {
  assert.equal(findUnsafeKey({ identifier: { $ne: '' } }), '$ne');
  assert.equal(findUnsafeKey({ $where: '1' }), '$where');
  assert.equal(findUnsafeKey({ a: { b: [{ c: { $gt: 1 } }] } }), '$gt');
});

test('dotted keys (path injection) are found', () => {
  assert.equal(findUnsafeKey({ 'profile.role': 'admin' }), 'profile.role');
  assert.equal(findUnsafeKey({ a: [{ 'b.c': 1 }] }), 'b.c');
});

test('prototype-pollution keys are found, even as own properties from JSON.parse', () => {
  assert.equal(findUnsafeKey(JSON.parse('{"__proto__": {"admin": true}}')), '__proto__');
  assert.equal(findUnsafeKey({ constructor: { prototype: {} } }), 'constructor');
  assert.equal(findUnsafeKey({ a: { prototype: 1 } }), 'prototype');
});

test('a dollar sign or dot in a VALUE is fine', () => {
  assert.equal(findUnsafeKey({ note: 'cost $5.00', label: 'a.b.c' }), null);
});

test('very deep nesting is refused without overflowing the stack', () => {
  let deep = { end: true };
  for (let i = 0; i < 100_000; i += 1) deep = { next: deep };
  assert.equal(findUnsafeKey(deep), '(nested too deeply)');
});
