'use strict';

// Retained-heap of a long branch() chain, before vs after squash(). Every
// fork stores a `parent` link (struct.util.ts forkFrom), so holding just the
// tip of an unsquashed chain keeps the *entire* ancestor lineage reachable —
// this measures how much memory that actually costs, and how much squash()
// gives back once the old chain becomes unreachable.
//
// Needs --expose-gc for honest, GC-forced heap readings.
//
//   node --expose-gc bench/memory.bench.js [chainLength]
//
// Two gotchas that will silently produce fake "nothing was freed" numbers
// if you copy this pattern elsewhere:
//
// 1. A bare `global.gc()` on this V8 build does not reliably force a
//    synchronous full collection before returning — use
//    `global.gc({ type: 'major', execution: 'sync' })`.
// 2. Any loop that walks the whole chain (e.g. counting depth via
//    `.parent()`) must run inside a function that RETURNS before the next
//    gc()/measurement — conservative stack scanning can keep a stray
//    in-progress loop variable looking "reachable" for the rest of the
//    enclosing (non-returned) frame, and because each node's `parent` link
//    is a *strong* reference held in the WeakMap's value (not its weakly-held
//    key), pinning even one leftover node that way transitively pins its
//    entire ancestor chain behind it too. Verified empirically: inlining the
//    depth-walk directly at top level made squash() look like it froze 0%
//    of the chain instead of the ~74% it actually frees once the walk is in
//    its own function.

const { Struct } = require('../dist/index');

if (typeof global.gc !== 'function') {
  console.error('Run with --expose-gc: node --expose-gc bench/memory.bench.js');
  process.exit(1);
}

const CHAIN_LENGTH = Number(process.argv[2]) || 200_000;

const shape = {
  id: 'acc_1',
  balance: 0,
  status: 'open',
  owner: 'alice',
  currency: 'USD',
  region: 'eu-west-1',
  tag: 'root',
  note: '',
  flags: 0,
  version: 1,
};

function heapMB() {
  global.gc({ type: 'major', execution: 'sync' });
  global.gc({ type: 'major', execution: 'sync' });
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function buildChain() {
  const Ledger = Struct.immutable(shape);
  let node = Ledger();
  let sum = 0; // forces a genuine read of each node's data, so nothing here is dead-code-eliminated
  for (let i = 1; i <= CHAIN_LENGTH; i++) {
    node = node.branch(`tx-${i}`, { balance: i, tag: `tag-${i % 16}` });
    sum += node.balance;
  }
  const expectedSum = (CHAIN_LENGTH * (CHAIN_LENGTH + 1)) / 2;
  if (sum !== expectedSum) throw new Error(`sanity check failed: sum=${sum} expected=${expectedSum}`);
  return node;
}

function walkDepth(tip) {
  let depth = 0;
  for (let n = tip; n; n = n.parent()) depth++;
  return depth;
}

const baselineMB = heapMB();

let node = buildChain();
const chainDepth = walkDepth(node);
const afterChainMB = heapMB();

const squashed = node.squash();
node = null; // drop the only strong reference to the pre-squash tip

const afterSquashMB = heapMB();
const squashedDepth = walkDepth(squashed);

const chainCostMB = afterChainMB - baselineMB;
const squashSavedMB = afterChainMB - afterSquashMB;

console.log(`chain length            = ${CHAIN_LENGTH.toLocaleString()}`);
console.log(`chain depth (.parent()) = ${chainDepth}`);
console.log(`squashed depth          = ${squashedDepth}`);
console.log('');
console.log(`heap before chain       = ${baselineMB.toFixed(2)} MB`);
console.log(`heap after chain        = ${afterChainMB.toFixed(2)} MB  (+${chainCostMB.toFixed(2)} MB)`);
console.log(`heap after squash() +gc = ${afterSquashMB.toFixed(2)} MB  (-${squashSavedMB.toFixed(2)} MB freed)`);
console.log('');
console.log(`~bytes/node retained while chained = ${((chainCostMB * 1024 * 1024) / CHAIN_LENGTH).toFixed(1)} B`);
console.log(`squash() freed ${((squashSavedMB / chainCostMB) * 100).toFixed(1)}% of the chain's heap cost`);
console.log(`lineage preserved after squash: ${squashed.lineage().length === CHAIN_LENGTH}`);
