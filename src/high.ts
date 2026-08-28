import { getMetadataOf, isStatified, proxyMemoized, type Statify } from "./internals.js";
import { hook, selectorToRootAndPath, statifyObject, type StatifiableObj, type StatifiableProp, type Statified } from "./low.js";
import { StatifiedArray } from "./quirks/array.js";
import { BaseStatified, makeStatified } from "./quirks/basestatified.js";
import { StatifiedMap } from "./quirks/map.js";
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

      case Map.prototype:
        const map = original as unknown as Map<any, any>;
        return new StatifiedMap(map[Symbol.iterator]().map(([k, v]) => [k, stateInner(v)]));

      case Array.prototype:
        const array = original as unknown as any[];
        return StatifiedArray.from(array.map(stateInner));

      case StatifiedArray.prototype:
      case StatifiedSet.prototype:
      case StatifiedMap.prototype:
        return original as StatifiedArray<StatifiableProp>
          | StatifiedSet<StatifiableProp>
          | StatifiedMap<any, StatifiableProp>;

      case Object.prototype:
        const newObj = original as unknown as Record<string | symbol, any>;
        const entries = Object.entries(newObj)
          .map(([k, v]) => [k, stateInner(v)]);
        const result = statifyObject(Object.fromEntries(entries));

        entries.forEach(([k, v]) => isStatified(v) && hook(getMetadataOf(result), k, getMetadataOf(v)))

        return result;
    }

    if (Array.isArray(original)) {
      return new StatifiedArray(original.map(stateInner));
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
  setProp?(p: string | symbol, v: V): void;
  addProp?(p: string | symbol, v: V): void;
  replaceProp?(p: string | symbol, v: V): void;
  deleteProp?(p: string | symbol, v: V): void;
}

interface ArrayListeners<T> extends ObjectListeners<number, T> {
  spliceInElement?(v: T, i: number): void;
  spliceOutElement?(v: T, i: number): void;
  replaceElement?(v: T, i: number): void;
  lengthChanged?(): void;
}

interface SetListeners<T> {
  addItem?(v: T): void;
  deleteItem?(v: T): void;
  cardChanged?(): void;
}

interface MapListeners<K, V> {
  setEntry?(k: K, v: V): void;
  addEntry?(k: K, v: V): void;
  replaceEntry?(k: K, v: V): void;
  deleteEntry?(k: K, v: V): void;
  sizeChanged?(): void;
}

type OnOffParams<T, K extends string | number | symbol, V, U, K1, V1> = [() => T, Listeners<T>]
  | [() => T, Listeners<T>, Options | undefined]
  | [() => Statify<Record<K, V>>, ObjectListeners<K, V>]
  | [() => Statify<Record<K, V>>, ObjectListeners<K, V>, Options | undefined]
  | [() => Statify<U[]>, ArrayListeners<U>]
  | [() => Statify<U[]>, ArrayListeners<U>, Options | undefined]
  | [() => Statify<Set<U>>, SetListeners<U>]
  | [() => Statify<Set<U>>, SetListeners<U>, Options | undefined]
  | [() => Statify<Map<K1, V1>>, MapListeners<K1, V1>]
  | [() => Statify<Map<K1, V1>>, MapListeners<K1, V1>, Options | undefined];

