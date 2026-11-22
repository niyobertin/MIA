import type { CSSProperties, ReactNode } from 'react';
import { surfaceCard as adminCard } from './tokens';

export function Bone({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`skeleton block rounded-md ${className}`} style={style} />;
}

export function SkeletonText({ lines = 1, widths = ['w-3/4'], className = '' }: { lines?: number; widths?: string[]; className?: string }) {
  return (
    <span aria-hidden="true" className={`block space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, index) => <Bone key={index} className={`h-3 ${widths[index % widths.length]}`} />)}
    </span>
  );
}

export const SkeletonAvatar = ({ size = 'h-9 w-9', rounded = 'rounded-full' }: { size?: string; rounded?: string }) => <Bone className={`${size} ${rounded} shrink-0`} />;
export const SkeletonButton = ({ className = 'w-28' }: { className?: string }) => <Bone className={`h-10 rounded-xl ${className}`} />;
export const SkeletonInput = ({ className = 'w-full' }: { className?: string }) => <Bone className={`h-10 rounded-xl ${className}`} />;
export const SkeletonBadge = ({ className = 'w-16' }: { className?: string }) => <Bone className={`h-5 rounded-full ${className}`} />;

export function LoadingRegion({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonCard({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={`${adminCard} ${className}`}>{children}</div>;
}

export function MetricCardSkeleton() {
  return (
    <SkeletonCard className="flex items-start gap-3.5 sm:min-h-[116px] p-4 sm:gap-4 sm:p-5">
      <Bone className="h-10 w-10 shrink-0 rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
        <Bone className="h-3 w-24" />
        <Bone className="h-6 w-32 max-w-full" />
        <Bone className="h-3 w-28 max-w-full" />
      </div>
    </SkeletonCard>
  );
}

export const SkeletonKpiCard = MetricCardSkeleton;

export function KpiGridSkeleton({ count = 4, columns = 4 }: { count?: number; columns?: 2 | 3 | 4 }) {
  const cols = columns === 4 ? 'xl:grid-cols-4' : columns === 3 ? 'lg:grid-cols-3' : '';
  return <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols}`}>{Array.from({ length: count }, (_, index) => <MetricCardSkeleton key={index} />)}</div>;
}

export function PageHeaderSkeleton({ actions = 2 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <SkeletonAvatar size="h-12 w-12" rounded="rounded-2xl" />
        <div className="space-y-2">
          <Bone className="h-6 w-56" />
          <Bone className="h-3.5 w-72 max-w-[60vw]" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {Array.from({ length: actions }, (_, index) => <SkeletonButton key={index} className={index === 0 ? 'w-36' : 'w-28'} />)}
        <SkeletonAvatar size="h-10 w-10" />
      </div>
    </div>
  );
}

export type SkeletonColumn = { width: string; kind?: 'text' | 'avatar' | 'badge' | 'actions' | 'stack'; align?: 'right' };

export function SkeletonTableRows({ columns, rows = 8 }: { columns: SkeletonColumn[]; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-slate-50 last:border-0">
          {columns.map((column, index) => (
            <td key={index} className={`px-5 py-3.5 ${column.align === 'right' ? 'text-right' : ''}`}>
              {column.kind === 'avatar' ? (
                <span className="flex items-center gap-3"><SkeletonAvatar size="h-8 w-8" /><span className="flex-1 space-y-1.5"><Bone className="h-3 w-28" /><Bone className="h-2.5 w-20" /></span></span>
              ) : column.kind === 'badge' ? <SkeletonBadge />
                : column.kind === 'actions' ? <span className="inline-flex gap-1.5"><Bone className="h-8 w-8 rounded-lg" /><Bone className="h-8 w-8 rounded-lg" /></span>
                  : column.kind === 'stack' ? <span className="block space-y-1.5"><Bone className={`h-3 ${column.width}`} /><Bone className="h-2.5 w-16" /></span>
                    : <Bone className={`h-3 ${column.width} ${column.align === 'right' ? 'ml-auto' : ''}`} />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonTable({ columns, rows = 8, headers }: { columns: SkeletonColumn[]; rows?: number; headers?: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            {columns.map((_column, index) => (
              <th key={index} className="px-5 py-3 text-left">
                {headers?.[index] ? <span className="text-xs font-semibold text-slate-400">{headers[index]}</span> : <Bone className="h-2.5 w-14" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody><SkeletonTableRows columns={columns} rows={rows} /></tbody>
      </table>
    </div>
  );
}

export function ToolbarSkeleton({ filters = 2, action = true }: { filters?: number; action?: boolean }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap gap-2">
        <SkeletonInput className="w-full lg:w-80" />
        {Array.from({ length: filters }, (_, index) => <SkeletonInput key={index} className="w-36" />)}
      </div>
      {action ? <SkeletonButton className="w-24" /> : null}
    </div>
  );
}

export function PaginationSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
      <Bone className="h-3 w-40" />
      <div className="flex gap-1">{Array.from({ length: 5 }, (_, index) => <Bone key={index} className="h-8 w-8 rounded-lg" />)}</div>
    </div>
  );
}

export function TableCardSkeleton({ columns, headers, filters = 2, rows = 8 }: { columns: SkeletonColumn[]; headers?: string[]; filters?: number; rows?: number }) {
  return (
    <SkeletonCard>
      <ToolbarSkeleton filters={filters} />
      <SkeletonTable columns={columns} headers={headers} rows={rows} />
      <PaginationSkeleton />
    </SkeletonCard>
  );
}

export function SkeletonChart({ height = 240, title = true }: { height?: number; title?: boolean }) {
  return (
    <div aria-hidden="true">
      {title ? <div className="mb-4 flex items-center justify-between"><Bone className="h-4 w-48" /><span className="flex gap-1.5">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-8 w-11 rounded-full" />)}</span></div> : null}
      <div className="relative" style={{ height }}>
        <div className="absolute inset-y-0 left-0 flex w-8 flex-col justify-between py-1">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} className="h-2.5 w-6" />)}</div>
        <div className="absolute inset-y-0 left-10 right-0 flex flex-col justify-between py-2">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="block h-px bg-slate-100" />)}</div>
        <svg className="absolute inset-y-0 left-10 right-0 h-full w-[calc(100%-2.5rem)]" viewBox="0 0 400 100" preserveAspectRatio="none">
          <path d="M0,80 C40,70 60,55 100,60 C140,65 160,35 200,40 C240,45 260,20 300,30 C340,40 360,25 400,15 L400,100 L0,100 Z" className="skeleton-fill" />
          <path d="M0,80 C40,70 60,55 100,60 C140,65 160,35 200,40 C240,45 260,20 300,30 C340,40 360,25 400,15" fill="none" stroke="#e2e8f0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="ml-10 mt-2 flex justify-between">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} className="h-2.5 w-10" />)}</div>
    </div>
  );
}

export function SkeletonDonut() {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center justify-center gap-6">
      <span className="skeleton block h-[150px] w-[150px] rounded-full [mask:radial-gradient(circle,transparent_52px,#000_53px)]" />
      <div className="min-w-[10rem] flex-1 space-y-3">{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-2"><Bone className="h-2.5 w-2.5 rounded-full" /><Bone className="h-3 flex-1" /><Bone className="h-3 w-8" /></span>)}</div>
    </div>
  );
}

export function SkeletonBars({ rows = 3 }: { rows?: number }) {
  return <div aria-hidden="true" className="space-y-4">{Array.from({ length: rows }, (_, i) => <span key={i} className="flex items-center gap-3"><Bone className="h-3 w-16" /><Bone className="h-2.5 flex-1 rounded-full" /><Bone className="h-3 w-6" /></span>)}</div>;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 py-3">
          <SkeletonAvatar size="h-9 w-9" rounded="rounded-xl" />
          <div className="flex-1 space-y-1.5"><Bone className="h-3 w-2/3" /><Bone className="h-2.5 w-1/2" /></div>
          <Bone className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <SkeletonCard className={`p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2"><Bone className="h-5 w-5 rounded-md" /><Bone className="h-4 w-36" /></div>
      {children}
    </SkeletonCard>
  );
}

export function DrawerSkeleton() {
  return (
    <LoadingRegion label="Loading details" className="space-y-6">
      <div className="flex items-center gap-4"><SkeletonAvatar size="h-14 w-14" /><div className="flex-1 space-y-2"><Bone className="h-5 w-40" /><Bone className="h-3 w-56" /><SkeletonBadge /></div></div>
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-3">
          <Bone className="h-3 w-24" />
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-1.5"><Bone className="h-2.5 w-16" /><Bone className="h-3.5 w-28" /></div>)}</div>
        </div>
      ))}
      <SkeletonList rows={3} />
    </LoadingRegion>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <LoadingRegion label="Loading form" className="space-y-4">
      <Bone className="h-3 w-32" />
      {Array.from({ length: fields }, (_, i) => <div key={i} className="space-y-1.5"><Bone className="h-3 w-24" /><SkeletonInput /></div>)}
      <div className="flex justify-end gap-2 pt-2"><SkeletonButton className="w-24" /><SkeletonButton className="w-32" /></div>
    </LoadingRegion>
  );
}

export function RefreshBar({ active }: { active: boolean }) {
  return <div aria-hidden="true" className={`h-0.5 w-full ${active ? 'refresh-bar' : ''}`} />;
}

const BAR_HEIGHTS = [42, 64, 38, 72, 55, 86, 48, 66, 92, 58, 74, 44];

export function SkeletonBarChart({ height = 240, bars = 12 }: { height?: number; bars?: number }) {
  return (
    <div aria-hidden="true">
      <div className="relative" style={{ height }}>
        <div className="absolute inset-y-0 left-0 flex w-8 flex-col justify-between py-1">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} className="h-2.5 w-6" />)}</div>
        <div className="absolute inset-y-0 left-10 right-0 flex flex-col justify-between py-2">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="block h-px bg-slate-100" />)}</div>
        <div className="absolute bottom-2 left-12 right-2 top-2 flex items-end justify-between gap-2">
          {Array.from({ length: bars }, (_, i) => <Bone key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${BAR_HEIGHTS[i % BAR_HEIGHTS.length]}%` }} />)}
        </div>
      </div>
      <div className="ml-10 mt-2 flex justify-between">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} className="h-2.5 w-10" />)}</div>
    </div>
  );
}

