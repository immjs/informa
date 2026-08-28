import { exitProxySymbol, getGlobalStateMode, setMetadataOf, statifySealKey, type Statify } from "../internals.js";
import { StateMetadata, type ExitProxyValue, type StatifiableProp, type StatifiableObj } from "../low.js";

export class StatifiedArray<T extends StatifiableProp>
  extends Array<T> implements Statify<T[]>
{
  [statifySealKey]: true = true;
  get [exitProxySymbol](): ExitProxyValue {
    if (getGlobalStateMode() === "extract-proxy-path") {
      return { path: [], stateRoot: this as Statify<StatifiableObj> };
    }
    throw new Error("exitProxySymbol is not available in normal mode");
  }

  #metadata: StateMetadata;

  constructor(arrayLength: number);
  constructor(...items: T[]);
  constructor(arrayLengthOrFirstItem?: number | T, ...rest: T[]) {
    if (arrayLengthOrFirstItem == undefined) {
      super();
    } else if (typeof arrayLengthOrFirstItem === "number") {
      super(arrayLengthOrFirstItem);
    } else {
      super(arrayLengthOrFirstItem, ...rest);
    }

    this.#metadata = setMetadataOf(this as Statify<T[]>, new StateMetadata());
  }

  push(...items: T[]): number {
    const result = super.push(...items);

    for (let i = result - items.length; i < result; i += 1) {
      this.#metadata.emit("spliceInElement", this[i]!, i);
    }

    if (items.length > 0) {
      this.#metadata.emit("lengthChanged");
    }

    return result;
  }
  unshift(...items: T[]): number {
    const result = super.unshift(...items);

    for (let i = 0; i < items.length; i += 1) {
      this.#metadata.emit("spliceInElement", this[i]!, i);
    }

    if (items.length > 0) {
      this.#metadata.emit("lengthChanged");
    }

    return result;
  }

  pop(): T | undefined {
    if (this.length > 0) {
      const result = super.pop();

      this.#metadata.emit("spliceOutElement", result, super.length);
      this.#metadata.emit("lengthChanged");
      return result;
    }

    return undefined;
  }
  shift(): T | undefined {
    if (this.length > 0) {
      const result = super.shift();

      this.#metadata.emit("spliceOutElement", result, 0);
      this.#metadata.emit("lengthChanged");
      return result;
    }
    return undefined;
  }

  #normalizeSplice(start: number, deleteCount?: number, ...items: T[]): [number, number, T[]] {
    if (start == undefined) {
      start = 0;
    } else if (-this.length <= start && start < 0) {
      start += this.length;
    } else if (start < -this.length) {
      start = 0;
    } else if (start >= this.length) {
      [start, deleteCount] = [this.length - 1, 0];
    } else if (arguments.length === 0) {
      return [0, 0, []];
    }

    if (arguments.length === 1) {
      return [start, this.length - start, []];
    } else if (deleteCount == undefined) {
      deleteCount = 0;
    }

    deleteCount = Math.min(this.length - start, deleteCount);

    return [start, deleteCount, items];
  }
  splice(start: number, deleteCount?: number, ...items: T[]): T[] {
    const [startNormed, deleteCountNormed, itemsNormed] = arguments.length === 1
      ? this.#normalizeSplice(start)
      : this.#normalizeSplice(start, deleteCount, ...items);

    const result = super.splice(startNormed, deleteCountNormed, ...itemsNormed);

    for (let i = startNormed + deleteCountNormed; i > startNormed + itemsNormed.length; i -= 1) {
      this.#metadata.emit("spliceOutElement", result[i - startNormed], i);
    }

    for (let i = startNormed; i < startNormed + Math.min(itemsNormed.length, deleteCountNormed); i += 1) {
      this.#metadata.emit("replaceElement", this[i], i);
    }

    for (let i = startNormed + deleteCountNormed; i < startNormed + itemsNormed.length; i += 1) {
      this.#metadata.emit("spliceInElement", this[i], i);
    }

    if (itemsNormed.length !== deleteCountNormed) {
      this.#metadata.emit("lengthChanged");
    }

    return result;
  }

  #normalizeStartEnd(start?: number, end?: number): [number, number] {
    if (start == undefined) {
      start = 0;
    }

    if (-this.length <= start && start < 0) {
      start = start + this.length;
    } else if (start < -this.length) {
      start = 0;
    } else if (start >= this.length) {
      return [0, 0];
    }

    if (end == undefined) {
      end = this.length;
    }

    if (-this.length <= end && end < 0) {
      end += this.length;
    } else if (end < -this.length) {
      end = 0;
    } else if (end >= this.length) {
      end = this.length;
    }

    if (end < start) {
      end = start;
    }

    return [start, end];
  }
  fill(value: T, start?: number, end?: number): this {
    const [startNormed, endNormed] = arguments.length === 1
      ? this.#normalizeStartEnd()
      : arguments.length === 2
        ? this.#normalizeStartEnd(start)
        : this.#normalizeStartEnd(start, end);

    const result = super.fill(value, startNormed, endNormed);

    for (let i = startNormed; i < endNormed; i += 1) {
      this.#metadata.emit("replaceElement", this[i], i);
    }

    return result;
  }
  copyWithin(target: number, start: number, end?: number): this {
    const [startNormed, endNormed] = arguments.length === 2
      ? this.#normalizeStartEnd(start)
      : this.#normalizeStartEnd(start, end);

    const result = super.copyWithin(target, startNormed, endNormed);

    for (let i = target; i < target + endNormed - startNormed; i += 1) {
      this.#metadata.emit("replaceElement", this[i], i);
    }

    return result;
  }

  reverse(): T[] {
    const result = super.reverse();

    const parity = this.length % 2;
    const half = (this.length / 2) | 0;
    for (let i = 0; i < this.length - parity; i += 1) {
      if (i > half) {
        this.#metadata.emit("replaceElement", this[i], i + parity);
      } else {
        this.#metadata.emit("replaceElement", this[i], i);
      }
    }

    return result;
  }
  sort(compareFn?: ((a: T, b: T) => number) | undefined): this {
    const result = super.sort(compareFn);

    for (let i = 0; i < this.length; i += 1) {
      this.#metadata.emit("replaceElement", this[i], i);
    }

    return result;
  }
}
