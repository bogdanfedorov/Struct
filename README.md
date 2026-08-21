# Struct

Immutable, versioned structural records for TypeScript/V8 — `fork`/`branch`/`lineage`
over plain data, with a hard guarantee that every instance a factory produces
stays on **one V8 hidden class**, no matter how deep the fork chain gets.

```ts
import { Struct } from 'struct';

type Ledger = { 'account-id': string; balance: number };

const Ledger = Struct.immutable<Ledger>({ 'account-id': 'acc_1', balance: 0 });

const root = Ledger();
const afterDeposit = root.assoc('balance', 100);

afterDeposit.diff();       // { balance: 100 } — only what changed
afterDeposit.toObject();   // { 'account-id': 'acc_1', balance: 100 }
afterDeposit.parent() === root; // true
```

## Why

A naive "immutable record via `Object.create(parentHandle)` prototype chain"
gives you cheap forks and structural sharing of unchanged fields, but every
node ends up on its **own** V8 hidden class — the prototype pointer is part
of a hidden class's identity, so a long fork chain is megamorphic from the
JIT's perspective.

`Struct` instances are flat: each fork's own-enumerable keys are exactly `T`'s
keys, and every instance produced by one `Struct.immutable(shape)` /
`Struct.backends.*(shape)` call shares **one** prototype object (holding
`get`/`assoc`/`fork`/...). Same prototype + same own-key set, every time =
same hidden class, for the whole lineage. Verified empirically in
[`spec/`](./spec) via V8's `%HaveSameMap` intrinsic.

## API

```ts
Struct.immutable<T>(shape: T): StructFactory<T>
Struct.backends.chainedFrozen<T>(shape: T): StructFactory<T> // frozen (default)
Struct.backends.chainedFast<T>(shape: T): StructFactory<T>   // mutable, not frozen
Struct.backends.snapshot<T>(shape: T): StructFactory<T>      // frozen

type StructFactory<T> = (overrides?: Partial<T>) => StructInstance<T>;
```

Each `StructInstance<T>` is `T` plus:

| method | |
|---|---|
| `get(key)` | read a field, throws if unset |
| `assoc(key, value)` | fork with one field changed |
| `fork(overrides?)` | fork with several fields changed |
| `branch(name, overrides?)` | fork and record `name` in the lineage |
| `parent()` | the instance this one was forked from, or `null` |
| `lineage()` | branch names from root to here |
| `diff()` | only the fields that changed at this step |
| `toObject()` | the full flattened data |
| `squash()` | collapse the lineage into a fresh root, lineage preserved |
| `isRoot()` / `isBranch()` | position in the lineage |
| `eq(other)` / `equal(other)` | reference vs. structural equality |

## Benchmarks

Real numbers, not just the hidden-class claim. `bench/run-tiers.js` runs the
same workloads in 4 separate `node` processes, one per V8 optimizing-compiler
configuration — tiering can't be toggled mid-process, so each row below is a
fresh process with those flags:

| config | flags | what it means |
|---|---|---|
| `no-opt` | `--no-turbofan --no-maglev` | Ignition (interpreter) + Sparkplug (baseline JIT) only, no optimizing compiler ever kicks in |
| `maglev-only` | `--no-turbofan --maglev` | can tier up to Maglev, never to TurboFan |
| `turbofan-only` | `--turbofan --no-maglev` | skips Maglev, tiers straight to TurboFan |
| `turbofan+maglev` | `--turbofan --maglev` | default pipeline, both enabled |

Each config: 100k-iteration warmup (to actually reach the allowed tier before
timing), then 500k measured iterations, repeated 5x per config with the
**median** reported and `[min–max]` shown so the noise is visible instead of
hidden. Run it yourself with `npm run bench` (or `BENCH_REPEATS=10 npm run
bench` for more samples); `npm run bench:no-opt` / `bench:maglev` /
`bench:turbofan` / `bench:turbofan-maglev` run one config each.

Measured on: `node v26.4.0`, x64, Intel(R) Core(TM) Ultra 7 155H.

```
assoc() — 500,000 iterations, after warmup
config            median ms   [min–max]           ops/sec       vs no-opt
no-opt            4249.54     [4164.1–4530.7]     117,660       1.00x
maglev-only       3578.17     [3427.0–3605.0]     139,736       1.19x
turbofan-only     2526.21     [2510.2–2532.3]     197,925       1.68x
turbofan+maglev   2984.09     [2520.5–3146.1]     167,555       1.42x

fork() — 500,000 iterations, after warmup
config            median ms   [min–max]           ops/sec       vs no-opt
no-opt            3484.95     [3450.6–3612.0]     143,474       1.00x
maglev-only       4528.30     [2504.9–4612.4]     110,417       0.77x
turbofan-only     3980.44     [3533.7–4227.8]     125,614       0.88x
turbofan+maglev   3817.62     [2142.9–4051.1]     130,972       0.91x

assoc-chainedFast() — 500,000 iterations, after warmup
config            median ms   [min–max]           ops/sec       vs no-opt
no-opt            1495.06     [1357.5–1599.3]     334,435       1.00x
maglev-only       793.49      [774.3–2923.0]      630,128       1.88x
turbofan-only     325.78      [317.4–336.3]       1,534,778     4.59x
turbofan+maglev   322.57      [299.9–2034.1]      1,550,051     4.63x
```

