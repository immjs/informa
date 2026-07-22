import { ExitProxySymbol, globalMode } from "./internals";

function proxify(target: object, expectObject: true): object;
function proxify(target: any, expectObject: false): any;
function proxify(target: any, expectObject: boolean) {
  if (typeof target === "object") {
    if (expectObject) {
      throw new Error("Expected an object");
    } else {
      return target;
    }
  }

  return new Proxy(target, {
    get(target, prop, recv) {
      if (globalMode === "extract-proxy-path") {} // TODO 13:49 22/07/2026

      return proxify(Reflect.get(target, prop, recv), false);
    },
    set(target, prop, newVal, recv) {
      return Reflect.set(target, prop, newVal, recv);
    },
  });
}

function extract(target: object, stateRoot: object, ) {
  return new Proxy(target, {
    get(target, prop, recv) {
      if (prop === ExitProxySymbol) {

      }

      return Reflect.get(target, prop, recv);
    },
    set(target, prop, newVal, recv) {
      return Reflect.set(target, prop, newVal, recv);
    },
  });
}


