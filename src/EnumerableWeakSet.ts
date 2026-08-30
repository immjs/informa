export class EnumerableWeakSet<T extends WeakKey> implements WeakSet<T>, Iterable<T> {
  #set = new WeakSet<T>();

  #refs: Set<WeakRef<T>> = new Set();

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
      this.#refs.add(new WeakRef(value));
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

  clear(): void {
    this.#refs.clear();
  }

  *[Symbol.iterator](): Generator<T, void, unknown> {
    const set = this.#set;
    for (const wr of this.#refs) {
      const value = wr.deref();
      if (value && set.has(value)) {
        yield value;
      } else {
        this.#refs.delete(wr);
      }
    }
  }
}
