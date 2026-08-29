export class EnumerableWeakSet<T extends WeakKey> implements WeakSet<T>, Iterable<T> {
  #set = new WeakSet<T>();

  #refs: WeakRef<T>[] = [];

  constructor(iterable: Iterable<T> | null = null) {
    if (iterable) {
      for (const value of iterable) {
        this.add(value);
      }
    }
  }

  get [Symbol.toStringTag]() {
    return "WeakerableSet";
  }

  add(value: T): this {
    if (!this.#set.has(value)) {
      this.#refs.push(new WeakRef(value));
      this.#set.add(value);
    }
    return this;
  }

  delete(value: T): boolean {
    return this.#set.delete(value);
  }

  has(value: T): boolean {
    return this.#set.has(value);
  }

  *[Symbol.iterator](): Generator<T, void, unknown> {
    const set = this.#set;
    const refs: WeakRef<T>[] = [];
    for (const wr of this.#refs) {
      const value = wr.deref();
      if (value && set.has(value)) {
        refs.push(wr);
        yield value;
      }
    }
    this.#refs = refs;
  }
}
