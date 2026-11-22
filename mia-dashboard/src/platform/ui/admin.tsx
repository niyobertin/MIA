import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Inbox, Lock, MoreHorizontal, RefreshCw, Search, X, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getErrorMessage, humanize } from '../../lib/format';
import { platformApi } from '../../lib/platformAuth';
import { Pager, Segmented } from '../../ui/kit';

export { Segmented };
import { Select, type SelectOption } from '../../ui/Select';
import { useCan } from '../context';
import { RefreshBar, SkeletonTableRows, type SkeletonColumn } from './skeleton';
import { adminCard, TONES, type Tone } from './tokens';
import { MetricCard, Sparkline, Trend } from '../../ui/metrics';

export { adminCard };

export function initials(name: string | null | undefined) {
  return (name ?? '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Panel({ title, icon: Icon, action, children, className = '', bodyClass = 'p-5 pt-0' }: { title?: ReactNode; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`${adminCard} min-w-0 ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
          <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-ink">
            {Icon ? <Icon size={18} className="shrink-0 text-brand" /> : null}
            <span className="truncate">{title}</span>
          </h3>
          {action}
        </div>
      ) : null}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function useAlertSummary() {
  const canMetrics = useCan('metrics:read');
  return useQuery({
    queryKey: ['platform-alert-summary'],
    queryFn: async () => (await platformApi.get<{ count: number; items: { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; link: string; at: string | null }[] }>('/alerts/summary')).data,
    enabled: canMetrics,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function AdminPageHeader({ icon: Icon, title, subtitle, actions, refreshing = false }: { icon: LucideIcon; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; refreshing?: boolean }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Icon size={26} /></span>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 truncate text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">
            {title}
            {refreshing ? <RefreshCw aria-label="Refreshing" size={15} className="animate-spin text-muted motion-reduce:animate-none" /> : null}
          </h1>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}

export function Chip({ tone = 'green', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ${TONES[tone].icon}`}>{children}</span>;
}

export { Sparkline, Trend };

export function KpiCard(props: Parameters<typeof MetricCard>[0]) {
  return <MetricCard {...props} />;
}

const STATUS_STYLES: Record<string, { tone: string; label?: string }> = {
  active: { tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
  operational: { tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
  trial: { tone: 'text-sky-700 bg-sky-50 ring-sky-200' },
  expiring_soon: { tone: 'text-amber-700 bg-amber-50 ring-amber-200', label: 'Expiring soon' },
  grace: { tone: 'text-orange-700 bg-orange-50 ring-orange-200', label: 'Grace period' },
  pending_payment: { tone: 'text-violet-700 bg-violet-50 ring-violet-200', label: 'Pending payment' },
  past_due: { tone: 'text-violet-700 bg-violet-50 ring-violet-200', label: 'Pending payment' },
  expired: { tone: 'text-rose-700 bg-rose-50 ring-rose-200' },
  suspended: { tone: 'text-rose-700 bg-rose-50 ring-rose-200' },
  cancelled: { tone: 'text-slate-600 bg-slate-100 ring-slate-200' },
  inactive: { tone: 'text-slate-600 bg-slate-100 ring-slate-200' },
  locked: { tone: 'text-amber-700 bg-amber-50 ring-amber-200' },
  degraded: { tone: 'text-amber-700 bg-amber-50 ring-amber-200' },
  not_configured: { tone: 'text-slate-600 bg-slate-100 ring-slate-200', label: 'Not configured' },
  down: { tone: 'text-rose-700 bg-rose-50 ring-rose-200' },
  open: { tone: 'text-amber-700 bg-amber-50 ring-amber-200', label: 'Unpaid' },
  paid: { tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
  void: { tone: 'text-slate-600 bg-slate-100 ring-slate-200' },
  success: { tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
  failed: { tone: 'text-rose-700 bg-rose-50 ring-rose-200' },
  denied: { tone: 'text-amber-700 bg-amber-50 ring-amber-200' },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLES[status] ?? { tone: 'text-slate-600 bg-slate-100 ring-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${style.tone}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? style.label ?? humanize(status)}
    </span>
  );
}

export function PlanBadge({ plan, name }: { plan: string; name?: string | null }) {
  const tone = plan === 'free' ? 'bg-slate-100 text-slate-700' : 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200';
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>{name ?? humanize(plan)}</span>;
}

export type MenuAction = { label: string; icon?: LucideIcon; onSelect: () => void; tone?: 'danger'; hidden?: boolean; href?: string };

export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = actions.filter((action) => !action.hidden);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (visible.length === 0) return null;
  const onKey = (event: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector<HTMLElement>('button')?.focus(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
  };
  return (
    <div ref={ref} className="relative inline-block text-left" onKeyDown={onKey}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink">
        <MoreHorizontal size={18} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-line bg-white p-1.5 shadow-xl">
          {visible.map((action) => {
            const className = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium focus:bg-slate-100 focus:outline-none hover:bg-slate-50 ${action.tone === 'danger' ? 'text-rose-700' : 'text-ink'}`;
            const content = <>{action.icon ? <action.icon size={15} className="shrink-0 opacity-70" /> : null}{action.label}</>;
            return action.href
              ? <Link key={action.label} role="menuitem" to={action.href} className={className} onClick={() => setOpen(false)}>{content}</Link>
              : <button key={action.label} role="menuitem" type="button" className={className} onClick={() => { setOpen(false); action.onSelect(); }}>{content}</button>;
          })}
        </div>
      ) : null}
    </div>
  );
}

