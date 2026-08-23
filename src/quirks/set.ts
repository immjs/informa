import { exitProxySymbol, setMetadataOf, statifySealKey, type Statify } from "../internals.js";
import { StateMetadata, type ExitProxyValue, type StatifiableProp } from "../low.js";

export class StatifiedSet<T extends StatifiableProp> extends Set<T> implements Statify<Set<T>> {
  [statifySealKey]: true = true;
  declare [exitProxySymbol]: ExitProxyValue;

  #metadata: StateMetadata;

  constructor(args?: Iterable<T> | null) {
    super(args);

    this.#metadata = setMetadataOf(this, new StateMetadata());
  }

  add(value: T): this {
    if (!super.has(value)) {
      super.add(value);
      this.#metadata.emit("addItem", value);
      this.#metadata.emit("sizeChanged");
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
      this.#metadata.emit("sizeChanged");
    }
  }

  delete(value: T): boolean {
    if (super.delete(value)) {
      this.#metadata.emit("deleteItem", value);
      this.#metadata.emit("sizeChanged");
      return true;
    }

    return false;
  }
}
