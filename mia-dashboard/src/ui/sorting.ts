export type SortDirection = 'asc' | 'desc';

function compare(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

const empty = (value: unknown) => value === null || value === undefined || value === '';

export function sortRows<T>(rows: readonly T[], getValue: (row: T) => unknown, direction: SortDirection): T[] {
  const factor = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((x, y) => {
      if (empty(x.value) !== empty(y.value)) return empty(x.value) ? 1 : -1;
      const diff = empty(x.value) ? 0 : compare(x.value, y.value) * factor;
      return diff !== 0 ? diff : x.index - y.index;
    })
    .map((entry) => entry.row);
}

