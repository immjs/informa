import { exitProxySymbol, getGlobalStateMode, isStatifiedSetKey, setMetadataOf, statifySealKey, type Statify } from "../internals.js";
import { StateMetadata, StatifiableObj, type ExitProxyValue, type StatifiableProp } from "../low.js";

export class StatifiedSet<T extends StatifiableProp> extends Set<T> implements Statify<Set<T>> {
  [statifySealKey]: true = true;
  get [exitProxySymbol](): ExitProxyValue {
    if (getGlobalStateMode() === "extract-proxy-path") {
      return { path: [], stateRoot: this as Statify<StatifiableObj> };
    }
    throw new Error("exitProxySymbol is not available in normal mode");
  }

  #metadata: StateMetadata;

  constructor(args?: Iterable<T> | null) {
    super();

    this.#metadata = setMetadataOf(this, new StateMetadata());

    if (args) {
      for (const item of args) {
        super.add(item);
      }
    }
  }

  add(value: T): this {
    if (!super.has(value)) {
      super.add(value);
      this.#metadata.emit("addItem", value);
      this.#metadata.emit("cardChanged");
    }

    return this;
  }

  clear(): void {
    const oldValues = [...this.values()];

    super.clear();

    for (const value of oldValues) {
      this.#metadata.emit("deleteItem", value);
    }
    if (oldValues.length > 0) {
      this.#metadata.emit("cardChanged");
    }
  }

  delete(value: T): boolean {
    if (super.delete(value)) {
      this.#metadata.emit("deleteItem", value);
      this.#metadata.emit("cardChanged");
      return true;
    }

    return false;
  }
}

(StatifiedSet.prototype as any)[isStatifiedSetKey] = true;
