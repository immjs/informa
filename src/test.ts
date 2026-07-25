import { on, state } from "./high.js";

const stateful = state<{ a: { b: number | { c: number } } }>({ a: { b: 20 } });

on(() => stateful.a.b, () => {
  console.log("state.a.b changed!");
});

stateful.a.b = state({ c: 20 }); // state.a.b changed!

stateful.a.b.c = 30; // state.a.b changed!


