# informa

Informa is an explicit state management library for JavaScript and TypeScript.

It lets you:

- create statified objects, arrays, sets, maps, and class instances
- subscribe to changes at precise property paths
- observe structural collection events like array insertion and set addition
- keep nested subscriptions working when parents are replaced
- correctly diff collections when a field transitions between collection types

## Philosophy

Informa is path-based.

Instead of subscribing to "everything changed", you subscribe to a selector such as:

- `() => desktop.monitors`
- `() => window.position.x`
- `() => stateful.b?.c?.d`

The selector is used to extract a path from a statified root, and listeners are attached to that path.

## Quick example

```ts
import $ from "informa";

const desktop = $.state({
  monitors: new Set<{ x: number; y: number; w: number; h: number }>(),
  focused: undefined as { x: number } | undefined,
});

$.onAddItem(() => desktop.monitors, (monitor) => {
  console.log("monitor added", monitor);
});

$.onReplace(() => desktop.focused?.x, (x) => {
  console.log("focused x is now", x);
});

desktop.monitors.add($.state({ x: 0, y: 0, w: 1920, h: 1080 }));
desktop.focused = $.state({ x: 100, y: 50, w: 800, h: 600 });
```

## Creating state

### Plain objects, arrays, sets, maps

Use `$.state(...)` to create statified values from plain data:

```ts
const model = $.state({
  count: 0,
  items: [] as string[],
  tags: new Set<string>(),
  meta: new Map<string, number>(),
});
```

Nested objects are statified recursively.

### Classes

Use `$.makeStatified` to define observable class instances:

```ts
interface WaylandState {
  state2: number;
}
class Wayland extends $.makeStatified<WaylandState>(Object) {
  displays = new $.StatifiedSet();

  state = 10;

  get state2() {
    return super.state2;
  }
  set state2(v) {
    super.state2 = v;
  }
}

const w = new Wayland();
$.onSet(() => w.state, (v) => console.log("Changed state", v));

// w.state = 5;
w.state = 6;
w.state = 7;

$.onSet(() => w.state2, (v) => console.log("Changed state2", v));

// w.state2 = 5;
w.state2 = 1234;
w.state2 = 12345;
```

Notice how `WaylandState` is an interface - This is due to TypeScript making a difference between interface and static record types.

`instanceof` works for both the generated class and its base:

```ts
u instanceof User   // true
u instanceof Entity // true
```

## Selectors

Selectors must be simple property-path expressions.

```ts
// good
() => model.count
() => model.user.name
() => model.items
() => model.settings?.theme

// won't work
() => model.items.map(x => x.id)
() => fn(model.user)
() => [model.user, model.id]
```

## Events

Every `on*` function returns an unsubscribe callback. Alternatively, the matching `off*` function can be called with the same arguments.

### Object events

```ts
$.onReplace(() => model.count, (value) => { … });
$.onReplaceProp(() => model, (prop, value) => { … });
$.onAddProp(() => model, (prop, value) => { … });
$.onDeleteProp(() => model, (prop, value) => { … });
```

`onReplace` fires when a path already had a value and is replaced.  
`onSet` fires whenever a path receives any value (initial or replacement). Prefer `onReplace` for class field mutations.

If you subscribe to a deep path and an ancestor is assigned later, Informa replays the descendant path with the current value:

```ts
$.onSet(() => model.user?.profile?.name, (name) => {
  console.log("name =", name);
});

model.user = $.state({ profile: $.state({ name: "Ada" }) });
// -> "name = Ada"
```

### Array events

```ts
const list = $.state({ items: [] as { value: number }[] });

$.onSpliceInElement(() => list.items, (item, index) => {
  console.log("inserted at", index);
  $.onReplace(() => item.value, (v) => console.log("value =", v));
});

list.items.push($.state({ value: 1 }));
list.items[0] = $.state({ value: 2 }); // -> fires onReplaceElement
```

| Subscriber | Fires when |
|---|---|
| `onSpliceInElement` | element inserted (push, unshift, splice, `arr[n] = x` on new index) |
| `onSpliceOutElement` | element removed (pop, shift, splice) |
| `onReplaceElement` | element replaced in-place (splice, fill, `arr[n] = x` on existing index) |
| `onLengthChanged` | length changes |

### Set events

```ts
$.onAddItem(() => model.tags, (tag) => console.log("added", tag));
$.onDeleteItem(() => model.tags, (tag) => console.log("deleted", tag));
$.onCardChanged(() => model.tags, () => console.log("size changed"));
```

### Map events

