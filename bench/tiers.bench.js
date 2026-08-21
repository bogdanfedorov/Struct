'use strict';

// Single-process workload, run once per V8 tier configuration by
// run-tiers.js. Not a node:test spec — it prints one machine-readable
// "RESULT {...}" line and exits.
//
//   node [--no-turbofan|--turbofan] [--no-maglev|--maglev] bench/tiers.bench.js <label>

const { Struct } = require('../dist/index');

const label = process.argv[2] || 'unlabeled';

// V8 only tiers a function up to Maglev/TurboFan after enough call-count
// "warmth" — keep warmup well above the interpreter->optimizing thresholds
// so the measured loop actually runs on whichever tier this process allows,
// not on the interpreter/Sparkplug baseline every configuration shares.
const WARMUP = 100_000;
const ITERATIONS = 500_000;

function benchAssoc() {
  const Ledger = Struct.immutable({ 'account-id': 'acc_1', balance: 0, tag: 'root' });
  let node = Ledger();

  for (let i = 0; i < WARMUP; i++) node = node.assoc('balance', i);

  const start = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i++) node = node.assoc('balance', i);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  return { name: 'assoc', ms: elapsedMs, checksum: node.balance };
}

function benchForkChain() {
  const Ledger = Struct.immutable({ 'account-id': 'acc_1', balance: 0, tag: 'root' });
  let node = Ledger();

  for (let i = 0; i < WARMUP; i++) node = node.fork({ balance: i, tag: `tx-${i % 8}` });

  const start = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i++) node = node.fork({ balance: i, tag: `tx-${i % 8}` });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  return { name: 'fork', ms: elapsedMs, checksum: node.balance };
}

const results = [benchAssoc(), benchForkChain()].map((r) => ({
  label,
  bench: r.name,
  iterations: ITERATIONS,
  ms: Number(r.ms.toFixed(2)),
  opsPerSec: Math.round((ITERATIONS / r.ms) * 1000),
  checksum: r.checksum,
}));

for (const r of results) console.log(`RESULT ${JSON.stringify(r)}`);
