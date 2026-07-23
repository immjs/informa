import { ExitProxySymbol, setGlobalStateMode, type Statify } from "./internals.js";
import { statifyNoCheck, type Exitable, type ExitProxyValue, type StatifiableObj, type Statified } from "./low.js";

export function state<T extends StatifiableObj>(original: T): Statified<T> {
  const clone = structuredClone(original);

  return statifyNoCheck(clone, true);
}

interface ListenersBase {
  change?(): unknown;
}
interface ListenersForMultiple extends ListenersBase {
  ancestors?: {
    dismount?(): unknown;
  };
}
interface ListenersForSingle extends ListenersBase {
  dismount?(): unknown;
}
type Listeners = ListenersForSingle | ListenersForMultiple;

export function on(
  ...[selector, action]:
    [(() => Exitable)[], ListenersForMultiple] |
    [() => Exitable, ListenersForSingle]
) {
  let actuallySelected: ExitProxyValue[];

  {
    setGlobalStateMode("extract-proxy-path");

    if (Array.isArray(selector)) {
      actuallySelected = selector.map((v) => (v() as Exitable)[ExitProxySymbol]);
    } else {
      const selected = (selector() as Exitable)[ExitProxySymbol];
      actuallySelected = [selected];
    }

    setGlobalStateMode("normal");
  }

  if (actuallySelected.some((v, _, a) => v.stateRoot !== a[0]!.stateRoot)) {
    throw new Error("State roots are not the same");
  }

  const normalizedAction: Listeners = typeof action === "function" ? { change: action } : action;

  
}

const a = state({ hello: {} });

a.hello = state({});