```ts
$.onAddEntry(() => model.entries, (k, v) => console.log("added", k, v));
$.onReplaceEntry(() => model.entries, (k, v) => console.log("replaced", k, v));
$.onDeleteEntry(() => model.entries, (k, v) => console.log("deleted", k, v));
$.onSizeChanged(() => model.entries, () => console.log("size changed"));
```

## Collection type transitions

When a statified field changes from one collection type to another, Informa emits the correct structural events on both the old and new collections automatically:

| Old -> New | Events fired |
|---|---|
| `Set` -> `Set` | `deleteItem` for removed items, `addItem` for added items, `cardChanged` if anything changed (symmetric diff) |
| `Set` -> other | `deleteItem` for every item in old set, `cardChanged` |
| other -> `Set` | `addItem` for every item in new set, `cardChanged` |
| `Array` -> other | `spliceOutElement` for every element (reverse order), `lengthChanged` |
| other -> `Array` | `spliceInElement` for every element, `lengthChanged` |
| `Map` -> `Map` | `deleteEntry` for removed keys, `replaceEntry`+`setEntry` for changed values, `addEntry`+`setEntry` for new keys, `sizeChanged` |
| `Map` -> other | `deleteEntry` for every entry, `sizeChanged` |
| other -> `Map` | `addEntry`+`setEntry` for every entry, `sizeChanged` |

```ts
const s = $.state({ col: $.state(new Set([1, 2, 3])) });

$.onDeleteItem(() => s.col, (v) => console.log("deleted", v));
$.onAddItem(()  => s.col, (v) => console.log("added",   v));

s.col = $.state(new Set([2, 3, 4]));
// -> deleted 1
// -> added 4
```

## Semantics

- Selectors are path-based - the extracted path drives all subscriptions.
- Assigning an ancestor triggers listeners on subscribed descendants using the current nested value.
- Statified children linked into a parent (via field assignment) propagate events upward through the graph.
- Aliases are supported: assigning the same statified object to multiple fields creates one graph node with multiple parents, not duplicates.
- Collection events (splice, add, delete) are structural; property events are path-based.
- `on*` calls always reconcile any pending class construction before running the selector, so mid-construction subscriptions work correctly.

## Current limitations

- Selectors should stay close to plain property access.
- Array index selection in selectors (`() => arr[2]`) is not yet supported.
- Non-statified foreign objects do not participate in parent-child propagation.
- Array -> Array transitions do not auto-diff (use explicit splice/replace calls instead).

## Breaking changes in v4

- `makeStatified` and `BaseStatified` have been removed. Use `$.statifyClass` instead.
- Class field mutations now correctly call prototype setter bodies in addition to emitting Informa events.
- Direct numeric index assignment on statified arrays now fires `onReplaceElement` / `onSpliceInElement` correctly.

## API summary

```ts
// State creation
$.state(value)
$.statifyClass((Base) => class extends Base { … }, SuperClass)

// General
$.on(selector, listeners)
$.off(selector, listeners)

// Object
$.onSet(selector, listener)         $.offSet(selector, listener)
$.onReplace(selector, listener)     $.offReplace(selector, listener)
$.onSetProp(selector, listener)     $.offSetProp(selector, listener)
$.onAddProp(selector, listener)     $.offAddProp(selector, listener)
$.onReplaceProp(selector, listener) $.offReplaceProp(selector, listener)
$.onDeleteProp(selector, listener)  $.offDeleteProp(selector, listener)

// Array
$.onLengthChanged(selector, listener)    $.offLengthChanged(selector, listener)
$.onSpliceInElement(selector, listener)  $.offSpliceInElement(selector, listener)
$.onSpliceOutElement(selector, listener) $.offSpliceOutElement(selector, listener)
$.onReplaceElement(selector, listener)   $.offReplaceElement(selector, listener)

// Set
$.onAddItem(selector, listener)     $.offAddItem(selector, listener)
$.onDeleteItem(selector, listener)  $.offDeleteItem(selector, listener)
$.onCardChanged(selector, listener) $.offCardChanged(selector, listener)

// Map
$.onAddEntry(selector, listener)     $.offAddEntry(selector, listener)
$.onSetEntry(selector, listener)     $.offSetEntry(selector, listener)
$.onReplaceEntry(selector, listener) $.offReplaceEntry(selector, listener)
$.onDeleteEntry(selector, listener)  $.offDeleteEntry(selector, listener)
$.onSizeChanged(selector, listener)  $.offSizeChanged(selector, listener)

// Exposed classes
$.StatifiedArray
$.StatifiedSet
$.StatifiedMap
```