export function SectionHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
      <span className="flex items-center gap-2"><Bone className="h-5 w-5 rounded-md" /><Bone className="h-4 w-36" /></span>
      {action ? <Bone className="h-8 w-28 rounded-lg" /> : null}
    </div>
  );
}

export function ChartCardSkeleton({ variant = 'line', height = 240, className = '', label = 'Loading chart' }: { variant?: 'line' | 'bars' | 'donut' | 'list'; height?: number; className?: string; label?: string }) {
  return (
    <LoadingRegion label={label} className={`${adminCard} min-w-0 ${className}`}>
      <SectionHeaderSkeleton action={variant === 'line' || variant === 'bars'} />
      <div className="px-5 pb-5">
        {variant === 'line' ? <SkeletonChart height={height} title={false} />
          : variant === 'bars' ? <SkeletonBarChart height={height} />
            : variant === 'donut' ? <div className="flex items-center" style={{ minHeight: height }}><div className="w-full"><SkeletonDonut /></div></div>
              : <div style={{ minHeight: height }}><SkeletonBars rows={5} /></div>}
      </div>
    </LoadingRegion>
  );
}

export function skeletonColumns(columns: { header: string; align?: 'right' }[]): { headers: string[]; columns: SkeletonColumn[] } {
  const widths = ['w-32', 'w-24', 'w-20', 'w-28'];
  return {
    headers: columns.map((column) => column.header),
    columns: columns.map((column, index) => ({ width: column.align === 'right' ? 'w-16' : widths[index % widths.length], align: column.align, kind: index === 0 ? 'stack' : 'text' })),
  };
}

