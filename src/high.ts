import { ExitProxySymbol, metadataMap, setGlobalStateMode, type Statify } from "./internals.js";
import { statifyNoCheck, type Exitable, type StatifiableObj, type Statified } from "./low.js";

export function state<T extends StatifiableObj>(original: T): Statified<T> {
  const clone = structuredClone(original);

  return statifyNoCheck(clone, true);
}

interface Options {
  dismount?(): unknown;
}

interface Listeners<T> {
  change?(v: T): void;
}

interface ArrayListeners<T> extends Listeners<T> {
  push?(v: T, i: number, a: T[]): void;
  splice?(v: T): void;
}

export function on<T, U>(
  ...[selector, listeners, options]:
    [() => T, Listeners<T>] |
    [() => T, Listeners<T>, Options | undefined] |
    [() => Statify<U[]>, ArrayListeners<U>] |
    [() => Statify<U[]>, ArrayListeners<U>, Options | undefined]
): () => void {
  setGlobalStateMode("extract-proxy-path");

  const { path, stateRoot } = (selector() as Exitable)[ExitProxySymbol];

  setGlobalStateMode("normal");

  const metadata = metadataMap.get(stateRoot);

  if (!metadata) throw new Error("Assertion failed: Metadata should have been created alongside proxy");

  const eventEmitter = metadata.eventEmitterAtPath(path);

  for (const [key, value] of Object.entries(listeners)) {
    eventEmitter.on(key, value);
  }

  return () => {
    for (const [key, value] of Object.entries(listeners)) {
      eventEmitter.on(key, value);
    }
  }
}

function onChange<T>(s: () => T, l: (v: T) => void, o?: Options) {
  return on(s, { change: l }, o);
}

function onPush<T>(s: () => Statify<T[]>, l: (v: T, i: number, a: T[]) => void, o?: Options) {
  return on(s, { push: l }, o);
}

export default {
  on,
  onChange,
  onPush,
  state,
};
