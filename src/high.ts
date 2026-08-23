import { getMetadataOf, isStatified, proxyMemoized, type Statify } from "./internals.js";
import { hook, selectorToRootAndPath, statifyObject, type StatifiableObj, type StatifiableProp, type Statified } from "./low.js";
import { StatifiedArray } from "./quirks/array.js";
import { StatifiedSet } from "./quirks/set.js";

export function stateInner<T extends StatifiableProp>(original: T): Statified<T> {
  if (typeof original !== 'object' || original === null) {
    return original as Statified<T>;
  }

  if (proxyMemoized.has(original)) return proxyMemoized.get(original) as Statified<T>;

  const unmemoed = (() => {
    switch (Reflect.getPrototypeOf(original)) {
      case Set.prototype:
        const set = original as unknown as Set<any>;
        return new StatifiedSet(set[Symbol.iterator]().map(stateInner));

      case Array.prototype:
        const array = original as unknown as any[];
        return new StatifiedArray(...array.map(stateInner));

      case StatifiedArray.prototype:
      case StatifiedSet.prototype:
        return original as StatifiedArray<StatifiableProp> | StatifiedSet<StatifiableProp>;

      case Object.prototype:
        const newObj = original as unknown as Record<string | symbol, any>;
        const entries = Object.entries(newObj)
          .map(([k, v]) => [k, stateInner(v)]);
        const result = statifyObject(Object.fromEntries(entries));

        entries.forEach(([k, v]) => isStatified(v) && hook(getMetadataOf(result), k, getMetadataOf(v)))

        return result;
    }

    if (Array.isArray(original)) {
      return new StatifiedArray(...original.map(stateInner));
    }

    throw new Error(`Cannot clone object with prototype`);
  })();

  proxyMemoized.set(original, unmemoed);

  return unmemoed as Statified<T>;
}

export function state<T extends StatifiableObj>(original: T): Statified<T> {
  return stateInner<T>(original);
}

interface Options {
}

interface Listeners<T> {
  set?(v: T): void;
  replace?(v: T): void;
}

interface ObjectListeners<K extends string | number | symbol, V> extends Listeners<Record<K, V>> {
  setProp?(v: V, i: string | symbol): void;
  replaceProp?(v: V, i: string | symbol): void;
  deleteProp?(v: V, i: string | symbol): void;
}

interface ArrayListeners<T> extends ObjectListeners<number, T> {
  spliceInElement?(v: T, i: number): void;
  spliceOutElement?(v: T, i: number): void;
  replaceElement?(v: T, i: number): void;
  lengthChanged?(): void;
}

interface SetListeners<T> extends ObjectListeners<keyof Set<T>, Set<T>[keyof Set<T>]> {
  addItem?(v: T): void;
  deleteItem?(v: T): void;
  sizeChanged?(): void;
}

export function on<T, K extends string | number | symbol, V, U>(
  ...[selector, listeners, options]:
    [() => T, Listeners<T>]
    | [() => T, Listeners<T>, Options | undefined]
    | [() => Statify<Record<K, V>>, ObjectListeners<K, V>]
    | [() => Statify<Record<K, V>>, ObjectListeners<K, V>, Options | undefined]
    | [() => Statify<U[]>, ArrayListeners<U>]
    | [() => Statify<U[]>, ArrayListeners<U>, Options | undefined]
    | [() => Statify<Set<U>>, SetListeners<U>]
    | [() => Statify<Set<U>>, SetListeners<U>, Options | undefined]
): () => void {
  const { path, stateRoot } = selectorToRootAndPath(selector as () => Statify<StatifiableObj>);

  const metadata = getMetadataOf(stateRoot);

  const eventEmitter = metadata.eventEmitterAtPath(path);

  for (const [key, value] of Object.entries(listeners)) {
    eventEmitter.on(key, value);
  }

  return () => {
    for (const [key, value] of Object.entries(listeners)) {
      eventEmitter.off(key, value);
    }
  }
}

function onSet<T>(s: () => T, l: (v: T) => void, o?: Options) {
  // TODO Handle `once` option
  return on(s, { set: l }, o);
}
function onReplace<T>(s: () => T, l: (v: T) => void, o?: Options) {
  return on(s, { replace: l }, o);
}

function onReplaceProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (v: T[keyof T], k: keyof T) => void, o?: Options) {
  return on(s, { replaceProp: l }, o);
}
function onDeleteProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (v: T[keyof T], k: keyof T) => void, o?: Options) {
  return on(s, { deleteProp: l }, o);
}
function onSetProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (v: T[keyof T], k: keyof T) => void, o?: Options) {
  return on(s, { setProp: l }, o);
}
function onLengthChanged(s: () => Statify<StatifiableObj[]>, l: () => void, o?: Options) {
  return on(s, { lengthChanged: l }, o);
}
function onSpliceInElement<T extends StatifiableObj>(s: () => Statify<T[]>, l: (v: T, k: number) => void, o?: Options) {
  return on(s, { spliceInElement: l }, o);
}
function onSpliceOutElement<T extends StatifiableObj>(s: () => Statify<T[]>, l: (v: T, k: number) => void, o?: Options) {
  return on(s, { spliceOutElement: l }, o);
}
function onReplaceElement<T extends StatifiableObj>(s: () => Statify<T[]>, l: (v: T, k: number) => void, o?: Options) {
  return on(s, { replaceElement: l }, o);
}
function onSizeChanged<T extends StatifiableObj>(s: () => Statify<Set<T>>, l: () => void, o?: Options) {
  return on(s, { sizeChanged: l }, o);
}
function onAddItem<T extends StatifiableObj>(s: () => Statify<Set<T>>, l: (v: T) => void, o?: Options) {
  return on(s, { addItem: l }, o);
}
function onDeleteItem<T extends StatifiableObj>(s: () => Statify<Set<T>>, l: (v: T) => void, o?: Options) {
  return on(s, { deleteItem: l }, o);
}

export default {
  on,
  onSet,
  onReplace,
  onReplaceProp,
  onDeleteProp,
  onSetProp,
  onLengthChanged,
  onSpliceInElement,
  onSpliceOutElement,
  onReplaceElement,
  onSizeChanged,
  onAddItem,
  onDeleteItem,
  state,
};
