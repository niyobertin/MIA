import { useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox, RefreshCw, Search, X, type LucideIcon } from 'lucide-react';
import { getErrorMessage } from '../lib/format';
import { Select } from './Select';
import { surfaceCard } from './tokens';
import { Bone, RefreshBar, TableSkeleton } from './skeleton';
import { sortRows, type SortDirection } from './sorting';

export const cardClass = surfaceCard;

export function Card({ title, subtitle, icon: Icon, action, children, className = '', divided = true }: { title?: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string; divided?: boolean }) {
  return (
    <section className={`${cardClass} min-w-0 ${className}`}>
      {title ? (
        <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-4 ${divided ? 'border-b border-slate-100' : 'pb-1'}`}>
          <div className="min-w-0">
            <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-ink">
              {Icon ? <Icon size={18} className="shrink-0 text-brand" aria-hidden /> : null}
              <span className="truncate">{title}</span>
            </h3>
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, loading = false }: { label: string; value: ReactNode; hint?: ReactNode; loading?: boolean }) {
  return (
    <div className={`${cardClass} p-5 min-w-0`}>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      {loading ? <div className="mt-2.5 space-y-2"><Bone className="h-6 w-28" /><Bone className="h-3 w-20" /></div> : (
        <>
          <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-900 break-words tabular-nums">{value}</div>
          {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
        </>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, icon: Icon, refreshing = false }: { title: string; subtitle?: ReactNode; action?: ReactNode; icon?: LucideIcon; refreshing?: boolean }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon ? <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand sm:flex"><Icon size={22} aria-hidden /></span> : null}
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink">
            <span className="truncate">{title}</span>
            {refreshing ? <RefreshCw aria-label="Refreshing" size={15} className="shrink-0 animate-spin text-muted motion-reduce:animate-none" /> : null}
          </h1>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex w-full flex-wrap items-start gap-2 sm:w-auto">{action}</div> : null}
    </header>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; icon?: LucideIcon }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex flex-wrap ${size === 'sm' ? 'gap-0.5 rounded-lg bg-slate-100 p-0.5' : 'gap-1.5'}`}>
      {options.map((option) => {
        const active = value === option.value;
        const Icon = option.icon;
        return (
          <button key={option.value} role="radio" aria-checked={active} type="button" onClick={() => onChange(option.value)} title={option.label}
            className={size === 'sm'
              ? `inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${active ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`
              : `inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition-colors ${active ? 'bg-brand text-white' : 'bg-slate-100 text-ink/80 hover:bg-slate-200'}`}>
            {Icon ? <Icon size={14} aria-hidden /> : null}
            <span className={Icon && size === 'sm' ? 'sr-only sm:not-sr-only' : ''}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Amount({ value, format, signed = false, strong = false }: { value: number; format: (value: number) => string; signed?: boolean; strong?: boolean }) {
  const tone = !signed || value === 0 ? 'text-slate-700' : value > 0 ? 'text-emerald-700' : 'text-rose-700';
  const text = signed && value > 0 ? `+${format(value)}` : format(value);
  return <span className={`whitespace-nowrap tabular-nums ${strong || (signed && value !== 0) ? 'font-semibold' : ''} ${tone}`}>{text}</span>;
}

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  good: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-rose-100 text-rose-800',
  info: 'bg-sky-100 text-sky-800',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE_TONES[tone]}`}>{children}</span>;
}

const BUTTON_TONES = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800',
  secondary: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
  danger: 'bg-rose-700 text-white hover:bg-rose-800',
};

export function Button({ tone = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BUTTON_TONES }) {
  return <button {...props} className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60 ${BUTTON_TONES[tone]} ${className}`} />;
}

export const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-xl ${className}`} />;
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertCircle size={16} className="shrink-0" />
      <span className="flex-1">{getErrorMessage(error, 'Could not load this data.')}</span>
      {onRetry ? <button onClick={onRetry} className="font-semibold underline underline-offset-2">Try again</button> : null}
    </div>
  );
}

export function EmptyNotice({ children, icon: Icon = Inbox, compact = false }: { children: ReactNode; icon?: LucideIcon; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 px-6 text-center text-sm text-slate-500 ${compact ? 'py-6' : 'py-10'}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-300"><Icon size={20} aria-hidden /></span>
      {children}
    </div>
  );
}

export function QueryBoundary<T>({ query, children, skeleton }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; skeleton?: ReactNode }) {
  if (query.isLoading) return <>{skeleton ?? <Skeleton className="h-64" />}</>;
  if (query.isError) return <ErrorNotice error={query.error} onRetry={() => query.refetch()} />;
  return <>{query.data !== undefined ? children(query.data) : null}</>;
}

export type Column<T> = { header: string; cell: (row: T) => ReactNode; align?: 'right'; sortValue?: (row: T) => unknown };
export type TableSort = { column: string; direction: SortDirection };

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function PageSizePicker({ pageSize, onPageSize }: { pageSize: number; onPageSize: (size: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
      Rows per page
      <Select
        ariaLabel="Rows per page"
        size="sm"
        className="w-24"
        value={String(pageSize)}
        onChange={(next) => onPageSize(Number(next))}
        options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))}
      />
    </label>
  );
}

function pageList(current: number, last: number): (number | 'gap')[] {
  const pages = new Set([0, last, current - 1, current, current + 1].filter((page) => page >= 0 && page <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) out.push('gap');
    out.push(page);
  });
  return out;
}

export function Pager({ page, pageSize, total, onPage, onPageSize, noun = 'rows', busy = false }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize?: (size: number) => void; noun?: string; busy?: boolean }) {
  if (total === 0) return null;
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const current = Math.min(page, lastPage);
  const showPicker = onPageSize && total > PAGE_SIZE_OPTIONS[0];
  const navButton = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label="Pages" aria-busy={busy} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 text-sm text-slate-500">
      <span aria-live="polite">
        Showing <span className="font-semibold text-slate-700">{current * pageSize + 1}–{Math.min((current + 1) * pageSize, total)}</span> of <span className="font-semibold text-slate-700">{total}</span> {noun}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {showPicker ? <PageSizePicker pageSize={pageSize} onPageSize={onPageSize} /> : null}
        {lastPage > 0 ? (
          <div className="flex items-center gap-1">
            <button type="button" aria-label="First page" className={navButton} disabled={current === 0} onClick={() => onPage(0)}><ChevronsLeft size={15} /></button>
            <button type="button" aria-label="Previous page" className={navButton} disabled={current === 0} onClick={() => onPage(current - 1)}><ChevronLeft size={15} /></button>
            {pageList(current, lastPage).map((item, index) => item === 'gap'
              ? <span key={`gap-${index}`} className="px-1 text-xs text-slate-400">…</span>
              : (
                <button
                  key={item}
                  type="button"
                  aria-label={`Page ${item + 1}`}
                  aria-current={item === current ? 'page' : undefined}
                  onClick={() => onPage(item)}
                  className={`${navButton} ${item === current ? '!bg-brand !text-white hover:!bg-brand-dark' : ''}`}
                >{item + 1}</button>
              ))}
            <button type="button" aria-label="Next page" className={navButton} disabled={current >= lastPage} onClick={() => onPage(current + 1)}><ChevronRight size={15} /></button>
            <button type="button" aria-label="Last page" className={navButton} disabled={current >= lastPage} onClick={() => onPage(lastPage)}><ChevronsRight size={15} /></button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function SortHeader({ label, direction, onClick, align }: { label: string; direction: SortDirection | null; onClick: () => void; align?: 'right' }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${align === 'right' ? 'flex-row-reverse' : ''} ${direction ? 'text-ink' : ''}`}>
      {label}
      <Icon size={12} aria-hidden className={direction ? 'text-brand' : 'text-slate-300'} />
    </button>
  );
}

export function DataTable<T>({ columns, rows, rowKey, empty = 'Nothing here yet.', pageSize: initialPageSize = 10, defaultSort, onSortChange }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: string; pageSize?: number; defaultSort?: TableSort; onSortChange?: (sort: TableSort | null) => void }) {
  const [page, setPage] = useState(0);
  const [chosenSize, setChosenSize] = useState<number | null>(null);
  const [sort, setSort] = useState<TableSort | null>(defaultSort ?? null);
  const pageSize = initialPageSize > 0 ? chosenSize ?? initialPageSize : 0;
  const lastPage = pageSize > 0 ? Math.max(0, Math.ceil(rows.length / pageSize) - 1) : 0;
  const current = Math.min(page, lastPage);
  if (rows.length === 0) return <EmptyNotice>{empty}</EmptyNotice>;
  const sortColumn = sort ? columns.find((column) => column.header === sort.column && column.sortValue) : undefined;
  const ordered = sortColumn?.sortValue && sort ? sortRows(rows, sortColumn.sortValue, sort.direction) : rows;
  const visible = pageSize > 0 ? ordered.slice(current * pageSize, (current + 1) * pageSize) : ordered;
  const toggle = (column: Column<T>) => {
    const next: TableSort = sort?.column === column.header ? { column: column.header, direction: sort.direction === 'desc' ? 'asc' : 'desc' } : { column: column.header, direction: column.align === 'right' ? 'desc' : 'asc' };
    setSort(next);
    setPage(0);
    onSortChange?.(next);
  };
  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold text-slate-500">
            {columns.map((column) => {
              const direction = sort?.column === column.header ? sort.direction : null;
              return (
                <th
                  key={column.header}
                  scope="col"
                  aria-sort={column.sortValue ? (direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none') : undefined}
                  className={`whitespace-nowrap px-5 py-3 ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  {column.sortValue ? <SortHeader label={column.header} direction={direction} align={column.align} onClick={() => toggle(column)} /> : column.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={rowKey(row)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
              {columns.map((column) => (
                <td key={column.header} className={`px-5 py-3 align-middle text-slate-700 ${column.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{column.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {pageSize > 0 && rows.length > PAGE_SIZE_OPTIONS[0] ? <Pager page={current} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={(size) => { setChosenSize(size); setPage(0); }} /> : null}
    </div>
  );
}

export function PagedTable<T>({ client, path, queryKey, columns, rowKey, searchPlaceholder, params, empty, rowsFrom, toolbar }: {
  client: AxiosInstance;
  path: string;
  queryKey: string;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  params?: Record<string, string>;
  empty?: string;
  rowsFrom?: (data: { rows: T[]; total?: number }) => T[];
  toolbar?: ReactNode;
}) {
  const paramsKey = JSON.stringify(params ?? {});
  const [paging, setPaging] = useState({ key: paramsKey, page: 0 });
  const page = paging.key === paramsKey ? paging.page : 0;
  const setPage = (next: number) => setPaging({ key: paramsKey, page: next });
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const query = useQuery({
    queryKey: [queryKey, path, page, pageSize, search, params],
    queryFn: async () => (await client.get<{ rows: T[]; total?: number }>(path, {
      params: { limit: pageSize, offset: page * pageSize, ...(search ? { q: search } : {}), ...params },
    })).data,
    placeholderData: keepPreviousData,
  });
  const total = query.data?.total ?? query.data?.rows.length ?? 0;
  return (
    <div className={`${cardClass} min-w-0 overflow-hidden`} aria-busy={query.isFetching || undefined}>
      <RefreshBar active={query.isFetching && !query.isLoading} />
      {searchPlaceholder || toolbar ? (
        <div className="flex flex-col gap-3 p-4 border-b border-slate-100 lg:flex-row lg:items-center lg:justify-between">
          {searchPlaceholder ? (
            <div className="relative w-full lg:max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className={`${inputClass} pl-9`} />
            </div>
          ) : <span className="hidden lg:block" />}
          {toolbar}
        </div>
      ) : null}
      <div className={query.isError ? 'p-4' : ''}>
        <QueryBoundary query={query} skeleton={<TableSkeleton columns={columns} rows={8} />}>
          {(data) => <DataTable columns={columns} rows={rowsFrom ? rowsFrom(data) : data.rows} rowKey={rowKey} empty={empty} pageSize={0} />}
        </QueryBoundary>
      </div>
      <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(0); }} />
    </div>
  );
}

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ReasonAction({ label, title, description, tone = 'secondary', invalidate, run, onDone, needsReason = true }: {
  label: string;
  title: string;
  description?: string;
  tone?: 'secondary' | 'danger' | 'primary';
  invalidate: string[];
  run: (reason: string) => Promise<unknown>;
  onDone?: (result: unknown) => void;
  needsReason?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => run(reason.trim()),
    onSuccess: async (result) => {
      await Promise.all(invalidate.map((key) => client.invalidateQueries({ predicate: (q) => q.queryKey[0] === key })));
      setOpen(false);
      setReason('');
      onDone?.(result);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <>
      <Button tone={tone} className="!px-2.5 !py-1.5 !text-xs" onClick={() => { mutation.reset(); setOpen(true); }}>{label}</Button>
      {open ? (
        <Dialog title={title} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3 text-left">
            {description ? <p className="text-sm text-slate-600 whitespace-normal">{description}</p> : null}
            {needsReason ? (
              <div>
                <label htmlFor="action-reason" className="block text-sm font-medium text-slate-700 mb-1.5">Reason (saved in the audit log)</label>
                <textarea id="action-reason" required minLength={5} maxLength={500} rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
              </div>
            ) : null}
            {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" tone={tone === 'secondary' ? 'primary' : tone} disabled={mutation.isPending}>{mutation.isPending ? 'Working…' : label}</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
