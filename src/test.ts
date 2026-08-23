import $ from "./high.js";
import { BaseStatified } from "./quirks/basestatified.js";
import { StatifiedSet } from "./quirks/set.js";

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

class Wayland extends BaseStatified {
  displays = new StatifiedSet();

  #state = 0;
  get state() { return this.#state; }
  set state(v: number) {
    console.log("set", v)
    this.#state = v;
    super.state = v;
  }

  constructor() {
    super();
  }
}

const w = new Wayland();
$.onSet(() => w.state, (v) => console.log("asdf awawa!!", v));

w.state = 5;
