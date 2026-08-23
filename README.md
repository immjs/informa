# informa

Informa is an explicit state management library for JavaScript and TypeScript.

It lets you:

- create statified objects, arrays, sets, and class instances
- subscribe to changes at precise property paths
- observe structural collection events like array insertion and set addition
- keep nested subscriptions working when parents are replaced

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

interface Rectangle {
  x: number;
  y: number;
  w: number;
  h: number;
}

const desktop = $.state({
  monitors: new Set<Rectangle>(),
  focused: undefined as Rectangle | undefined,
});

$.onAddItem(() => desktop.monitors, (monitor) => {
  console.log("monitor added", monitor);
});

$.onSet(() => desktop.focused?.x, (x) => {
  console.log("focused x is now", x);
});

desktop.monitors.add($.state({ x: 0, y: 0, w: 1920, h: 1080 }));
desktop.focused = $.state({ x: 100, y: 50, w: 800, h: 600 });
```

## Creating state

Use `$.state(...)` to create statified values.

Supported shapes include:

- plain objects
- arrays
- sets
- class instances that extend a statified base

```ts
const model = $.state({
  count: 0,
  items: [],
  tags: new Set<string>(),
});
```

Nested objects are statified recursively.

## Selectors

Selectors should be simple property-path selectors.

Good selectors:

```ts
() => model.count
() => model.user.name
() => model.items
() => model.settings?.theme
```

Selectors describe a path. These will not work:

```ts
() => model.items.map(x => x.id)
() => fn(model.user)
() => [model.user, model.id]
```

## Events

### `onSet`

Called when a path receives a value.

```ts
$.onSet(() => model.count, (value) => {
  console.log("count =", value);
});

model.count = 1;
```

If you subscribe to a deep path and later assign an ancestor, Informa replays the descendant path with the current value.

```ts
$.onSet(() => model.user?.profile?.name, (value) => {
  console.log("name =", value);
});

model.user = $.state({
  profile: $.state({ name: "Ada" }),
});
```

The listener above should receive `"Ada"` when `user` is assigned.

### `onReplace`

Called when a path already existed and is replaced.

### `onSetProp`, `onReplaceProp`, `onDeleteProp`

Property-level listeners for objects.

### Array events

Use array-specific listeners for structural changes.

```ts
const stateful = $.state({
  items: [] as { value: number }[],
});

$.onSpliceInElement(() => stateful.items, (item, index) => {
  console.log("inserted", index, item);

  $.onSet(() => item.value, (value) => {
    console.log("item value =", value);
  });
});
```

Available array events include:

- `onSpliceInElement`
- `onSpliceOutElement`
- `onReplaceElement`
- `onLengthChanged`

### Set events

```ts
$.onAddItem(() => model.tags, (tag) => {
  console.log("added", tag);
});

$.onDeleteItem(() => model.tags, (tag) => {
  console.log("deleted", tag);
});
```

Available set events include:

- `onAddItem`
- `onDeleteItem`
- `onCardChanged` (for cardinality, so as to avoid conflict with Map.size)

### Map events

```ts
$.onSetEntry(() => model.tags, (key, value) => {
  console.log("set", tag);
});

$.onDeleteEntry(() => model.tags, (key, value) => {
  console.log("deleted", tag);
});
```

Available map events include:

- `onSetEntry`
- `onReplaceEntry`
- `onDeleteEntry`
- `onSizeChanged`

## Classes

Class instances can participate in the same selector model.

### Note before use

Informa uses a prototype blanket layer so selectors like `() => w.state` can still be extracted even when the property lives on a class prototype.

However, the blanket does not intercept any property setters (since it's very possible that the setter does not end up changing the state)

It is up to the superclass to confirm changes using `super.{your property here} = {your value here}`.

### Example

```ts
class Wayland extends $.BaseStatified {
  #state = 0;

  get state() { return this.#state; }
  set state(v: number) {
    this.#state = v;
    super.state = v;
  }
}

const w = new Wayland();
$.onSet(() => w.state, (value) => console.log(value));
```

In case you already wanted to extend antother class, we provide a class factory `$.makeStatified` that allows you to wrap an existing class.

## Semantics

A few important rules:

- selectors are path-based
- nested listeners continue to work when statified children are linked into parents
- assigning an ancestor may trigger listeners on deeper subscribed descendants using the current nested value
- collection events are structural; property events are path-based

## Current limitations

- selectors should stay close to plain property access
- arbitrary computed selectors are not guaranteed to work
- method-call selectors are not part of the core model
- non-statified foreign objects may not participate in parent-child propagation
- array elements cannot be selected (yet)

## API summary

```ts
$.state(...)
$.on(...)
$.onSet(...)
$.onReplace(...)
$.onReplaceProp(...)
$.onDeleteProp(...)
$.onSetProp(...)
$.onLengthChanged(...)
$.onSpliceInElement(...)
$.onSpliceOutElement(...)
$.onReplaceElement(...)
$.onCardChanged(...)
$.onAddItem(...)
$.onDeleteItem(...)
$.onSetEntry(...)
$.onReplaceEntry(...)
$.onDeleteEntry(...)
$.onSizeChanged(...)

$.BaseStatified
$.StatifiedArray
$.StatifiedSet
$.StatifiedMap
```

## Goals

Informa is built for cases where you want:

- explicit subscriptions
- precise change notifications
- propagation through nested state graphs
- support for objects, arrays, sets, and class instances
