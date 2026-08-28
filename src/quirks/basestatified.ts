import {
  exitProxySymbol,
  getMetadataOf,
  getGlobalStateMode,
  setMetadataOf,
  statifySealKey,
  type Statify,
} from "../internals.js";
import {
  emitDescendantPathEvents,
  extract,
  hook,
  StateMetadata,
  unhook,
  type ExitProxyValue,
  type StatifiableObj,
} from "../low.js";

type ClassType<T extends any[] = any[], U = object> = new (...args: T) => U;
const classMapMemo = new WeakMap<ClassType, ClassType>();

const blanketProtoMemo = new WeakMap<object, object>();
const blanketProtoSet = new WeakSet<object>();

function getBlanketPrototype(actualProto: object) {
  const maybeMemoed = blanketProtoMemo.get(actualProto);
  if (maybeMemoed) return maybeMemoed;

  const storage = Object.create(actualProto) as {
    [statifySealKey]: true;
    [exitProxySymbol]: ExitProxyValue;
  };
  // storage[statifySealKey] = true;

  const blanket = new Proxy(storage, {
    get(target, prop, recv) {
      if (prop === statifySealKey) return true;

      if (getGlobalStateMode() === "extract-proxy-path") {
        if (prop === exitProxySymbol) {
          return { path: [], stateRoot: recv as Statify<StatifiableObj> };
        }

        return extract(undefined, recv as Statify<StatifiableObj>, [prop]);
      }

      return Reflect.get(target, prop, recv);
    },

    set(target, prop, newVal, recv) {
      const stateMetadata = getMetadataOf(recv as Statify<StatifiableObj>);

      const had = Reflect.has(recv, prop);
      const oldVal = Reflect.get(recv, prop) as unknown;

      const result = Reflect.set(target, prop, newVal, recv);

      try {
        if (result) {
          if (
            typeof newVal === "object"
            && newVal != null
            && (newVal as any)[statifySealKey]
          ) {
            hook(
              stateMetadata,
              prop,
              getMetadataOf(newVal as Statify<StatifiableObj>),
            );
          }

          if (had) {
            if (
              oldVal !== newVal
              && typeof oldVal === "object"
              && oldVal != null
              && (oldVal as any)[statifySealKey]
            ) {
              unhook(
                stateMetadata,
                prop,
                getMetadataOf(oldVal as Statify<StatifiableObj>),
              );
            }

            stateMetadata.emit("replaceProp", newVal, prop);
          }

          stateMetadata.emit("setProp", newVal, prop);

          const maybeEventEmitterAtPath = stateMetadata.eventEmitterAtPathMaybe([prop]);
          if (maybeEventEmitterAtPath) {
            if (had) {
              maybeEventEmitterAtPath.emit("replace", newVal);
            }

            maybeEventEmitterAtPath.emit("set", newVal);

            emitDescendantPathEvents(
              stateMetadata,
              [prop],
              newVal,
              had,
            );
          }
        }
      } finally {
        return result;
      }
    },

    has(target, prop) {
      if (getGlobalStateMode() === "extract-proxy-path" && prop === exitProxySymbol) {
        return true;
      }

      return Reflect.has(target, prop);
    },
  });

  blanketProtoMemo.set(actualProto, blanket);
  blanketProtoSet.add(blanket);

  return blanket;
}

export function makeStatified<
  V extends ClassType<T, U>,
  T extends any[],
  U extends object,
>(
  OriginalClass: V,
): V {
  const maybeMemoed = classMapMemo.get(OriginalClass);
  if (maybeMemoed) return maybeMemoed as V;

  // @ts-ignore - ts-2545 "A mixin class must have a constructor with a single rest parameter of type 'any[]'."
  class Statified extends OriginalClass {
    constructor(...args: T) {
      super(...args);

      const ctor = new.target ?? Statified;
      const inst = Reflect.construct(OriginalClass, args, ctor) as Statify<U>;

      setMetadataOf(inst, new StateMetadata());

      const actualProto = ctor.prototype;
      const finalProto = blanketProtoSet.has(actualProto)
        ? actualProto
        : getBlanketPrototype(actualProto);

      Reflect.setPrototypeOf(inst, finalProto);

      return inst;
    }
  };

  classMapMemo.set(OriginalClass, Statified);

  return Statified;
}

export const BaseStatified = makeStatified(Object);
