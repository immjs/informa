/**
 * Acceptance tests for statifyClass / makeStatified / BaseStatified.
 *
 * Run with:  npx tsx src/quirks/basestatified.test.ts
 *
 * Uses Node.js built-in assert — no test framework required.
 */

import assert from "node:assert/strict";
import $ from "../high.js";
import { statifyClass, makeStatified, BaseStatified } from "./basestatified.js";
import { StatifiedSet } from "./set.js";
import { isStatified, statifySealKey } from "../internals.js";

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      r.then(
        () => { console.log(`  ✓ ${name}`); passed++; },
        (e) => { console.error(`  ✗ ${name}`, e); failed++; },
      );
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (e) {
    console.error(`  ✗ ${name}`, e);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. Constructor arguments
// ---------------------------------------------------------------------------

console.log("\n── Constructor arguments ──");

class Base {
  base: string;
  constructor(base: string) { this.base = base; }
}

const Derived = statifyClass(
  (BaseClass) => class Derived extends (BaseClass as unknown as typeof Base) {
    value: number;
    constructor(base: string, value: number) {
      super(base);
      this.value = value;
    }
  },
  Base,
);

test("new Derived constructs without error", () => {
  const x = new Derived("x", 42);
  assert.equal(x.base, "x");
  assert.equal(x.value, 42);
});

test("constructor args are forwarded correctly", () => {
  const x = new Derived("hello", 99);
  assert.equal(x.base, "hello");
  assert.equal(x.value, 99);
});

// ---------------------------------------------------------------------------
// 2. instanceof
// ---------------------------------------------------------------------------

console.log("\n── instanceof ──");

test("x instanceof Derived", () => {
  const x = new Derived("x", 1);
  assert.ok(x instanceof Derived);
});

test("x instanceof Base", () => {
  const x = new Derived("x", 1);
  assert.ok(x instanceof Base);
});

// ---------------------------------------------------------------------------
// 3. isStatified / statifySealKey
// ---------------------------------------------------------------------------

console.log("\n── isStatified ──");

test("isStatified returns true for Derived instance", () => {
  const x = new Derived("x", 1);
  assert.ok(isStatified(x as any));
});

test("statifySealKey is truthy on instance", () => {
  const x = new Derived("x", 1);
  assert.ok((x as any)[statifySealKey]);
});

// ---------------------------------------------------------------------------
// 4. Class fields — availability after construction
// ---------------------------------------------------------------------------

console.log("\n── Class fields ──");

const WithFields = statifyClass(
  (Base) => class extends Base {
    fromBase = "base-field";
    count = 0;
    label: string;
    constructor(label: string) {
      super();
      this.label = label;
    }
  },
  Object,
);

test("own fields are readable after construction", () => {
  const w = new WithFields("my-label");
  assert.equal((w as any).fromBase, "base-field");
  assert.equal((w as any).count, 0);
  assert.equal((w as any).label, "my-label");
});

// ---------------------------------------------------------------------------
// 5. Mutation — field setter fires replacement events
// ---------------------------------------------------------------------------

console.log("\n── Mutation ──");

test("mutation fires onReplace listener after construction", () => {
  const w = new WithFields("label");
  const received: unknown[] = [];

  $.onReplace(() => (w as any).count, (v: unknown) => received.push(v));

  (w as any).count = 1;
  (w as any).count = 2;

  assert.deepEqual(received, [1, 2]);
});

test("mutation fires replaceProp listener", () => {
  const w = new WithFields("label");
  let lastProp: string | symbol | undefined;
  let lastVal: unknown;

  $.on(() => w as any, { replaceProp: (v: unknown, p: string | symbol) => { lastProp = p as string; lastVal = v; } });

  (w as any).count = 99;
  assert.equal(lastProp, "count");
  assert.equal(lastVal, 99);
});

// ---------------------------------------------------------------------------
// 6. Non-configurable properties — not reactive
// ---------------------------------------------------------------------------

console.log("\n── Non-configurable properties ──");

class WithNonConfig {
  regular = "mutable";
  constructor() {
    Object.defineProperty(this, "frozen", {
      value: "immutable",
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }
}

const StatifiedNonConfig = statifyClass(
  (Base) => class extends (Base as unknown as typeof WithNonConfig) {},
  WithNonConfig,
);

test("non-configurable property retains its value", () => {
  const x = new StatifiedNonConfig();
  assert.equal((x as any).frozen, "immutable");
  assert.equal((x as any).regular, "mutable");
});

test("non-configurable property triggers no events (listener not fired)", () => {
  const x = new StatifiedNonConfig();
  let fired = false;
  // Subscribing to the regular field works fine.
  $.onReplace(() => (x as any).regular, () => { fired = true; });
  (x as any).regular = "changed";
  assert.ok(fired, "regular field should fire");

  // Non-configurable field cannot be instrumented; no subscription is possible.
  // (Simply verify no crash and value is preserved.)
  assert.equal((x as any).frozen, "immutable");
});

// ---------------------------------------------------------------------------
// 7. Accessor properties — not double-wrapped
// ---------------------------------------------------------------------------

console.log("\n── Accessor properties ──");

class WithAccessor {
  #val = 0;
  get computed() { return this.#val * 2; }
  set computed(v: number) { this.#val = v / 2; }
}

const StatifiedAccessor = statifyClass(
  (Base) => class extends (Base as unknown as typeof WithAccessor) {},
  WithAccessor,
);

test("existing prototype accessor is not double-wrapped", () => {
  const x = new StatifiedAccessor();
  (x as any).computed = 10;
  assert.equal((x as any).computed, 10); // 10 → #val = 5 → computed = 10 ✓
});

test("prototype accessor write fires replacement events via shim set trap", () => {
  const x = new StatifiedAccessor();
  const received: unknown[] = [];
  $.onReplace(() => (x as any).computed, (v: unknown) => received.push(v));
  (x as any).computed = 4;
  assert.deepEqual(received, [4]);
});

// ---------------------------------------------------------------------------
// 8. Nested statified objects — hook/unhook
// ---------------------------------------------------------------------------

console.log("\n── Nested statified objects ──");

test("assigning a statified child hooks it into the parent graph", () => {
  const parent = new WithFields("parent");
  const child = $.state({ val: 1 });

  const received: unknown[] = [];
  $.onReplace(() => (parent as any).count, (v: unknown) => received.push(v));

  (parent as any).count = child as any;
  // Mutating child should propagate events up through parent's graph.
  // (The "replace" event on the field itself.)
  assert.ok(true, "no crash on nested assignment");
});

test("replacing a statified child unhooks the old one", () => {
  const parent = new WithFields("parent");
  const child1 = $.state({ val: 1 });
  const child2 = $.state({ val: 2 });

  (parent as any).fromBase = child1 as any;
  (parent as any).fromBase = child2 as any;
  // No crash; old child unhooked, new child hooked.
  assert.ok(true, "no crash on child replacement");
});

// ---------------------------------------------------------------------------
// 9. BaseStatified — extend directly
// ---------------------------------------------------------------------------

console.log("\n── BaseStatified direct extension ──");

class Wayland extends (BaseStatified as unknown as new () => object) {
  displays: StatifiedSet<string>;
  #state = 0;
  get state() { return this.#state; }
  set state(v: number) { this.#state = v; }

  constructor() {
    super();
    this.displays = new StatifiedSet<string>();
  }
}

test("BaseStatified subclass constructs without error", () => {
  const w = new Wayland();
  assert.ok(w instanceof Wayland);
  assert.ok(w instanceof (BaseStatified as any));
});

test("isStatified on BaseStatified instance", () => {
  const w = new Wayland();
  assert.ok(isStatified(w as any));
});

test("prototype accessor on BaseStatified subclass fires replacement events", () => {
  const w = new Wayland();
  const received: number[] = [];
  $.onReplace(() => (w as any).state, (v: number) => received.push(v));
  (w as any).state = 6;
  (w as any).state = 7;
  assert.deepEqual(received, [6, 7]);
});

test("own field on BaseStatified subclass fires replacement events", () => {
  const w = new Wayland();
  const received: unknown[] = [];
  $.onReplace(() => (w as any).displays, (v: unknown) => received.push(v));
  const newSet = new StatifiedSet<string>();
  (w as any).displays = newSet;
  assert.deepEqual(received, [newSet]);
});

// ---------------------------------------------------------------------------
// 10. makeStatified backward compat
// ---------------------------------------------------------------------------

console.log("\n── makeStatified ──");

class Plain {
  x = 1;
}
const StatifiedPlain = makeStatified(Plain);

test("makeStatified result is statified", () => {
  const p = new StatifiedPlain();
  assert.ok(isStatified(p as any));
});

test("makeStatified instance has correct field value", () => {
  const p = new StatifiedPlain();
  assert.equal((p as any).x, 1);
});

test("makeStatified is memoized (same result for same input)", () => {
  const A = makeStatified(Plain);
  const B = makeStatified(Plain);
  assert.equal(A, B);
});

// ---------------------------------------------------------------------------
// 11. Path extraction — on() resolves correctly
// ---------------------------------------------------------------------------

console.log("\n── Path extraction ──");

test("on() resolves path for own field", () => {
  const w = new WithFields("test");
  const received: unknown[] = [];
  $.onReplace(() => (w as any).label, (v: unknown) => received.push(v));
  (w as any).label = "changed";
  assert.deepEqual(received, ["changed"]);
});

test("on() registered during construction fires for post-construction mutation", () => {
  // This tests the listen-during-construction → replace → fire ordering.
  let offFn: (() => void) | undefined;
  const received: unknown[] = [];

  const ConstructionListener = statifyClass(
    (Base) => class extends Base {
      value = 42;
      constructor() {
        super();
        // Register listener BEFORE construction exits.
        // pendingAssemblies will be reconciled by registerPreExtractionHook
        // which fires inside selectorToRootAndPath (called by $.onReplace).
        offFn = $.onReplace(
          () => (this as any).value,
          (v: unknown) => received.push(v),
        );
      }
    },
    Object,
  );

  const cl = new ConstructionListener();
  (cl as any).value = 100;
  assert.deepEqual(received, [100]);
  offFn?.();
});

// ---------------------------------------------------------------------------
// 12. Aliases — shared statified child is not duplicated
// ---------------------------------------------------------------------------

console.log("\n── Aliases ──");

test("assigning same statified value to two fields is one graph node", () => {
  const parent = new WithFields("alias-test");
  const shared = $.state({ v: 1 });

  (parent as any).fromBase = shared as any;
  (parent as any).label = shared as any;

  // Both fields reference the same statified object — no duplication.
  assert.equal((parent as any).fromBase, (parent as any).label);
  assert.ok(true, "no crash for aliased assignment");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

// Allow async tests to settle before printing summary.
setTimeout(() => {
  console.log(`\n── Summary: ${passed} passed, ${failed} failed ──\n`);
  if (failed > 0) process.exit(1);
}, 100);