export function TableSkeleton({ columns, rows = 5 }: { columns: { header: string; align?: 'right' }[]; rows?: number }) {
  const shape = skeletonColumns(columns);
  return (
    <LoadingRegion label="Loading table">
      <SkeletonTable columns={shape.columns} headers={shape.headers} rows={rows} />
    </LoadingRegion>
  );
}

export function TableSectionSkeleton({ columns, rows = 5, className = '' }: { columns: { header: string; align?: 'right' }[]; rows?: number; className?: string }) {
  return (
    <div className={`${adminCard} min-w-0 ${className}`}>
      <SectionHeaderSkeleton />
      <TableSkeleton columns={columns} rows={rows} />
    </div>
  );
}

export function SummaryPanelSkeleton({ rows = 4, columns = 2 }: { rows?: number; columns?: 1 | 2 }) {
  return (
    <div aria-hidden="true" className={`grid gap-6 ${columns === 2 ? 'md:grid-cols-2' : ''}`}>
      {Array.from({ length: columns }, (_, col) => (
        <div key={col} className="space-y-3">
          <Bone className="h-3 w-24" />
          {Array.from({ length: rows }, (_, i) => <span key={i} className="flex items-center justify-between gap-4"><Bone className="h-3 w-36" /><Bone className="h-3 w-20" /></span>)}
          <span className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3"><Bone className="h-3.5 w-24" /><Bone className="h-3.5 w-24" /></span>
        </div>
      ))}
    </div>
  );
}

export function TileGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <LoadingRegion label="Loading" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/70 bg-white p-3">
          <Bone className="aspect-[4/3] w-full rounded-xl" />
          <Bone className="mt-3 h-3.5 w-3/4" />
          <Bone className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function AppShellSkeleton() {
  return (
    <LoadingRegion label="Loading your dashboard" className="min-h-screen bg-[#f8fafb]">
      <aside className="fixed inset-y-0 left-0 hidden w-[260px] flex-col gap-6 bg-[#0e3b36] px-5 py-7 lg:flex">
        <span className="block h-5 w-36 rounded-md bg-white/10" />
        {[5, 6, 4].map((count, group) => (
          <div key={group} className="space-y-3">
            <span className="block h-2.5 w-16 rounded bg-white/10" />
            {Array.from({ length: count }, (_, i) => <span key={i} className="block h-4 w-40 rounded bg-white/[0.07]" />)}
          </div>
        ))}
      </aside>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8 lg:ml-[260px]">
        <PageHeaderSkeleton actions={2} />
        <KpiGridSkeleton count={4} />
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCardSkeleton className="lg:col-span-2" />
          <ChartCardSkeleton variant="list" />
        </div>
      </div>
    </LoadingRegion>
  );
}
