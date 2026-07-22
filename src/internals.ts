export const ExitProxySymbol = Symbol();

// The mode is used by the functions exposed by informa,
// no concurrency issues arise because of the call stack.
export let globalMode: "normal" | "extract-proxy-path" = "normal";
