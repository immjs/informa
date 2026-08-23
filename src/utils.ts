export function isListInGrid<T>(
  grid: T[][],
  list: T[],
) {
  return grid.some((row) => {
    if (row.length !== list.length) return false;

    return row.every((v, i) => v === list[i]);
  });
}
