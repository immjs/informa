import { exitProxySymbol, getGlobalStateMode, getMetadataOf, proxyMemoized, setGlobalStateMode, setMetadataOf, statifySealKey, type Statify } from "./internals.js";
import { EventEmitter } from "node:events";
import { StatifiedSet } from "./quirks/set.js";
import { isListInGrid } from "./utils.js";
import { EnumerableWeakMap } from "./EnumerableWeakMap.js";
import { StatifiedMap } from "./quirks/map.js";

type ProxyEventEmitterEvents = {
  "set": [any],
  "replace": [any],

  // "changeDeep": [unknown], // TODO
  "deleteProp": [any, string | symbol],
  "setProp": [any, string | symbol],
  "addProp": [any, string | symbol],
  "replaceProp": [any, string | symbol],

  "lengthChanged": [],
  "spliceInElement": [any, number],
  "spliceOutElement": [any, number],
  "replaceElement": [any, number],

  "addItem": [any],
  "deleteItem": [any],
  "cardChanged": [],

  "setEntry": [any, any],
  "addEntry": [any, any],
  "replaceEntry": [any, any],
  "deleteEntry": [any, any],
  "sizeChanged": [],
} & Record<string, never>;

class Tree<T, U> {
  value: U;
  children = new Map<T, Tree<T, U>>();

  constructor(value: U) {
    this.value = value;
  }

  get(key: T) {
    return this.children.get(key);
  }
  getOrCreate(key: T, creation: (k: T) => U) {
    if (!this.children.has(key)) {
      const result = new Tree<T, U>(creation(key));
      this.children.set(key, result);

      return result;
    }

    return this.children.get(key)!;
  }
}

export class StateMetadata extends EventEmitter<ProxyEventEmitterEvents> {
  eventEmitterTree = new Tree<string | symbol, StateMetadata>(this);

  parents = new EnumerableWeakMap<StateMetadata, Set<string | symbol>>();

  eventEmitterAtPath(path: (string | symbol)[]) {
    if (path.length === 0) return this;

    let node = this.eventEmitterTree;
    for (let i = 0; i < path.length; i += 1) {
      const nextAccess = path[i]!;
      node = node.getOrCreate(nextAccess, () => new StateMetadata());
    }

    return node.value;
  }

  eventEmitterAtPathMaybe(path: (string | symbol)[]) {
    if (path.length === 0) return this;

    let node = this.eventEmitterTree;
    for (let i = 0; i < path.length; i += 1) {
      const nextAccess = path[i]!;

      const maybeNode = node.get(nextAccess);
      if (!maybeNode) return undefined;

      node = maybeNode;
    }

    return node.value;
  }

  #pushParents(
    queue: { ancestor: StateMetadata; path: (string | symbol)[] }[],
    suffixPath: (string | symbol)[],
  ) {
    for (const [parent, keys] of this.parents) {
      for (const key of keys) {
        queue.push({
          ancestor: parent,
          path: [key, ...suffixPath],
        });
      }
    }
  }

  emit<E extends string | symbol>(
    eventName: string | E,
    ...args: E extends string
      ? ProxyEventEmitterEvents[E]
      : E extends keyof EventEmitter.EventEmitterEventMap
      ? EventEmitter.EventEmitterEventMap[E]
      : any[]
  ): boolean {
    let result = super.emit(eventName, ...args);

    const queue: { ancestor: StateMetadata; path: (string | symbol)[] }[] = [];
    this.#pushParents(queue, []);

    const seen = new Map<StateMetadata, (string | symbol)[][]>();

    while (queue.length > 0) {
      const { ancestor, path } = queue.pop()!;

      const paths = seen.get(ancestor);

      if (isListInGrid(paths ?? [], path)) continue;

      if (paths) paths.push(path);
      else seen.set(ancestor, [path]);

      const target = ancestor.eventEmitterAtPathMaybe(path);
      if (target) result ||= target.emit(eventName, ...args);

      ancestor.#pushParents(queue, path);
    }

    return result;
  }
}

export interface ExitProxyValue {
  path: (string | symbol)[],
  stateRoot: Statify<StatifiableObj>,
}

export interface Exitable {
  [exitProxySymbol]: ExitProxyValue;
}

export type StatifiableProp = boolean | string | number | bigint | symbol | null | undefined | StatifiableObj | Statify<StatifiableObj>;
export type StatifiableObj = { [k: string | symbol]: StatifiableProp } | {};

export type Statified<T extends StatifiableProp> = T extends object
  ? T extends Set<infer U>
    ? StatifiedSet<Statified<U>>
    : T extends Map<infer K, infer V>
      ? StatifiedMap<K, Statified<V>>
      : Statify<{ [K in keyof T]: Statified<T[K]> }>
  : T;

