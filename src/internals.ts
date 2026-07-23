import type { ProxyMetadata, StatifiableObj } from "./low.js";

export const ExitProxySymbol = Symbol();

// The mode is used by the functions exposed by informa,
// no concurrency issues arise because of the unique call stack.
export let globalStateMode: "normal" | "extract-proxy-path" = "normal";
export function setGlobalStateMode(mode: "normal" | "extract-proxy-path") {
  globalStateMode = mode;
}

export const metadata = new WeakMap<object, ProxyMetadata>();

export const proxyMemoized = new WeakMap<object, Statify<StatifiableObj>>();

export const statifySealKey = Symbol();
export type Statify<T extends StatifiableObj> = T & { [statifySealKey]: true };
