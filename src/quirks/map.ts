import { exitProxySymbol, getGlobalStateMode, setMetadataOf, Statify, statifySealKey } from "../internals.js";
import { ExitProxyValue, StateMetadata, StatifiableObj } from "../low.js";

export class StatifiedMap<K, V> extends Map<K, V> implements Statify<Map<K, V>> {
  [statifySealKey]: true = true;
  get [exitProxySymbol](): ExitProxyValue {
    if (getGlobalStateMode() === "extract-proxy-path") {
      return { path: [], stateRoot: this as Statify<StatifiableObj> };
    }
    throw new Error("exitProxySymbol is not available in normal mode");
  }

  #metadata: StateMetadata;

  constructor(args?: Iterable<[K, V]> | null) {
    super(args);

    this.#metadata = setMetadataOf(this, new StateMetadata());
  }

  clear(): void {
    const entries = [...this.entries()];
    super.clear();

    for (const [key, value] of entries) {
      this.#metadata.emit("deleteEntry", key, value);
    }

    this.#metadata.emit("sizeChanged");
  }

  delete(key: K): boolean {
    const value = super.get(key);
    if (super.delete(key)) {
      this.#metadata.emit("deleteEntry", key, value);
      this.#metadata.emit("sizeChanged");
      return true;
    }

    return false;
  }

  set(key: K, value: V): this {
    if (super.get(key) === value) return this;

    const had = super.has(key);
    super.set(key, value);

    if (had) {
      this.#metadata.emit("replaceEntry", key, value);
    } else {
      this.#metadata.emit("addEntry", key, value);
    }

    this.#metadata.emit("setEntry", key, value);
    this.#metadata.emit("sizeChanged");

    return this;
  }
}
