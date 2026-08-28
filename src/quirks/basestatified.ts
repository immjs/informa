import { EnumerableWeakMap } from "../EnumerableWeakMap.js";
import { EnumerableWeakSet } from "../EnumerableWeakSet.js";
import {
  exitProxySymbol,
  getMetadataOf,
  getGlobalStateMode,
  isStatified,
  metadataMap,
  setMetadataOf,
  statifySealKey,
  type Statify,
} from "../internals.js";
import {
  emitDescendantPathEvents,
  emitCollectionTransition,
  extract,
  hook,
  registerPreExtractionHook,
  StateMetadata,
  unhook,
  type StatifiableObj,
} from "../low.js";

type ClassType<T extends any[] = any[], U = object> = new (...args: T) => U;

// Classes whose instances have been constructed but not yet field-instrumented.
const pendingAssemblies = new EnumerableWeakSet<object>();

// Map from a still-pending child instance → list of (parentMetadata, prop) pairs
// that need hook() called once the child is reconciled.
const deferredHooks = new EnumerableWeakMap<object, { metadata: StateMetadata; prop: string | symbol }[]>();

// One shim proxy per outermost constructor (new.target).
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

const shimHandler: ProxyHandler<object> = {
  get(target, prop, recv) {
    // Always signal that this object is statified.
    if (prop === statifySealKey) return true;

    if (getGlobalStateMode() === "extract-proxy-path") {
      // Root-level exit: this instance IS the stateRoot.
      if (prop === exitProxySymbol) {
        return { path: [], stateRoot: recv as Statify<StatifiableObj> };
      }

      // Safety net: reconcile if somehow still pending at extraction time.
      if (pendingAssemblies.has(recv as object)) {
        reconcileInstance(recv as object);
      }

      // Forward to extract() so the path is captured.
      // Own accessor properties on recv are already handling extract-proxy-path
      // themselves; the shim is only reached for prototype-level props.
      return extract(
        Reflect.get(target, prop, recv),
        recv as Statify<StatifiableObj>,
        [prop],
      );
    }

    return Reflect.get(target, prop, recv);
  },

  set(target, prop, newVal, recv) {
    // This trap fires only when `prop` is NOT an own property of `recv`.
    // That covers:
    //   (a) Pre-reconciliation field initializer writes → create own data prop.
    //   (b) Prototype accessor writes (e.g. `get state()` / `set state()`).
    //   (c) Genuinely new dynamic property additions.
    //
    // Own accessor properties installed by reconcileInstance are handled
    // by their own setters and never reach here.

    // Check for a prototype-level accessor setter BEFORE calling Reflect.set.
    const protoDesc = getPrototypeChainDescriptor(target, prop);

    // Delegate the actual assignment.
    const result = Reflect.set(target, prop, newVal, recv);

    // If this was a prototype accessor write and the instance has metadata,
    // emit replacement events so subscribers fire.
    if (result && protoDesc?.set && metadataMap.has(recv as Statify<StatifiableObj>)) {
      const stateMetadata = getMetadataOf(recv as Statify<StatifiableObj>);
      stateMetadata.emit("replaceProp", newVal, prop);
      const ee = stateMetadata.eventEmitterAtPathMaybe([prop]);
      if (ee) {
        ee.emit("replace", newVal);
        emitDescendantPathEvents(stateMetadata, [prop], newVal, true);
      }
    }

    return result;
  },

  has(target, prop) {
    if (prop === statifySealKey || prop === exitProxySymbol) return true;
    return Reflect.has(target, prop);
  },
};

function getOrCreateShim(ctor: Function): object {
  const cached = shimCache.get(ctor);
  if (cached) return cached;

  // shimTarget's [[Prototype]] = ctor.prototype, so the full chain is:
  //   instance → shim → shimTarget → ctor.prototype → … → Superclass.prototype
  // This preserves instanceof for all classes in the chain.
  const shimTarget = Object.create((ctor as ClassType).prototype) as object;
  const shim = new Proxy(shimTarget, shimHandler);
  shimCache.set(ctor, shim);
  return shim;
}