export function IconAction({ label, icon: Icon, onClick, href }: { label: string; icon: LucideIcon; onClick?: () => void; href?: string }) {
  const className = 'flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink';
  return href ? <Link to={href} aria-label={label} title={label} className={className}><Icon size={17} /></Link> : <button type="button" aria-label={label} title={label} onClick={onClick} className={className}><Icon size={17} /></button>;
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
}

export function Drawer({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-navy/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div className="min-w-0"><h2 className="truncate text-lg font-bold text-ink">{title}</h2>{subtitle ? <div className="mt-0.5 text-sm text-muted">{subtitle}</div> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-line px-6 py-4">{footer}</div> : null}
      </aside>
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-navy/40" onClick={onClose} />
      <div className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:text-ink"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const fieldClass = 'w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';
export const labelClass = 'mb-1.5 block text-sm font-medium text-ink/80';

export function AdminButton({ tone = 'secondary', className = '', icon: Icon, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'danger'; icon?: LucideIcon }) {
  const tones = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    secondary: 'border border-line bg-white text-ink hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  };
  return (
    <button {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone]} ${className}`}>
      {Icon ? <Icon size={16} /> : null}{children}
    </button>
  );
}

export function ErrorState({ error, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const forbidden = status === 403;
  return (
    <div role="alert" className={`flex ${compact ? 'items-center gap-3 px-4 py-3' : 'flex-col items-center gap-2 px-6 py-10 text-center'} rounded-xl ${forbidden ? 'bg-amber-50 text-amber-900' : 'bg-rose-50 text-rose-800'} text-sm`}>
      {forbidden ? <Lock size={compact ? 16 : 22} className="shrink-0" /> : <AlertCircle size={compact ? 16 : 22} className="shrink-0" />}
      <span className={compact ? 'flex-1' : ''}>{forbidden ? getErrorMessage(error, 'You do not have permission to see this.') : getErrorMessage(error, 'Could not load this data.')}</span>
      {onRetry && !forbidden ? <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">Try again</button> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Icon size={20} /></span>
      <div className="text-sm font-semibold text-ink">{title}</div>
      {children ? <div className="max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Boundary<T>({ query, skeleton, children, compactError = false }: { query: UseQueryResult<T>; skeleton: ReactNode; children: (data: T) => ReactNode; compactError?: boolean }) {
  if (query.isPending) return <>{skeleton}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} compact={compactError} />;
  return <>{children(query.data)}</>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full lg:max-w-xs">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} pl-9`} />
    </div>
  );
}

export function FilterSelect<T extends string>({ label, value, onChange, options, className = 'w-full sm:w-44' }: { label: string; value: T; onChange: (value: T) => void; options: SelectOption<T>[]; className?: string }) {
  return <Select<T> ariaLabel={label} value={value} onChange={onChange} options={options} className={className} searchable={options.length > 8} />;
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type AdminColumn<T> = { key: string; header: string; cell: (row: T) => ReactNode; sortKey?: string; align?: 'right'; className?: string; skeleton?: SkeletonColumn; hideBelow?: 'md' | 'lg' | 'xl' };
export type SortState = { by: string; dir: 'asc' | 'desc' };

const HIDE = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden 2xl:table-cell' };

export function AdminTable<T>({ columns, rows, rowKey, sort, onSort, loading, fetching, empty, error, onRetry, page, pageSize, total, onPage, onPageSize, noun, onRowClick, mobileCard }: {
  columns: AdminColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  sort?: SortState;
  onSort?: (sort: SortState) => void;
  loading: boolean;
  fetching?: boolean;
  empty: ReactNode;
  error?: unknown;
  onRetry?: () => void;
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  noun: string;
  onRowClick?: (row: T) => void;
  mobileCard?: (row: T) => ReactNode;
}) {
  const skeletonColumns = columns.map((column) => column.skeleton ?? { width: 'w-20', align: column.align });
  const busy = Boolean(fetching && !loading);
  return (
    <div aria-busy={loading || busy}>
      <RefreshBar active={busy} />
      {error ? <div className="p-4"><ErrorState error={error} onRetry={onRetry} compact /></div> : null}
      <div className={`${mobileCard ? 'hidden md:block' : ''} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50/60 text-left text-xs font-semibold text-muted">
              {columns.map((column) => {
                const active = sort && column.sortKey && sort.by === column.sortKey;
                const SortIcon = active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={column.key} scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={`whitespace-nowrap px-5 py-3 ${column.align === 'right' ? 'text-right' : ''} ${column.hideBelow ? HIDE[column.hideBelow] : ''}`}>
                    {column.sortKey && onSort ? (
                      <button type="button" className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`} onClick={() => onSort({ by: column.sortKey!, dir: active && sort!.dir === 'desc' ? 'asc' : 'desc' })}>
                        {column.header}<SortIcon size={12} className={active ? '' : 'opacity-40'} />
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {loading ? <SkeletonTableRows columns={skeletonColumns} rows={Math.min(pageSize, 8)} /> : rows && rows.length > 0 ? rows.map((row) => (
              <tr key={rowKey(row)} onClick={onRowClick ? (event) => { if (!(event.target as HTMLElement).closest('button,a,[role="menu"]')) onRowClick(row); } : undefined} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/70 ${onRowClick ? 'cursor-pointer' : ''}`}>
                {columns.map((column) => (
                  <td key={column.key} className={`px-5 py-3 align-middle text-ink/90 ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.hideBelow ? HIDE[column.hideBelow] : ''} ${column.className ?? ''}`}>{column.cell(row)}</td>
                ))}
              </tr>
            )) : !error ? <tr><td colSpan={columns.length}>{empty}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {mobileCard ? (
        <ul className={`divide-y divide-line md:hidden ${busy ? 'opacity-60' : ''}`}>
          {loading ? Array.from({ length: 5 }, (_, i) => <li key={i} className="space-y-2 p-4"><span className="skeleton block h-4 w-2/3 rounded" /><span className="skeleton block h-3 w-1/2 rounded" /></li>)
            : rows && rows.length > 0 ? rows.map((row) => <li key={rowKey(row)} className="p-4">{mobileCard(row)}</li>) : !error ? <li>{empty}</li> : null}
        </ul>
      ) : null}
      <Pager page={page} pageSize={pageSize} total={total} onPage={onPage} onPageSize={onPageSize} noun={noun} busy={busy} />
    </div>
  );
}

export function TableToolbar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function useInvalidate() {
  const client = useQueryClient();
  return (keys: string[]) => Promise.all(keys.map((key) => client.invalidateQueries({ predicate: (q) => q.queryKey[0] === key })));
}

export function ConfirmDialog({ title, description, confirmLabel, tone = 'primary', onClose, run, invalidate, onDone, needsReason = true, children }: {
  title: string; description?: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; onClose: () => void;
  run: (reason: string) => Promise<unknown>; invalidate: string[]; onDone?: (result: unknown) => void; needsReason?: boolean; children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const refresh = useInvalidate();
  const mutation = useMutation({
    mutationFn: () => run(reason.trim()),
    onSuccess: async (result) => {
      await refresh(invalidate);
      onDone?.(result);
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate();
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {description ? <div className="text-sm text-muted">{description}</div> : null}
        {children}
        {needsReason ? (
          <div>
            <label htmlFor="confirm-reason" className={labelClass}>Reason <span className="font-normal text-muted">(saved in the audit log)</span></label>
            <textarea id="confirm-reason" required minLength={5} maxLength={500} rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
          </div>
        ) : null}
        {mutation.isError ? <ErrorState error={mutation.error} compact /> : null}
        <div className="flex justify-end gap-2 pt-1">
          <AdminButton type="button" onClick={onClose}>Cancel</AdminButton>
          <AdminButton type="submit" tone={tone} disabled={mutation.isPending}>{mutation.isPending ? 'Working…' : confirmLabel}</AdminButton>
        </div>
      </form>
    </Modal>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (value: T) => void; tabs: { value: T; label: string; icon?: LucideIcon }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          type="button"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${value === tab.value ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {tab.icon ? <tab.icon size={16} className={value === tab.value ? 'text-brand' : ''} /> : null}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function RangeSelect<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Date range</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="min-h-11 appearance-none rounded-full border border-line bg-white py-2 pl-4 pr-9 text-sm font-semibold text-ink hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand/30">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}

export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-ink">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return 'Never';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const units: [number, string][] = [[31_536_000, 'year'], [2_592_000, 'month'], [604_800, 'week'], [86_400, 'day'], [3_600, 'hour'], [60, 'minute']];
  for (const [size, unit] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
    }
  }
  return 'Just now';
}
