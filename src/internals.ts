import type { StateMetadata, Exitable, StatifiableObj } from "./low.js";
import { EnumerableWeakSet } from "./EnumerableWeakSet.js";

// Single root namespace object on globalThis containing shared state and symbols
interface InformaGlobalContext {
  mode: "normal" | "extract-proxy-path";
  metadataMap: WeakMap<Statify<StatifiableObj>, StateMetadata>;
  proxyMemoized: WeakMap<object, Statify<StatifiableObj>>;
  exitProxySymbol: symbol;
  statifySealKey: symbol;
  isStatifiedSetKey: symbol;
  isStatifiedArrayKey: symbol;
  isStatifiedMapKey: symbol;
  pendingAssemblies: EnumerableWeakSet<object>;
}

const INFORMA_GLOBAL_KEY = "__INFORMA__";

const existingGlobal: InformaGlobalContext | undefined = Reflect.get(globalThis, INFORMA_GLOBAL_KEY);

export const exitProxySymbol: unique symbol = (existingGlobal?.exitProxySymbol ?? Symbol("informa.exitProxySymbol")) as any;
export const statifySealKey: unique symbol = (existingGlobal?.statifySealKey ?? Symbol("informa.statifySealKey")) as any;
export const isStatifiedSetKey: unique symbol = (existingGlobal?.isStatifiedSetKey ?? Symbol("informa.isStatifiedSet")) as any;
export const isStatifiedArrayKey: unique symbol = (existingGlobal?.isStatifiedArrayKey ?? Symbol("informa.isStatifiedArray")) as any;
export const isStatifiedMapKey: unique symbol = (existingGlobal?.isStatifiedMapKey ?? Symbol("informa.isStatifiedMap")) as any;

const informaGlobal: InformaGlobalContext = existingGlobal ?? {
  mode: "normal",
  metadataMap: new WeakMap(),
  proxyMemoized: new WeakMap(),
  exitProxySymbol,
  statifySealKey,
  isStatifiedSetKey,
  isStatifiedArrayKey,
  isStatifiedMapKey,
  pendingAssemblies: new EnumerableWeakSet(),
};

informaGlobal.pendingAssemblies ??= new EnumerableWeakSet();

Reflect.defineProperty(globalThis, INFORMA_GLOBAL_KEY, {
  value: informaGlobal,
  configurable: true,
  writable: true,
});

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
export const pendingAssemblies = informaGlobal.pendingAssemblies;

export function isStatified<T extends StatifiableObj>(v: T): v is Statify<T> {
  return Boolean((v as any)?.[statifySealKey]);
}

export type Statify<T extends StatifiableObj> = T & { [statifySealKey]: true } & Exitable;
