import type { StateMetadata, Exitable, StatifiableObj } from "./low.js";
import { version } from "../package.json";

export const exitProxySymbol = Symbol.for(`hi-this-is-informa-${version}-s--exit-proxy-symbol`);

// The mode is used by the functions exposed by informa,
// no concurrency issues arise because of the unique call stack.
const globalStateModeSymbol = Symbol.for(`hi-this-is-informa-${version}-s--global-state-mode`);
export function setGlobalStateMode(mode: "normal" | "extract-proxy-path") {
  if (getGlobalStateMode() === mode) return;

  if (mode === "normal") {
    Reflect.deleteProperty(globalThis, globalStateModeSymbol);
  } else {
    Reflect.defineProperty(globalThis, globalStateModeSymbol, { value: mode, configurable: true });
  }
}
export function getGlobalStateMode() {
  return Reflect.get(globalThis, globalStateModeSymbol) ?? "normal";
}

const metadataMapSymbol = Symbol.for(`hi-this-is-informa-${version}-s--metadata-map`);
export const metadataMap = Reflect.get(globalThis, metadataMapSymbol) ?? new WeakMap<Statify<StatifiableObj>, StateMetadata>();

Reflect.defineProperty(globalThis, metadataMapSymbol, { value: metadataMap });

export function getMetadataOf(v: Statify<StatifiableObj>) {
  const result = metadataMap.get(v);

  if (!result) throw new Error("Assertion failed: Metadata should have been created alongside statified object");

  return result;
}
export function setMetadataOf(v: Statify<StatifiableObj>, s: StateMetadata) {
  metadataMap.set(v, s);

  return s;
}

const proxyMemoizedSymbol = Symbol.for(`hi-this-is-informa-${version}-s--proxy-memoized`);
export const proxyMemoized = Reflect.get(globalThis, proxyMemoizedSymbol) ?? new WeakMap<object, Statify<StatifiableObj>>();

Reflect.defineProperty(globalThis, proxyMemoizedSymbol, { value: proxyMemoized });

export const statifySealKey = Symbol.for(`hi-this-is-informa-${version}-s--statify-seal-key`);
export function isStatified<T extends StatifiableObj>(v: T): v is Statify<T> {
  return (v as Statify<T>)[statifySealKey];
}
export type Statify<T extends StatifiableObj> = T & { [statifySealKey]: true } & Exitable;

export const isStatifiedSetKey = Symbol.for(`hi-this-is-informa-${version}-s--isStatifiedSet`);
export const isStatifiedArrayKey = Symbol.for(`hi-this-is-informa-${version}-s--isStatifiedArray`);
export const isStatifiedMapKey = Symbol.for(`hi-this-is-informa-${version}-s--isStatifiedMap`);
