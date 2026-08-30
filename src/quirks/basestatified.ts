import { EnumerableWeakSet } from "../EnumerableWeakSet.js";
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
  emitCollectionTransition,
  extract,
  hook,
  StateMetadata,
  unhook,
  type StatifiableObj,
} from "../low.js";

type ClassType<T extends any[] = any[], U = object> = new (...args: T) => U;

const pendingAssemblies = new EnumerableWeakSet<object>();

const shimCache = new WeakMap<Function, object>();

function getPrototypeChainDescriptor(
  obj: object,
  prop: string | symbol,
): PropertyDescriptor | undefined {
  let curr: object | null = obj;
  while (curr !== null) {
    const desc = Object.getOwnPropertyDescriptor(curr, prop);
    if (desc) return desc;
    curr = Object.getPrototypeOf(curr);
  }
  return undefined;
}

function clearAssembly(assembly: object) {
  for (const key of Reflect.ownKeys(assembly)) {
    const value = Reflect.get(assembly, key);

    Reflect.deleteProperty(assembly, key);

    (assembly as Record<string | symbol, unknown>)[key] = value;
  }

  console.log(Reflect.ownKeys(assembly));

  pendingAssemblies.delete(assembly);
}

export function clearPendingAssemblies() {
  for (const assembly of pendingAssemblies) {
    clearAssembly(assembly);
  }
}

export function makeStatified<
  SuperclassType extends ClassType<any[], object>,
  StateLayer extends object = {},
>(
  Superclass: SuperclassType,
): SuperclassType & ClassType<any[], Statify<StateLayer>> {

  if (shimCache.has(Superclass)) {
    return shimCache.get(Superclass) as typeof Superclass & ClassType<any[], Statify<StateLayer>>;
  }

  const dataLayers = new WeakMap<object, object>();
  function getDataLayer(recv: object): object {
    if (!dataLayers.has(recv)) {
      dataLayers.set(recv, {});
    }
    return dataLayers.get(recv)!;
  }

  const ExtractionShimBase = function (...args: typeof Superclass extends ClassType<infer Args, object> ? Args : never) {
    const inst = Reflect.construct(Superclass, args, new.target);

    if (!pendingAssemblies.has(inst)) {
      setMetadataOf(
        inst as unknown as Statify<StatifiableObj>,
        new StateMetadata(),
      );
      pendingAssemblies.add(inst);
    }

    queueMicrotask(() => {
      clearPendingAssemblies();
    });

    const proto = new Proxy({}, {
      get(target, prop, receiver) {
        const result = Reflect.get(target, prop, receiver);

        if (getGlobalStateMode() === "extract-proxy-path") {
          if (prop === exitProxySymbol) {
            return { path: [], stateRoot: receiver };
          }

          return extract(result, receiver, [prop]);
        }

        return result;
      },
    });

    Reflect.setPrototypeOf(proto, Reflect.getPrototypeOf(inst))

    Reflect.setPrototypeOf(inst, proto);

    if (!dataLayers.has(inst)) {
      dataLayers.set(inst, {});
    }

    setMetadataOf(inst, new StateMetadata());

    return inst;
  }

  ExtractionShimBase.prototype = new Proxy({}, {
    get(target, prop, recv) {
      const dataLayer = getDataLayer(recv);
      return dataLayer && Reflect.has(dataLayer, prop)
        ? Reflect.get(dataLayer, prop)
        : Reflect.get(target, prop, recv);
    },

    set(target, prop, newVal, recv) {
      const stateMetadata = getMetadataOf(recv);

      const had = Reflect.has(recv, prop);
      const oldVal = Reflect.get(recv, prop) as unknown;

      const dataLayer = getDataLayer(recv);

      let result;
      const desc = getPrototypeChainDescriptor(target, prop);
      if (desc?.set || desc?.get) {
        result = Reflect.set(target, prop, newVal, recv);
      } else if (typeof prop === "string" && prop.startsWith("#")) {
        result = Reflect.set(target, prop, newVal, recv);
      } else {
        result = dataLayer && Reflect.set(dataLayer, prop, newVal);
      }

      if (result) {
        if (
          oldVal !== newVal
          && typeof newVal === "object"
          && newVal != null
          && newVal[statifySealKey]
        ) {
          const newValMetadata = getMetadataOf(newVal as Statify<StatifiableObj>);

          hook(stateMetadata, prop, newValMetadata);
        }

        if (had) {
          if (
            oldVal !== newVal
            && typeof oldVal === "object"
            && oldVal != null
            && (oldVal as any)[statifySealKey]
          ) {
            const oldValMetadata = getMetadataOf(oldVal as Statify<StatifiableObj>);

            unhook(stateMetadata, prop, oldValMetadata);
          }

          emitCollectionTransition(oldVal, newVal);

          if (
            typeof prop !== "symbol" &&
            Number.isInteger(Number(prop)) &&
            Array.isArray(target)
          ) {
            stateMetadata.emit('replaceElement', newVal, Number(prop));
          }

          stateMetadata.emit('replaceProp', newVal, prop);
        } else {
          if (
            typeof prop !== "symbol" &&
            Number.isInteger(Number(prop)) &&
            Array.isArray(target)
          ) {
            stateMetadata.emit('spliceInElement', newVal, Number(prop));
          }

          stateMetadata.emit('addProp', newVal, prop);
        }

        stateMetadata.emit('setProp', newVal, prop);

        const maybeEventEmitterAtVal = stateMetadata.eventEmitterAtPathMaybe([prop]);
        if (maybeEventEmitterAtVal) {
          if (had) {
            maybeEventEmitterAtVal.emit('replace', newVal);
          }

          maybeEventEmitterAtVal.emit('set', newVal);

          emitDescendantPathEvents(
            stateMetadata,
            [prop],
            newVal,
            had,
          );
        }
      }

      return result;
    },
  });

  Reflect.setPrototypeOf(ExtractionShimBase.prototype, Superclass.prototype);

  shimCache.set(Superclass, ExtractionShimBase);

  return ExtractionShimBase as unknown as typeof Superclass & ClassType<any[], Statify<StateLayer>>;
}

export const makeBaseStatified = <T extends object>() => makeStatified<typeof Object, T>(Object);
