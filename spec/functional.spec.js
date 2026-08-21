'use strict';

// Functional correctness of the data structure itself (not hidden-class shape).
// Run `npm run build` first, then: node --test spec/functional.spec.js

const test = require('node:test');
const assert = require('node:assert/strict');
const { Struct } = require('../dist/index');

test('assoc() forks with one field changed and leaves the parent untouched', () => {
  const Ledger = Struct.immutable({ id: 'a', balance: 0 });
  const root = Ledger();
  const child = root.assoc('balance', 100);

  assert.equal(child.balance, 100);
  assert.equal(root.balance, 0);
  assert.equal(child.parent(), root);
});

test('fork() applies multiple overrides at once', () => {
  const Ledger = Struct.immutable({ id: 'a', balance: 0, status: 'open' });
  const root = Ledger();
  const child = root.fork({ balance: 5, status: 'closed' });

  assert.deepEqual(child.toObject(), { id: 'a', balance: 5, status: 'closed' });
});

test('diff() reports only the fields changed at that step, not the full state', () => {
  const Ledger = Struct.immutable({ id: 'a', balance: 0, status: 'open' });
  const root = Ledger();
  const child = root.fork({ balance: 5 });

  assert.deepEqual(child.diff(), { balance: 5 });
  assert.deepEqual(root.diff(), { id: 'a', balance: 0, status: 'open' });
});

test('branch() records the name in lineage(), fork() does not', () => {
  const Ledger = Struct.immutable({ id: 'a', balance: 0 });
  const root = Ledger();
  const branched = root.branch('tx-1', { balance: 1 });
  const forked = branched.fork({ balance: 2 });

  assert.deepEqual(branched.lineage(), ['tx-1']);
  assert.deepEqual(forked.lineage(), ['tx-1']);
  assert.equal(branched.isBranch(), true);
  assert.equal(forked.isBranch(), false);
});

test('squash() collapses ancestry but keeps data and lineage names', () => {
  const Ledger = Struct.immutable({ id: 'a', balance: 0 });
  let node = Ledger();
  for (let i = 1; i <= 5; i++) node = node.branch(`tx-${i}`, { balance: i });

  const squashed = node.squash();

  assert.equal(squashed.parent(), null);
  assert.equal(squashed.isRoot(), true);
  assert.equal(squashed.balance, node.balance);
  assert.deepEqual(squashed.lineage(), node.lineage());
});

test('get() returns a set value and throws with the key name when unset', () => {
  const Ledger = Struct.immutable({ id: 'a', balance: 0 });
  const root = Ledger();

  assert.equal(root.get('balance'), 0);
  assert.throws(() => root.get('missing'), /missing/);
});

test('eq() is reference equality, equal() is structural equality', () => {
  const Ledger = Struct.immutable({ id: 'a', balance: 0 });
  const root = Ledger();
  const sameData = Ledger();
  const child = root.assoc('balance', 1);

  assert.equal(root.eq(root), true);
  assert.equal(root.eq(sameData), false);
  assert.equal(root.equal(sameData), true);
  assert.equal(root.equal(child), false);
});

test('isImmutable() reflects the actual backend, not a hardcoded value', () => {
  const Frozen = Struct.immutable({ id: 'a', balance: 0 });
  const Fast = Struct.backends.chainedFast({ id: 'a', balance: 0 });

  const frozen = Frozen();
  const fast = Fast();

  assert.equal(frozen.isImmutable(), true);
  assert.equal(fast.isImmutable(), false);

  assert.throws(() => {
    frozen.balance = 999;
  });
  fast.balance = 999;
  assert.equal(fast.balance, 999);
});

test('a fresh root from a factory is its own root with no lineage', () => {
  const Ledger = Struct.immutable({ id: 'a', balance: 0 });
  const root = Ledger();

  assert.equal(root.isRoot(), true);
  assert.equal(root.parent(), null);
  assert.deepEqual(root.lineage(), []);
});
