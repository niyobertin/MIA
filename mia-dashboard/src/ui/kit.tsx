import { useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';
import { getErrorMessage } from '../lib/format';

export const cardClass = 'bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardClass} ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{title}</h3>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className={`${cardClass} p-5 min-w-0`}>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-900 break-words">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
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
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
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

export function EmptyNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-slate-500">
      <Inbox size={22} className="text-slate-300" />
      {children}
    </div>
  );
}

export function QueryBoundary<T>({ query, children, skeleton }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; skeleton?: ReactNode }) {
  if (query.isLoading) return <>{skeleton ?? <Skeleton className="h-64" />}</>;
  if (query.isError) return <ErrorNotice error={query.error} onRetry={() => query.refetch()} />;
  return <>{query.data !== undefined ? children(query.data) : null}</>;
}

export type Column<T> = { header: string; cell: (row: T) => ReactNode; align?: 'right' };

export function DataTable<T>({ columns, rows, rowKey, empty = 'Nothing here yet.' }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: string }) {
  if (rows.length === 0) return <EmptyNotice>{empty}</EmptyNotice>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
            {columns.map((column) => (
              <th key={column.header} className={`whitespace-nowrap px-5 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
              {columns.map((column) => (
                <td key={column.header} className={`px-5 py-3 align-middle text-slate-700 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}>{column.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PAGE_SIZE = 25;

export function PagedTable<T>({ client, path, queryKey, columns, rowKey, searchPlaceholder, params, empty, rowsFrom }: {
  client: AxiosInstance;
  path: string;
  queryKey: string;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  params?: Record<string, string>;
  empty?: string;
  rowsFrom?: (data: { rows: T[]; total?: number }) => T[];
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: [queryKey, path, page, search, params],
    queryFn: async () => (await client.get<{ rows: T[]; total?: number }>(path, {
      params: { limit: PAGE_SIZE, offset: page * PAGE_SIZE, ...(search ? { q: search } : {}), ...params },
    })).data,
    placeholderData: keepPreviousData,
  });
  const total = query.data?.total ?? query.data?.rows.length ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  return (
    <div className={cardClass}>
      {searchPlaceholder ? (
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className={`${inputClass} pl-9`} />
          </div>
        </div>
      ) : null}
      <div className={query.isError ? 'p-4' : ''}>
        <QueryBoundary query={query} skeleton={<div className="p-4"><Skeleton className="h-48" /></div>}>
          {(data) => <DataTable columns={columns} rows={rowsFrom ? rowsFrom(data) : data.rows} rowKey={rowKey} empty={empty} />}
        </QueryBoundary>
      </div>
      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 text-sm text-slate-500">
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></Button>
            <Button aria-label="Next page" disabled={page >= lastPage} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
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
