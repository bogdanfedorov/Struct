'use strict';

// Deeper hidden-class coverage against the REAL compiled library — run
// `npm run build` first, then:
//   node --allow-natives-syntax --test spec/hidden-class.spec.js

const test = require('node:test');
const assert = require('node:assert/strict');
const { Struct } = require('../dist/index');

function sameMap(a, b) {
  return %HaveSameMap(a, b);
}

test('a long fork() lineage stays on one shared hidden class, checked pairwise across all nodes', () => {
  const CHAIN_LENGTH = 30;
  const Ledger = Struct.immutable({ 'account-id': 'acc_1', balance: 0, tag: 'root' });

  let node = Ledger();
  const nodes = [node];
  for (let i = 1; i <= CHAIN_LENGTH; i++) {
    node = node.fork(i % 2 === 0 ? { balance: i } : { tag: `tx-${i}` });
    nodes.push(node);
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      assert.equal(sameMap(nodes[i], nodes[j]), true, `node #${i} and #${j} do not share a hidden class`);
    }
  }
});

test('independent roots from the same factory share a hidden class with forked descendants too', () => {
  const Ledger = Struct.immutable({ 'account-id': 'acc_1', balance: 0 });

  const rootA = Ledger();
  const rootB = Ledger({ balance: 5 });
  const forkedA = rootA.fork({ balance: 1 }).fork({ balance: 2 });

  assert.equal(sameMap(rootA, rootB), true);
  assert.equal(sameMap(rootA, forkedA), true);
  assert.equal(sameMap(rootB, forkedA), true);
});

test('branch() preserves the shared hidden class the same way fork() does', () => {
  const Ledger = Struct.immutable({ 'account-id': 'acc_1', balance: 0 });

  const root = Ledger();
  const branched = root.branch('tx-1', { balance: 1 }).branch('tx-2', { balance: 2 });

  assert.equal(sameMap(root, branched), true);
  assert.equal(branched.lineage().length, 2);
});

test('squash() produces an instance that still shares the hidden class', () => {
  const Ledger = Struct.immutable({ 'account-id': 'acc_1', balance: 0 });

  let node = Ledger();
  for (let i = 1; i <= 10; i++) node = node.branch(`tx-${i}`, { balance: i });
  const squashed = node.squash();

  assert.equal(sameMap(node, squashed), true);
  assert.equal(squashed.isRoot(), true);
  assert.equal(squashed.lineage().length, 10);
});

test('the shared hidden class breaks the moment a NEW key is introduced', () => {
  const Ledger = Struct.immutable({ 'account-id': 'acc_1', balance: 0 });

  const a = Ledger();
  const b = a.fork({ balance: 1 });
  const c = a.fork({ balance: 1, note: 'late fee' });

  assert.equal(sameMap(a, b), true);
  assert.equal(sameMap(a, c), false);
});

test('two independent factories over the same shape do NOT share a hidden class (different prototypes)', () => {
  const LedgerA = Struct.immutable({ 'account-id': 'acc_1', balance: 0 });
  const LedgerB = Struct.immutable({ 'account-id': 'acc_1', balance: 0 });

  assert.equal(sameMap(LedgerA(), LedgerB()), false);
});