/**
 * Converts all enumerable, configurable own data properties of `instance` into
 * accessor-backed reactive properties connected to `instance`'s StateMetadata.
 *
 * Idempotent: returns immediately if the instance is not in pendingAssemblies.
 */
function reconcileInstance(instance: object): void {
  if (!pendingAssemblies.has(instance)) return;
  pendingAssemblies.delete(instance);

  // Drain any deferred hooks where this instance was the pending child.
  const deferred = deferredHooks.get(instance);
  if (deferred) {
    deferredHooks.delete(instance);
    const childMetadata = getMetadataOf(instance as Statify<StatifiableObj>);
    for (const { metadata: parentMetadata, prop } of deferred) {
      hook(parentMetadata, prop, childMetadata);
    }
  }

  // Metadata was installed eagerly in ExtractionShimBase's constructor.
  const metadata = getMetadataOf(instance as Statify<StatifiableObj>);

  const isArray = Array.isArray(instance);

  const props: (string | symbol)[] = [
    ...Object.getOwnPropertyNames(instance),
    ...Object.getOwnPropertySymbols(instance),
  ];

  for (const prop of props) {
    // Skip Informa internal symbols.
    if (prop === statifySealKey || prop === exitProxySymbol) continue;

    // Skip array numeric indices — managed by the array's own push/pop/splice overrides.
    if (isArray && typeof prop === "string" && Number.isInteger(Number(prop))) continue;

    const desc = Object.getOwnPropertyDescriptor(instance, prop)!;

    // Non-configurable: cannot be redefined; leave non-reactive.
    // Note: these properties retain their value but won't participate in the
    // observable graph. This is intentional and tested.
    if (!desc.configurable) continue;

    // Existing accessor (get/set): do not double-wrap.
    if ("get" in desc || "set" in desc) continue;

    // ---- Instrument this configurable data property ----
    let value: unknown = desc.value;

    // Hook the initial value if it is itself statified.
    if (
      value != null &&
      typeof value === "object" &&
      isStatified(value as StatifiableObj)
    ) {
      if (pendingAssemblies.has(value as object)) {
        // The nested value is itself pending (constructed during this constructor
        // but not yet reconciled — its metadata doesn't exist yet). Defer the
        // hook: it will be wired once reconcileInstance runs for that child.
        deferredHooks.getOrInsertComputed(value as object, () => []).push({ metadata, prop });
      } else {
        hook(metadata, prop, getMetadataOf(value as Statify<StatifiableObj>));
      }
    }

    Object.defineProperty(instance, prop, {
      get(this: object) {
        if (getGlobalStateMode() === "extract-proxy-path") {
          return extract(value, this as Statify<StatifiableObj>, [prop]);
        }
        return value;
      },

      set(this: object, next: unknown) {
        const old = value;
        value = next;

        if (old !== next) {
          if (
            old != null &&
            typeof old === "object" &&
            isStatified(old as StatifiableObj)
          ) {
            unhook(metadata, prop, getMetadataOf(old as Statify<StatifiableObj>));
          }

          if (
            next != null &&
            typeof next === "object" &&
            isStatified(next as StatifiableObj)
          ) {
            hook(metadata, prop, getMetadataOf(next as Statify<StatifiableObj>));
          }

          emitCollectionTransition(old, next);
        }

        // Enter the existing replacement machinery — same path as statifyObject's
        // set trap in low.ts. "listen → replace → fire" is preserved because this
        // accessor is installed before any external mutation can reach the field.
        metadata.emit("replaceProp", next, prop);

        const ee = metadata.eventEmitterAtPathMaybe([prop]);
        if (ee) {
          ee.emit("replace", next);
          emitDescendantPathEvents(metadata, [prop], next, true);
        }
      },

      enumerable: desc.enumerable ?? true,
      configurable: true,
    });
  }

  // Selector/stateRoot identity: verified correct. Every on*()/off*() call goes
  // through selectorToRootAndPath(), which fires preExtractionHooks() before
  // entering extract-proxy-path mode. The preExtractionHook registered below
  // reconciles all pending instances first — so by the time the selector function
  // runs, every pending `this.x` field is already an accessor that returns
  // extract(value, this, ['x']). Path chains like `() => this.a.b.c` are therefore
  // built up correctly, and stateRoot is the raw instance, which is the same object
  // keyed in metadataMap. No re-mapping needed.
}