export function on<T, K extends string | number | symbol, V, U, K1, V1>(
  ...[selector, listeners, options]: OnOffParams<T, K, V, U, K1, V1>
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

export function off<T, K extends string | number | symbol, V, U, K1, V1>(
  ...[selector, listeners, options]: OnOffParams<T, K, V, U, K1, V1>
): void {
  const { path, stateRoot } = selectorToRootAndPath(selector as () => Statify<StatifiableObj>);

  const metadata = getMetadataOf(stateRoot);

  const eventEmitter = metadata.eventEmitterAtPath(path);

  for (const [key, value] of Object.entries(listeners)) {
    eventEmitter.off(key, value);
  }
}

function onSet<T>(s: () => T, l: (v: T) => void, o?: Options) {
  return on(s, { set: l }, o);
}
function onReplace<T>(s: () => T, l: (v: T) => void, o?: Options) {
  return on(s, { replace: l }, o);
}
function onReplaceProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (k: keyof T, v: T[keyof T]) => void, o?: Options) {
  return on(s, { replaceProp: l }, o);
}
function onAddProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (k: keyof T, v: T[keyof T]) => void, o?: Options) {
  return on(s, { addProp: l }, o);
}
function onDeleteProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (k: keyof T, v: T[keyof T]) => void, o?: Options) {
  return on(s, { deleteProp: l }, o);
}
function onSetProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (k: keyof T, v: T[keyof T]) => void, o?: Options) {
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
function onCardChanged(s: () => Statify<Set<StatifiableObj>>, l: () => void, o?: Options) {
  return on(s, { cardChanged: l }, o);
}
function onAddItem<T extends StatifiableObj>(s: () => Statify<Set<T>>, l: (v: T) => void, o?: Options) {
  return on(s, { addItem: l }, o);
}
function onDeleteItem<T extends StatifiableObj>(s: () => Statify<Set<T>>, l: (v: T) => void, o?: Options) {
  return on(s, { deleteItem: l }, o);
}
function onSetEntry<K, V extends StatifiableObj>(s: () => Statify<Map<K, V>>, l: (k: K, v: V) => void, o?: Options) {
  return on(s, { setEntry: l }, o);
}
function onAddEntry<K, V extends StatifiableObj>(s: () => Statify<Map<K, V>>, l: (k: K, v: V) => void, o?: Options) {
  return on(s, { addEntry: l }, o);
}
function onReplaceEntry<K, V extends StatifiableObj>(s: () => Statify<Map<K, V>>, l: (k: K, v: V) => void, o?: Options) {
  return on(s, { replaceEntry: l }, o);
}
function onDeleteEntry<K, V extends StatifiableObj>(s: () => Statify<Map<K, V>>, l: (k: K, v: V) => void, o?: Options) {
  return on(s, { deleteEntry: l }, o);
}
function onSizeChanged(s: () => Statify<Map<any, StatifiableObj>>, l: () => void, o?: Options) {
  return on(s, { sizeChanged: l }, o);
}

function offSet<T>(s: () => T, l: (v: T) => void, o?: Options) {
  return off(s, { set: l }, o);
}
function offReplace<T>(s: () => T, l: (v: T) => void, o?: Options) {
  return off(s, { replace: l }, o);
}
function offAddProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (k: keyof T, v: T[keyof T]) => void, o?: Options) {
  return off(s, { addProp: l }, o);
}
function offReplaceProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (k: keyof T, v: T[keyof T]) => void, o?: Options) {
  return off(s, { replaceProp: l }, o);
}
function offDeleteProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (k: keyof T, v: T[keyof T]) => void, o?: Options) {
  return off(s, { deleteProp: l }, o);
}
function offSetProp<T extends Record<string | number | symbol, StatifiableProp>>(s: () => Statify<T>, l: (k: keyof T, v: T[keyof T]) => void, o?: Options) {
  return off(s, { setProp: l }, o);
}
function offLengthChanged(s: () => Statify<StatifiableObj[]>, l: () => void, o?: Options) {
  return off(s, { lengthChanged: l }, o);
}
function offSpliceInElement<T extends StatifiableObj>(s: () => Statify<T[]>, l: (v: T, k: number) => void, o?: Options) {
  return off(s, { spliceInElement: l }, o);
}
function offSpliceOutElement<T extends StatifiableObj>(s: () => Statify<T[]>, l: (v: T, k: number) => void, o?: Options) {
  return off(s, { spliceOutElement: l }, o);
}
function offReplaceElement<T extends StatifiableObj>(s: () => Statify<T[]>, l: (v: T, k: number) => void, o?: Options) {
  return off(s, { replaceElement: l }, o);
}
function offCardChanged(s: () => Statify<Set<StatifiableObj>>, l: () => void, o?: Options) {
  return off(s, { cardChanged: l }, o);
}
function offAddItem<T extends StatifiableObj>(s: () => Statify<Set<T>>, l: (v: T) => void, o?: Options) {
  return off(s, { addItem: l }, o);
}
function offDeleteItem<T extends StatifiableObj>(s: () => Statify<Set<T>>, l: (v: T) => void, o?: Options) {
  return off(s, { deleteItem: l }, o);
}
function offSetEntry<K, V extends StatifiableObj>(s: () => Statify<Map<K, V>>, l: (k: K, v: V) => void, o?: Options) {
  return off(s, { setEntry: l }, o);
}
function offAddEntry<K, V extends StatifiableObj>(s: () => Statify<Map<K, V>>, l: (k: K, v: V) => void, o?: Options) {
  return off(s, { addEntry: l }, o);
}
function offReplaceEntry<K, V extends StatifiableObj>(s: () => Statify<Map<K, V>>, l: (k: K, v: V) => void, o?: Options) {
  return off(s, { replaceEntry: l }, o);
}
function offDeleteEntry<K, V extends StatifiableObj>(s: () => Statify<Map<K, V>>, l: (k: K, v: V) => void, o?: Options) {
  return off(s, { deleteEntry: l }, o);
}
function offSizeChanged(s: () => Statify<Map<any, StatifiableObj>>, l: () => void, o?: Options) {
  return off(s, { sizeChanged: l }, o);
}

export default {
  on,
  off,
  onSet,
  onReplace,
  onAddProp,
  onReplaceProp,
  onDeleteProp,
  onSetProp,
  onLengthChanged,
  onSpliceInElement,
  onSpliceOutElement,
  onReplaceElement,
  onCardChanged,
  onAddItem,
  onDeleteItem,
  onSetEntry,
  onAddEntry,
  onReplaceEntry,
  onDeleteEntry,
  onSizeChanged,
  offSet,
  offReplace,
  offAddProp,
  offReplaceProp,
  offDeleteProp,
  offSetProp,
  offLengthChanged,
  offSpliceInElement,
  offSpliceOutElement,
  offReplaceElement,
  offCardChanged,
  offAddItem,
  offDeleteItem,
  offSetEntry,
  offAddEntry,
  offReplaceEntry,
  offDeleteEntry,
  offSizeChanged,
  state,

  BaseStatified,
  makeStatified,
  StatifiedArray,
  StatifiedSet,
  StatifiedMap,
};
