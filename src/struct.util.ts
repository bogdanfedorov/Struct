import type { Key, StructFactory, StructInstance, StructShape, Value } from "./struct";
import { RefByKeyNotFound } from "./struct.errors";

interface NodeMeta<T extends StructShape> {
  readonly parent: StructInstance<T> | null;
  readonly lineagePath: readonly string[];
  readonly branchName: string | null;
  readonly ownFields: Partial<T>;
}

/**
 * Builds a struct factory. Every instance a given factory produces shares
 * ONE prototype object (holding get/assoc/fork/...), and always carries the
 * exact same own-key set (T's keys, fixed at every fork via Partial<T>
 * overrides — no new keys can ever be introduced). Same prototype + same own
 * keys in the same order = same V8 hidden class for every instance, for the
 * whole lineage, regardless of how deep forking goes.
 *
 * `freeze` only controls whether instances are writable — it does not affect
 * hidden-class sharing, which holds either way.
 */
function buildFactory<T extends StructShape>(shape: T, freeze: boolean): StructFactory<T> {
  const meta = new WeakMap<StructInstance<T>, NodeMeta<T>>();

  const metaOf = (instance: StructInstance<T>): NodeMeta<T> => {
    const found = meta.get(instance);
    if (!found) throw new Error('Not a Struct instance produced by this factory');
    return found;
  };

  const makeInstance = (
    data: T,
    ownFields: Partial<T>,
    parent: StructInstance<T> | null,
    branchName: string | null,
    lineagePath: readonly string[],
  ): StructInstance<T> => {
    const instance = Object.create(proto) as StructInstance<T>;
    if (freeze) {
      const descriptors = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          { value, enumerable: true, writable: false, configurable: false },
        ]),
      ) as PropertyDescriptorMap;
      Object.freeze(Object.defineProperties(instance, descriptors));
    } else {
      Object.assign(instance, data);
    }
    meta.set(instance, { parent, lineagePath, branchName, ownFields });
    return instance;
  };

  const forkFrom = (current: StructInstance<T>, overrides: Partial<T>, name: string | null): StructInstance<T> => {
    const data = { ...(current as unknown as T), ...overrides };
    const lineagePath = name ? [...metaOf(current).lineagePath, name] : metaOf(current).lineagePath;
    return makeInstance(data, overrides, current, name, lineagePath);
  };

  const proto = {
    get(this: StructInstance<T>, key: Key<T>): Value<T> {
      const value = (this as unknown as T)[key];
      if (value === undefined) throw new Error(RefByKeyNotFound);
      return value as Value<T>;
    },
    assoc(this: StructInstance<T>, key: Key<T>, value: Value<T>) {
      return forkFrom(this, { [key]: value } as Partial<T>, null);
    },
    fork(this: StructInstance<T>, overrides: Partial<T> = {}) {
      return forkFrom(this, overrides, null);
    },
    branch(this: StructInstance<T>, name: string, overrides: Partial<T> = {}) {
      return forkFrom(this, overrides, name);
    },
    parent(this: StructInstance<T>) {
      return metaOf(this).parent;
    },
    lineage(this: StructInstance<T>) {
      return [...metaOf(this).lineagePath];
    },
    diff(this: StructInstance<T>): Partial<T> {
      return { ...metaOf(this).ownFields };
    },
    toObject(this: StructInstance<T>): T {
      return { ...(this as unknown as T) };
    },
    squash(this: StructInstance<T>) {
      const flat = this.toObject();
      return makeInstance(flat, flat, null, null, metaOf(this).lineagePath);
    },
    isImmutable() {
      return true as const;
    },
    isRoot(this: StructInstance<T>) {
      return metaOf(this).parent === null;
    },
    isBranch(this: StructInstance<T>) {
      return metaOf(this).branchName !== null;
    },
    eq(this: StructInstance<T>, other: StructInstance<T>) {
      return (this as unknown) === (other as unknown);
    },
    equal(this: StructInstance<T>, other: StructInstance<T>) {
      const a = this.toObject();
      const b = other.toObject();
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      return keysA.length === keysB.length && keysA.every((k) => (a as StructShape)[k] === (b as StructShape)[k]);
    },
  };

  return (overrides: Partial<T> = {}) => {
    const data = { ...shape, ...overrides };
    return makeInstance(data, data, null, null, []);
  };
}

export const Struct = {
  immutable: <T extends StructShape>(shape: T): StructFactory<T> => buildFactory(shape, true),
  backends: {
    chainedFrozen: <T extends StructShape>(shape: T): StructFactory<T> => buildFactory(shape, true),
    chainedFast: <T extends StructShape>(shape: T): StructFactory<T> => buildFactory(shape, false),
    snapshot: <T extends StructShape>(shape: T): StructFactory<T> => buildFactory(shape, true),
  },
};