// Before selectorToRootAndPath enters extract-proxy-path mode it calls all
// registered hooks. This hook reconciles every pending instance so that their
// own data properties are already accessor-backed when the selector runs.

registerPreExtractionHook(() => {
  // Snapshot: reconcileInstance removes from pendingAssemblies, which mutates
  // the set during iteration — take a copy first.
  const snapshot = [...pendingAssemblies];
  for (const instance of snapshot) {
    reconcileInstance(instance);
  }
});

/**
 * Wraps a user-defined class factory in the Informa observable lifecycle.
 *
 * Usage:
 * ```ts
 * const MyClass = statifyClass(
 *   (Base) => class MyClass extends Base {
 *     name = "default";
 *     constructor(name: string) { super(); this.name = name; }
 *   },
 *   Object,
 * );
 * ```
 *
 * Construction lifecycle:
 *   1. ExtractionShimBase constructor runs → metadata installed, shim set as prototype.
 *   2. UserSubclass field initializers run → own data properties created on instance.
 *   3. UserSubclass constructor body runs.
 *   4. Instance is in pendingAssemblies (field instrumentation deferred).
 *   5. On first `on()`/`off()` call → registerPreExtractionHook fires → reconcileInstance
 *      converts own data properties to reactive accessor-backed properties.
 */
export function statifyClass<
  SubclassType extends ClassType<ArgsSub, OutSub>,
  ArgsSub extends any[],
  OutSub extends object,
  SuperclassType extends ClassType<ArgsSuper, OutSuper>,
  ArgsSuper extends any[],
  OutSuper extends object,
>(
  makeSubclass: (SuperclassIn: SuperclassType) => SubclassType,
  Superclass: SuperclassType,
): SubclassType & ClassType<ArgsSub, Statify<OutSub>> {

  // ExtractionShimBase sits between Superclass and the user's class.
  // Its constructor:
  //   - Installs StateMetadata on the instance eagerly (so subclasses like
  //     StatifiedArray can call getMetadataOf() from their constructor bodies).
  //   - Marks the instance as pending for lazy field instrumentation.
  //   - Inserts the shim proxy as the instance's [[Prototype]], enabling
  //     statifySealKey / exitProxySymbol / extract-proxy-path handling.
  //
  // Guard: in nested statifyClass chains (e.g. statifyClass(..., A) where A
  // was itself produced by statifyClass), multiple ExtractionShimBase
  // constructors run. The guard ensures setup happens exactly once — at the
  // innermost (deepest) ExtractionShimBase call.
  class ExtractionShimBase extends (Superclass as unknown as typeof Object) {
    constructor(...args: any[]) {
      super(...(args as []));

      if (!pendingAssemblies.has(this)) {
        setMetadataOf(
          this as unknown as Statify<StatifiableObj>,
          new StateMetadata(),
        );
        pendingAssemblies.add(this);
      }

      // Always update the shim to match the outermost constructor (new.target).
      // In nested chains the innermost ExtractionShimBase sets the shim first;
      // subsequent (shallower) ones overwrite it with the same value since
      // new.target propagates as the outermost class throughout the chain.
      const ctor = (new.target ?? ExtractionShimBase) as Function;
      Reflect.setPrototypeOf(this, getOrCreateShim(ctor));
    }
  }

  // Invoke the user's factory with the shim base, then return the result.
  // No outer Statified wrapper is needed: field instrumentation is lazy,
  // triggered by registerPreExtractionHook before any selectorToRootAndPath call.
  return makeSubclass(
    ExtractionShimBase as unknown as SuperclassType,
  ) as unknown as SubclassType & ClassType<ArgsSub, Statify<OutSub>>;
}

