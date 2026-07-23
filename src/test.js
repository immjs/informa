const state = $.state({ a: { b: 20 } });

$.on(() => state.a.b, () => {
  console.log("state.a.b changed!");
});

state.a.b = $.state({ c: 20 }); // state.a.b changed!

state.a.b.c = 30; // state.a.b changed!
