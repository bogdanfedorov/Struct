export type StructShape = Record<string, unknown>;
export type Key<T extends StructShape> = keyof T & string;
export type Value<T extends StructShape> = T[Key<T>];

export interface StructNode<T extends StructShape> {
  get(key: Key<T>): Value<T>;
  assoc(key: Key<T>, value: Value<T>): StructInstance<T>;
  fork(overrides?: Partial<T>): StructInstance<T>;
  branch(branchName: string, overrides?: Partial<T>): StructInstance<T>;
  parent(): StructInstance<T> | null;
  lineage(): string[];
  diff(): Partial<T>;
  toObject(): T;
  squash(): StructInstance<T>;

  isImmutable(): true;
  isRoot(): boolean;
  isBranch(): boolean;
  eq(other: StructInstance<T>): boolean;
  equal(other: StructInstance<T>): boolean;
}

export type StructInstance<T extends StructShape> = StructNode<T> & T;

export type StructFactory<T extends StructShape> = (overrides?: Partial<T>) => StructInstance<T>;
