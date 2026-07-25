import { EventBroadcaster } from "./EventBroadcaster.js";
import { ExitProxySymbol, globalStateMode, metadataMap, proxyMemoized, statifySealKey, type Statify } from "./internals.js";
import { EventEmitter } from "node:events";

type ProxyEventEmitterEvents = {
  "changeDeep": [unknown],
  "replaceProp": [string | symbol],
  "deleteProp": [string | symbol],
  "setProp": [string | symbol],
};

export class ProxyEventEmitter extends EventEmitter<ProxyEventEmitterEvents> {

}

class Tree<T, U> {
  value: U;
  children = new Map<T, Tree<T, U>>();

  constructor(value: U) {
    this.value = value;
  }
}

export class StateMetadata extends EventBroadcaster<ProxyEventEmitterEvents> {
  eventEmitterRoot = new ProxyEventEmitter();
  eventEmitterTree = new Tree<string | symbol, ProxyEventEmitter>(this.eventEmitterRoot);

  eventEmitterAtPath(path: (string | symbol)[]) {
    if (path.length === 0) throw new Error();

    // if (path.length === 1) {
    //   return this.eventEmitterTree.value.on("setProp", (prop) => prop === path[0] && callback());
    // }

    let node = this.eventEmitterTree;
    for (let i = 0; i < path.length; i += 1) {
      const nextAccess = path[i]!;
      if (node.children.has(nextAccess)) {
        node = node.children.get(nextAccess)!;
      } else {
        const nextValue = new Tree<string | symbol, ProxyEventEmitter>(new ProxyEventEmitter());
        node.children.set(nextAccess, nextValue);
        node = nextValue;
      }
    }

    return node.value;
  }
}

export interface ExitProxyValue {
  path: (string | symbol)[],
  stateRoot: Statify<StatifiableObj>,
}

export interface Exitable {
  [ExitProxySymbol]: ExitProxyValue;
}

export type StatifiableProp = boolean | string | number | bigint | symbol | null | undefined | Statify<StatifiableObj>;
export type StatifiableObj = { [k: string | symbol]: StatifiableProp } | {};

export type Statified<T> = T extends object ? Statify<{ [K in keyof T]: Statified<T[K]> }> : T;

export function statifyNoCheck<T extends StatifiableObj>(target: T, expectObject: true): Statified<T> & Exitable;
export function statifyNoCheck(target: StatifiableProp, expectObject: false): typeof target;
export function statifyNoCheck(target: StatifiableProp, expectObject: boolean) {
  if (typeof target !== "object" || target === null) {
    if (expectObject) {
      throw new Error("Expected an object");
    } else {
      return target;
    }
  }

  if (proxyMemoized.has(target)) {
    return proxyMemoized.get(target)
  } else {
    const stateMetadata: StateMetadata = new StateMetadata();

    const proxyObj = new Proxy(target, {
      get(target, prop, recv) {
        if (prop === statifySealKey) return true;

        const result = Reflect.get(target, prop, recv);

        if (globalStateMode === "extract-proxy-path") {
          if (prop === ExitProxySymbol) {
            return { path: [], stateRoot: proxyObj };
          }

          return extract(result, proxyObj, [prop])
        }

        return statifyNoCheck(result, false);
      },

      set(target, prop, newVal, recv) {
        const had = Reflect.has(target, prop);

        const result = Reflect.set(target, prop, newVal, recv);

        if (result) {
          if (had) {
            stateMetadata.emit('changeProp', prop);
          }

          stateMetadata.emit('setProp', prop);
        }

        return result;
      },

      deleteProperty(target, prop) {
        stateMetadata.emit('deleteProp', prop);

        return Reflect.deleteProperty(target, prop);
      },

      has(target, prop) {
        if (globalStateMode === "extract-proxy-path") {
          if (prop === ExitProxySymbol) {
            return true;
          }
        }

        return Reflect.has(target, prop);
      },
    }) as Statify<typeof target>;

    metadataMap.set(proxyObj, stateMetadata);
    proxyMemoized.set(target, proxyObj);

    return proxyObj;
  }
}

function extract(
  targetMaybePrimitive: unknown,
  stateRoot: Statify<StatifiableObj>,
  path: (string | symbol)[],
):
  Record<string | symbol, unknown> & Exitable
{
  const target = Object(targetMaybePrimitive);

  return new Proxy(target, {
    get(target, prop, recv) {
      if (prop === ExitProxySymbol) {
        return { path, stateRoot };
      }

      return extract(Reflect.get(target, prop, recv), stateRoot, [...path, prop]);
    },
    has(target, prop) {
      if (globalStateMode === "extract-proxy-path") {
        if (prop === ExitProxySymbol) return true;
      }

      return Reflect.has(target, prop);
    },
  });
}