Read this honestly, not as a clean story:

- **`assoc()`** (one field changed) scales the way you'd expect: each tier is
  faster than the one below it, TurboFan gives the biggest single jump
  (~1.7x over no-opt), and the huge win is the *frozen vs. unfrozen backend*
  gap — `chainedFast` under TurboFan is **4.6x faster than the same op on
  `no-opt`**, because skipping `Object.freeze`/`defineProperties` matters far
  more than which JIT tier is running.
- **`fork()`** (multiple overrides + a template-string field) does **not**
  scale cleanly — `maglev-only` and even `turbofan+maglev` measured *below*
  the `no-opt` baseline in this run, with wide `[min–max]` spreads (up to
  ~2x between the fastest and slowest rep of the same config). This is a
  real, reproduced pattern here, not a typo: `fork`'s `{ ...current,
  ...overrides }` spread plus per-call string allocation is GC/allocation-bound
  enough that JIT tier stops being the dominant cost, and template literals
  and megamorphic spread sites are known to resist TurboFan inlining in some
  V8 versions. Don't take a single machine's numbers as a general claim —
  run `npm run bench` on your own target runtime before relying on this.
- Every `[min–max]` column is here so you can see how much of "config B
  beat config A" is signal vs. run-to-run noise on this machine — several of
  the differences above are inside that noise band.

### Memory: what a long fork chain actually costs

Every `assoc`/`fork`/`branch` stores a `parent` link, so holding just the
*tip* of a chain keeps its whole ancestor lineage reachable — nothing before
it can be collected until you `squash()`. `bench/memory.bench.js` measures
that directly: build a 200,000-`branch()` chain, force a real GC, measure
retained heap, `squash()`, force GC again, measure again.

```
chain length            = 200,000
chain depth (.parent()) = 200,001
squashed depth          = 1

heap before chain       = 3.67 MB
heap after chain        = 62.82 MB  (+59.15 MB)
heap after squash() +gc = 19.01 MB  (-43.81 MB freed)

~bytes/node retained while chained = 310.1 B
squash() freed 74.1% of the chain's heap cost
lineage preserved after squash: true
```

Run it with `npm run bench:memory` (or `node --expose-gc bench/memory.bench.js
<chainLength>` directly — `--expose-gc` is required, the script refuses to
run without it rather than silently printing meaningless numbers).

**What this is telling you, plainly:** an app that keeps `fork()`/`branch()`ing
without ever calling `squash()` grows memory in proportion to how many forks
are still reachable — here, ~310 bytes per node in the chain. `squash()`
gives ~74% of that back; the remaining ~26% is the branch-name strings
`squash()` is *supposed* to keep (`lineage()` still reports all 200,000
names afterward — that's a documented feature, not a leftover leak).

Two real bugs surfaced by building this benchmark, not just its final
numbers:

- **`branch()` used to be O(n²) for a chain of n branches.** Its lineage
  tracking copied the *entire* accumulated name array on every single
  `branch()` call (`[...previousLineage, name]`), and because every fork in
  a chain stays reachable via `parent`, all of those ever-growing copies
  were retained simultaneously. A 200,000-branch chain OOM'd a multi-GB heap
  before this was fixed. It's fixed now — `lineage()` walks the live
  `parent` chain lazily and only `squash()` (which severs `parent`) pays to
  materialize the array, once. `fork()` never had this bug (it only reuses
  the parent's array reference when there's no branch name). Regression
  test: `spec/functional.spec.js` asserts a 20k-branch chain builds in
  under 5 seconds.
- **A bare `global.gc()` on this V8 build doesn't reliably force a
  synchronous collection**, and a chain-depth-walking loop inlined at
  top-level script scope can look "reachable" to conservative stack
  scanning for the rest of that (non-returned) frame — which, because each
  node's `parent` link is a *strong* reference, transitively pins that
  node's entire remaining ancestor chain too. Both are benchmark-methodology
  traps, not library bugs, but they're exactly the kind of thing that makes
  memory numbers lie if you don't check for them — see the comment at the
  top of `bench/memory.bench.js` for the concrete fix (`{ type: 'major',
  execution: 'sync' }`, and wrapping any whole-chain walk in a function that
  returns before the next measurement).

## Develop

```bash
npm install
npm test      # builds, then runs spec/*.spec.js with node --allow-natives-syntax --test
npm run example
npm run bench        # V8 tier benchmarks (see Benchmarks above) — takes ~1-2 min
npm run bench:memory # long-chain retained-heap vs squash() (see Memory above)
```

## License

MIT
