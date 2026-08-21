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

## Develop

```bash
npm install
npm test      # builds, then runs spec/*.spec.js with node --allow-natives-syntax --test
npm run example
```

## License

MIT
