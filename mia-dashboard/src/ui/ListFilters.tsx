import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import { PeriodFilter, type PeriodValue } from './PeriodFilter';
import { Select } from './Select';

export type SortKind = 'date' | 'text' | 'number';
export type SortOption = { value: string; label: string; kind?: SortKind };
export type SortDirection = 'asc' | 'desc';

const DAY = 86_400_000;

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Inclusive local-day bounds for a period, or null for all time. */
export function periodDays(period: PeriodValue, now = new Date()): { from: string; to: string } | null {
  const today = isoDay(now);
  switch (period.period) {
    case 'all':
      return null;
    case 'custom':
      return { from: period.from, to: period.to };
    case 'yesterday': {
      const y = isoDay(new Date(now.getTime() - DAY));
      return { from: y, to: y };
    }
    case 'today':
      return { from: today, to: today };
    default: {
      const days = period.period === '7d' ? 7 : period.period === '30d' ? 30 : 90;
      return { from: isoDay(new Date(now.getTime() - (days - 1) * DAY)), to: today };
    }
  }
}

export function directionLabel(kind: SortKind | undefined, direction: SortDirection) {
  if (kind === 'date') return direction === 'desc' ? 'Newest first' : 'Oldest first';
  if (kind === 'text') return direction === 'asc' ? 'A to Z' : 'Z to A';
  return direction === 'desc' ? 'Highest first' : 'Lowest first';
}

function compare(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

const empty = (value: unknown) => value === null || value === undefined || value === '';

/** Sorts a copy; empty values always go last; ties keep their original order. */
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

export function useListFilters({
  sortOptions,
  defaultSort,
  defaultDirection = 'desc',
  defaultPeriod = { period: 'all' },
  withPeriod = true,
}: {
  sortOptions: SortOption[];
  defaultSort?: string;
  defaultDirection?: SortDirection;
  defaultPeriod?: PeriodValue;
  withPeriod?: boolean;
}) {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);
  const [sortBy, setSortBy] = useState(defaultSort ?? sortOptions[0]?.value ?? 'date');
  const [direction, setDirection] = useState<SortDirection>(defaultDirection);
  const active = sortOptions.find((option) => option.value === sortBy) ?? sortOptions[0];

  const params = useMemo(() => {
    const base: Record<string, string> = { sort_by: sortBy, sort: direction, period: period.period };
    if (period.period === 'custom') {
      base.from = period.from;
      base.to = period.to;
    }
    return base;
  }, [period, sortBy, direction]);

  /** Filters by the chosen period and sorts in the browser, for lists that load all rows at once. */
  const apply = <T,>(rows: readonly T[], getDate: (row: T) => string | null | undefined, getters: Record<string, (row: T) => unknown>): T[] => {
    const bounds = periodDays(period);
    const filtered = bounds
      ? rows.filter((row) => {
          const value = getDate(row);
          if (!value) return false;
          const day = isoDay(new Date(value));
          return day >= bounds.from && day <= bounds.to;
        })
      : [...rows];
    const getter = getters[sortBy] ?? getters[Object.keys(getters)[0]];
    return getter ? sortRows(filtered, getter, direction) : filtered;
  };

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {withPeriod ? <PeriodFilter value={period} onChange={setPeriod} includeAll className="w-44" /> : null}
      {sortOptions.length > 1 ? (
        <Select
          ariaLabel="Sort by"
          className="w-40"
          searchable={false}
          value={sortBy}
          onChange={(next) => {
            setSortBy(next);
            const kind = sortOptions.find((option) => option.value === next)?.kind;
            setDirection(kind === 'text' ? 'asc' : 'desc');
          }}
          options={sortOptions.map((option) => ({ value: option.value, label: `Sort: ${option.label}` }))}
        />
      ) : null}
      <button
        type="button"
        onClick={() => setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
        aria-label={`Sort order: ${directionLabel(active?.kind, direction)}. Click to reverse.`}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        {direction === 'asc' ? <ArrowUpNarrowWide size={16} aria-hidden /> : <ArrowDownWideNarrow size={16} aria-hidden />}
        {directionLabel(active?.kind, direction)}
      </button>
    </div>
  );

  return { period, setPeriod, sortBy, direction, setDirection, params, apply, controls };
}

/** A lone ascending/descending toggle for small tables that already follow a page-level period. */
export function SortToggle({ kind = 'date', direction, onChange }: { kind?: SortKind; direction: SortDirection; onChange: (direction: SortDirection) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(direction === 'asc' ? 'desc' : 'asc')}
      aria-label={`Sort order: ${directionLabel(kind, direction)}. Click to reverse.`}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {direction === 'asc' ? <ArrowUpNarrowWide size={14} aria-hidden /> : <ArrowDownWideNarrow size={14} aria-hidden />}
      {directionLabel(kind, direction)}
    </button>
  );
}
