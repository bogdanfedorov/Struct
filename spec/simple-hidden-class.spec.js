'use strict';

// Exercises the REAL compiled library (not a reimplementation) — run
// `npm run build` first, then:
//   node --allow-natives-syntax --test spec/simple-hidden-class.spec.js

const test = require('node:test');
const assert = require('node:assert/strict');
const { Struct } = require('../dist/index');

function sameMap(a, b) {
  return %HaveSameMap(a, b);
}

test('Hidden classes are the same for identical property shapes', () => {
  const Transaction = Struct.immutable({ 'account-id': 'acc_1', balance: 0 });

  const t = Transaction({ balance: 1 });
  const t2 = Transaction({ balance: 2 });
  assert.equal(sameMap(t, t2), true);
});

test('Hidden classes are different for different property shapes', () => {
  const Transaction = Struct.immutable({ 'account-id': 'acc_1', balance: 0 });

  const t = Transaction({ balance: 1 });
  const t2 = Transaction({ balance: 2, status: 'pending' });
  assert.equal(sameMap(t, t2), false);
});

test('Hidden classes are different for different property shapes (chained backend)', () => {
  const Transaction = Struct.backends.chainedFrozen({ 'account-id': 'acc_1', balance: 0 });

  const t = Transaction({ balance: 1 });
  const t2 = t.fork({ balance: 2, status: 'pending' });
  assert.equal(sameMap(t, t2), false);
});

test('Hidden classes stay the same across fork() when the shape does not change', () => {
  const Transaction = Struct.backends.chainedFrozen({ 'account-id': 'acc_1', balance: 0 });

  const t = Transaction({ balance: 1 });
  const t2 = t.fork({ balance: 2 });
  assert.equal(sameMap(t, t2), true);
});
