import { ExitProxySymbol, globalStateMode, metadata, proxyMemoized, statifySealKey, type Statify } from "./internals.js";
import { EventEmitter } from "node:events";

export class ProxyMetadata extends EventEmitter<{
  "changeDeep": [unknown], // fn return value
  "replaceProp": [string | symbol],
  "deleteProp": [string | symbol],
  "setProp": [string | symbol],
}> {
  listenAtPath(path: (string | symbol)[], callback: () => {}) {
    if (path.length === 0) throw new Error();

    if (path.length === 1) {
      return this.on("setProp", (prop) => prop === path[0] && callback());
    }

    // const statifiedNext = this.proxy[path[0]! as keyof typeof this.proxy];

    if (statifiedNext)
  }
}

export interface ExitProxyValue {
  path: (string | symbol)[],
  stateRoot: object,
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
    const proxyMetadata: ProxyMetadata = new ProxyMetadata();

    const result = new Proxy(target, {
      get(target, prop, recv) {
        if (prop === statifySealKey) return true;

        const result = Reflect.get(target, prop, recv);

        if (globalStateMode === "extract-proxy-path") {
          if (prop === ExitProxySymbol) {
            return { path: [], stateRoot: target };
          }

          return extract(result, target, [prop])
        }

        return statifyNoCheck(result, false);
      },

      set(target, prop, newVal, recv) {
        const had = Reflect.has(target, prop);

        const result = Reflect.set(target, prop, newVal, recv);

        if (result) {
          if (had) {
            proxyMetadata.emit('changeProp', prop);
          }

          proxyMetadata.emit('setProp', prop);
        }

        return result;
      },

      deleteProperty(target, prop) {
        proxyMetadata.emit('deleteProp', prop);

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

    metadata.set(result, proxyMetadata);
    proxyMemoized.set(target, result);

    return result;
  }
}

function extract(
  targetMaybePrimitive: unknown,
  stateRoot: object,
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
