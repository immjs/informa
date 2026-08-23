export function ofWhichIsProto<T extends object, U extends symbol>(target: object, expect: Map<T, U>): U | undefined {
  let current = Reflect.getPrototypeOf(target);

  while (current) {
    const correspondingSymbol = expect.get(current as T);
    if (correspondingSymbol) {
      return correspondingSymbol;
    }

    current = Reflect.getPrototypeOf(current);
  }

  return undefined;
}

export const isSetProto = Symbol();
export const supportedQuirks = new Map([
  [Set.prototype, isSetProto]
] as const);


export function isListInGrid<T>(
  grid: T[][],
  list: T[],
) {
  return grid.some((row) => {
    if (row.length !== list.length) return false;

    return row.every((v, i) => v === list[i]);
  });
}
