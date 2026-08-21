import type { StructFactory, StructInstance } from "../src/struct";
import { Struct } from '../src/index';

type Ledger = {
  'account-id': string;
  balance: number;
  'big-history': number[];
};

function main() {
  const bigHistory = new Array(1_000_000).fill(0).map((_, i) => i);

  const Ledger = Struct.immutable<Ledger>({
    'account-id': 'acc_1',
    balance: 0,
    'big-history': bigHistory,
  });

  const root = Ledger();
  console.log('root immutable?', root.isImmutable());

  const afterDeposit = root.assoc('balance', 100);
  console.log('\n-- structural sharing (default: chained-frozen) --');
  console.log('diff()                          =', afterDeposit.diff());
  console.log(
    'same big-history reference?    =',
    afterDeposit.get('big-history') === root.get('big-history'),
  );

  // -- squash --------------------------------------------------------------
  console.log('\n-- squash --');
  let chained = root;
  for (let i = 1; i <= 500; i++) chained = chained.branch(`tx-${i}`, { balance: i });

  let depth = 0;
  for (let n: StructInstance<Ledger> | null = chained; n; n = n.parent()) depth++;
  console.log('depth before squash =', depth); // 501: root + 500 forks

  const squashed = chained.squash();
  let depthAfter = 0;
  for (let n: StructInstance<Ledger> | null = squashed; n; n = n.parent()) depthAfter++;
  console.log('depth after squash  =', depthAfter); // 1: fresh root, old chain now unreachable
  console.log('lineage preserved?  =', squashed.lineage().length === 500);
  console.log('lineage tail        =', squashed.lineage().slice(-3));
  console.log('data still correct? =', squashed.get('balance') === chained.get('balance'));
  console.log('squashed root?()    =', squashed.isRoot());

  // -- swappable backend: same contract, different storage strategy --------
  console.log('\n-- backend swap --');
  const Fast = Struct.backends.chainedFast<Ledger>({ 'account-id': 'acc_2', balance: 0, 'big-history': [] });
  const fast = Fast();
  const fastChild = fast.assoc('balance', 42);
  console.log('fast backend result =', fastChild.get('balance'));

  // chained-fast instances stay writable (not frozen), unlike chained-frozen.
  (fastChild as unknown as Ledger).balance = -1;
  console.log('chained-fast instance mutated in place ->', fastChild.get('balance'));

  const Snapshot = Struct.backends.snapshot<Ledger>({ 'account-id': 'acc_3', balance: 0, 'big-history': [] });
  const snapChild = Snapshot().assoc('balance', 7);
  console.log('snapshot backend diff() (only what changed at this step) =', snapChild.diff());

  // -- V8 hidden class: every instance of a given factory shares one map ---
  console.log('\n-- hidden class stability --');
  const Tx = Struct.immutable<Ledger>({ 'account-id': 'acc_4', balance: 0, 'big-history': [] });
  let hot = Tx();
  for (let i = 0; i < 5; i++) hot = hot.fork({ balance: i });
  console.log('same shape after 5 forks (own keys) =', Object.keys(hot).length === 3);

  // -- perf: freeze vs no-freeze, same contract -----------------------------
  console.log('\n-- perf: 20k forks, chained-frozen vs chained-fast vs snapshot --');
  const N = 20_000;

  function bench(label: string, factory: StructFactory<Ledger>) {
    let node = factory();
    const start = performance.now();
    for (let i = 0; i < N; i++) node = node.assoc('balance', i);
    const ms = performance.now() - start;
    console.log(`${label.padEnd(16)} ${ms.toFixed(1)}ms`);
  }

  bench('chained-frozen', Struct.backends.chainedFrozen<Ledger>({ 'account-id': 'x', balance: 0, 'big-history': [] }));
  bench('chained-fast', Struct.backends.chainedFast<Ledger>({ 'account-id': 'x', balance: 0, 'big-history': [] }));
  bench('snapshot', Struct.backends.snapshot<Ledger>({ 'account-id': 'x', balance: 0, 'big-history': [] }));
}

main();
