import $ from "./high.js";

const stateful = $.state<{ a: ({ d: number })[] }>({ a: [] });

$.onPush(() => stateful.a, (v) => {
  $.onChange(() => v.d, (newValue) => {
    console.log("New value is", newValue);
  });
});