export function statifyObject<T extends { [k: string | symbol]: Statified<StatifiableProp> }>(target: T): Statified<T> {
  if ((target as Statified<T>)[statifySealKey]) {
    return target as Statified<T>;
  }

  if (proxyMemoized.has(target)) {
    return proxyMemoized.get(target)! as Statified<T>;
  }

  let stateMetadata: StateMetadata;

  const proxyObj = new Proxy(target, {
    get(target, prop, recv) {
      if (prop === statifySealKey) return true;

      const result = Reflect.get(target, prop, recv);

      if (getGlobalStateMode() === "extract-proxy-path") {
        if (prop === exitProxySymbol) {
          return { path: [], stateRoot: proxyObj };
        }

        return extract(result, proxyObj, [prop])
      }

      return result;
    },

    set(target, prop, newVal, recv) {
      const had = Reflect.has(target, prop);
      const oldVal = Reflect.get(target, prop) as unknown;

      const result = Reflect.set(target, prop, newVal, recv);

      if (result) {
        if (
          oldVal !== newVal
          && typeof newVal === "object"
          && newVal != null
          && newVal[statifySealKey]
        ) {
          const newValMetadata = getMetadataOf(newVal as Statify<StatifiableObj>);

          hook(stateMetadata, prop, newValMetadata);
        }

        if (had) {
          if (
            oldVal !== newVal
            && typeof oldVal === "object"
            && oldVal != null
            && (oldVal as any)[statifySealKey]
          ) {
            const oldValMetadata = getMetadataOf(oldVal as Statify<StatifiableObj>);

            unhook(stateMetadata, prop, oldValMetadata);
          }

          if (
            typeof prop !== "symbol" &&
            Number.isInteger(Number(prop)) &&
            Array.isArray(target)
          ) {
            stateMetadata.emit('replaceElement', newVal, Number(prop));
          }

          stateMetadata.emit('replaceProp', newVal, prop);
        } else {
          if (
            typeof prop !== "symbol" &&
            Number.isInteger(Number(prop)) &&
            Array.isArray(target)
          ) {
            stateMetadata.emit('spliceInElement', newVal, Number(prop));
          }

          stateMetadata.emit('addProp', newVal, prop);
        }

        stateMetadata.emit('setProp', newVal, prop);

        const maybeEventEmitterAtVal = stateMetadata.eventEmitterAtPathMaybe([prop]);
        if (maybeEventEmitterAtVal) {
          if (had) {
            maybeEventEmitterAtVal.emit('replace', newVal);
          }

          maybeEventEmitterAtVal.emit('set', newVal);

          emitDescendantPathEvents(
            stateMetadata,
            [prop],
            newVal,
            had,
          );
        }
      }

      return result;
    },

    deleteProperty(target, prop) {
      const oldVal = target[prop as keyof typeof target] as unknown;

      const result = Reflect.deleteProperty(target, prop);

      try {
        if (result) {
          if (
            typeof oldVal === "object"
            && oldVal != null
            && (oldVal as Statify<StatifiableObj>)[statifySealKey]
          ) {
            const oldValMetadata = getMetadataOf(oldVal as Statify<StatifiableObj>);

            unhook(stateMetadata, prop, oldValMetadata);
          }

          stateMetadata.emit('deleteProp', oldVal, prop);
        }
      } finally {
        return result;
      }
    },

    has(target, prop) {
      if (getGlobalStateMode() === "extract-proxy-path") {
        if (prop === exitProxySymbol) {
          return true;
        }
      }

      return Reflect.has(target, prop);
    },
  }) as Statified<typeof target>;

  stateMetadata = setMetadataOf(proxyObj, new StateMetadata());

  proxyMemoized.set(target, proxyObj);

  return proxyObj;
}

export function extract(
  targetMaybePrimitive: unknown,
  stateRoot: Statify<StatifiableObj>,
  path: (string | symbol)[],
):
  Record<string | symbol, unknown> & Exitable
{
  const target = Object(targetMaybePrimitive);

  return new Proxy(target, {
    get(target, prop, recv) {
      if (prop === exitProxySymbol) {
        return { path, stateRoot };
      }

      if (Array.isArray(target)) {
        // TODO
        throw new Error("Array index check is not yet supported.");
      }

      return extract(Reflect.get(target, prop, recv), stateRoot, [...path, prop]);
    },
    has(target, prop) {
      if (getGlobalStateMode() === "extract-proxy-path") {
        if (prop === exitProxySymbol) return true;
      }

      return Reflect.has(target, prop);
    },
  });
}

export function selectorToRootAndPath(selector: () => Statify<StatifiableObj>) {
  setGlobalStateMode("extract-proxy-path");

  let result;
  try  {
    result = (selector() as Exitable)[exitProxySymbol];
  } finally {
    setGlobalStateMode("normal");
  }

  return result;
}

export function hook(
  fromMetadata: StateMetadata,
  prop: string | symbol,
  toMetadata: StateMetadata,
) {
  let resultingSet = toMetadata.parents.get(fromMetadata);

  if (!resultingSet) {
    resultingSet = new Set();

    toMetadata.parents.set(fromMetadata, resultingSet);
  }

  resultingSet.add(prop);
}

export function unhook(
  fromMetadata: StateMetadata,
  prop: string | symbol,
  toMetadata: StateMetadata,
) {
  const set = toMetadata.parents.get(fromMetadata);
  if (set) {
    set.delete(prop);

    if (set.size === 0) {
      toMetadata.parents.delete(fromMetadata);
    }
  }
}

function getAtPathMaybe(
  value: unknown,
  path: (string | symbol)[],
) {
  let current = value;

  for (const key of path) {
    if (current == null) return undefined;
    current = Reflect.get(Object(current), key);
  }

  return current;
}

export function emitDescendantPathEvents(
  rootMetadata: StateMetadata,
  prefixPath: (string | symbol)[],
  nextRootValue: unknown,
  emitReplace: boolean,
) {
  let node = rootMetadata.eventEmitterTree;

  for (const key of prefixPath) {
    const next = node.get(key);
    if (!next) return;
    node = next;
  }

  const walk = (
    tree: Tree<string | symbol, StateMetadata>,
    suffixPath: (string | symbol)[],
  ) => {
    if (suffixPath.length > 0) {
      const value = getAtPathMaybe(nextRootValue, suffixPath);

      if (emitReplace) {
        tree.value.emit("replace", value);
      }
      tree.value.emit("set", value);
    }

    for (const [key, child] of tree.children) {
      walk(child, [...suffixPath, key]);
    }
  };

  for (const [key, child] of node.children) {
    walk(child, [key]);
  }
}
