export class EnumerableWeakMap<K extends WeakKey, V> implements WeakMap<K, V>, Iterable<[K, V]> {
  #map = new WeakMap<K, V>();

  #refs: WeakRef<K>[] = [];

  constructor(iterable: Iterable<[K, V]> | null = null) {
    if (iterable) for (const [key, value] of iterable) this.set(key, value);
  }

  get [Symbol.toStringTag]() {
    return "WeakerableMapByWebReflection";
  }

  get(key: K) {
    return this.#map.get(key);
  }

  getOrInsert(key: K, defaultValue: V): V {
    if (this.#map.has(key)) {
      return this.#map.get(key)!;
    }
    this.#map.set(key, defaultValue);
    this.#refs.push(new WeakRef(key));
    return defaultValue;
  }

  getOrInsertComputed(key: K, callback: (k: K) => V): V {
    if (this.#map.has(key)) {
      return this.#map.get(key)!;
    }
    const value = callback(key);
    this.#map.set(key, value);
    this.#refs.push(new WeakRef(key));
    return value;
  }

  set(key: K, value: V): this {
    if (!this.#map.has(key)) this.#refs.push(new WeakRef(key));
    this.#map.set(key, value);

    return this;
  }

  delete(value: K) {
    return this.#map.delete(value);
  }

  has(value: K) {
    return this.#map.has(value);
  }

  *[Symbol.iterator]() {
    const map = this.#map, refs = [];
    for (const wr of this.#refs) {
      const key = wr.deref();
      if (key && map.has(key)) {
        refs.push(wr);
        yield [key, map.get(key)!] satisfies [K, V];
      }
    }
    this.#refs = refs;
  }
}
