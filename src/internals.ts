import type { StateMetadata, Exitable, StatifiableObj } from "./low.js";

// Single shared namespace object on globalThis
interface InformaGlobalContext {
  mode: "normal" | "extract-proxy-path";
  metadataMap: WeakMap<Statify<StatifiableObj>, StateMetadata>;
  proxyMemoized: WeakMap<object, Statify<StatifiableObj>>;
}

const INFORMA_GLOBAL_KEY = "__INFORMA__";

const informaGlobal: InformaGlobalContext = Reflect.get(globalThis, INFORMA_GLOBAL_KEY) ?? {
  mode: "normal",
  metadataMap: new WeakMap(),
  proxyMemoized: new WeakMap(),
};

Reflect.defineProperty(globalThis, INFORMA_GLOBAL_KEY, { value: informaGlobal, configurable: true, writable: true });

export const exitProxySymbol = "__informa_exit_proxy__";

export const globalStateMode = informaGlobal;

export function setGlobalStateMode(mode: "normal" | "extract-proxy-path") {
  informaGlobal.mode = mode;
}

export function getGlobalStateMode(): "normal" | "extract-proxy-path" {
  return informaGlobal.mode;
}

export const metadataMap = informaGlobal.metadataMap;

export function getMetadataOf(v: Statify<StatifiableObj>) {
  const result = metadataMap.get(v);

  if (!result) throw new Error("Assertion failed: Metadata should have been created alongside statified object");

  return result;
}

export function setMetadataOf(v: Statify<StatifiableObj>, s: StateMetadata) {
  metadataMap.set(v, s);

  return s;
}

export const proxyMemoized = informaGlobal.proxyMemoized;

export const statifySealKey = "__informa_statify_seal__";
export function isStatified<T extends StatifiableObj>(v: T): v is Statify<T> {
  return Boolean((v as any)?.[statifySealKey]);
}
export type Statify<T extends StatifiableObj> = T & { [statifySealKey]: true } & Exitable;

export const isStatifiedSetKey = "__informa_is_statified_set__";
export const isStatifiedArrayKey = "__informa_is_statified_array__";
export const isStatifiedMapKey = "__informa_is_statified_map__";
