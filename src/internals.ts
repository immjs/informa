import type { StateMetadata, Exitable, StatifiableObj } from "./low.js";

export const exitProxySymbol = Symbol();

// The mode is used by the functions exposed by informa,
// no concurrency issues arise because of the unique call stack.
export let globalStateMode: "normal" | "extract-proxy-path" = "normal";
export function setGlobalStateMode(mode: "normal" | "extract-proxy-path") {
  globalStateMode = mode;
}

export const metadataMap = new WeakMap<Statify<StatifiableObj>, StateMetadata>();
export function getMetadataOf(v: Statify<StatifiableObj>) {
  const result = metadataMap.get(v);

  if (!result) throw new Error("Assertion failed: Metadata should have been created alongside statified object");

  return result;
}
export function setMetadataOf(v: Statify<StatifiableObj>, s: StateMetadata) {
  metadataMap.set(v, s);

  return s;
}

export const proxyMemoized = new WeakMap<object, Statify<StatifiableObj>>();

export const statifySealKey = Symbol();
export function isStatified<T extends StatifiableObj>(v: T): v is Statify<T> {
  return (v as Statify<T>)[statifySealKey];
}
export type Statify<T extends StatifiableObj> = T & { [statifySealKey]: true } & Exitable;
