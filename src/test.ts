import $ from "./high.js";

const stateful = $.state<{ a: ({ d: number })[], b?: { c?: { d?: Set<number> } } }>({ a: [] });

$.onSpliceInElement(() => stateful.a, (v) => {
  console.log("pushed", v);

  $.onSet(() => v.d, (newValue) => {
    console.log("New value is", newValue);
  });
});

$.onSet(() => stateful.b?.c?.d, (newValue) => {
  console.log("New value of .b.c.d is", newValue);
});

const b = $.state({ d: 3 });
stateful.a.push(b);

b.d = 10;

const asdf = $.state({ d: new Set<number>() });
const asdf2 = $.state({ c: asdf });

// const aassddff = $.state(new Set());
stateful.b = asdf2;

interface WaylandState {
  state2: number;
}
class Wayland extends $.makeBaseStatified<WaylandState>() {
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
$.onSet(() => w.state, (v) => console.log("asdf awawa!!", v));

// w.state = 5;
w.state = 6;
w.state = 7;

$.onSet(() => w.state2, (v) => console.log("asdf awawa!!", v));

// w.state2 = 5;
w.state2 = 1234;
w.state2 = 12345;

const map = $.state<Map<number, string>>(new Map());
$.onSetEntry(() => map, (k, v) => console.log("set", k, v));
$.onReplaceEntry(() => map, (k, v) => console.log("replace", k, v));

map.set(1, "");
map.set(1, "asdf");
map.set(1, "asdf");
