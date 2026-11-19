import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, ScrollText, ShieldCheck, ShieldX } from 'lucide-react';
import { formatDateTime, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { AdminButton, AdminPageHeader, AdminTable, EmptyState, ErrorState, FilterSelect, Panel, SearchInput, StatusBadge, TableToolbar, type AdminColumn } from './ui/admin';
import { useServerList } from './ui/useServerList';

type AuditRow = {
  id: string; admin_email: string | null; action: string; target_type: string | null; target_id: string | null; business_id: string | null; business_name: string | null;
  reason: string | null; metadata: { before?: Record<string, unknown>; after?: Record<string, unknown>; [key: string]: unknown } | null; ip: string | null; result: string; sealed: boolean; created_at: string;
};

function Changes({ metadata }: { metadata: AuditRow['metadata'] }) {
  if (!metadata) return <span className="text-muted">No extra details.</span>;
  const { before, after, ...rest } = metadata;
  return (
    <div className="space-y-2 text-xs">
      {before || after ? (
        <table className="w-full max-w-xl text-left">
          <thead><tr className="text-muted"><th className="py-1 pr-3 font-medium">Field</th><th className="py-1 pr-3 font-medium">Previous</th><th className="py-1 font-medium">Updated</th></tr></thead>
          <tbody>
            {[...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].map((key) => (
              <tr key={key} className="border-t border-line"><td className="py-1 pr-3 font-medium text-ink">{humanize(key)}</td><td className="py-1 pr-3 text-muted">{JSON.stringify(before?.[key] ?? null)}</td><td className="py-1 text-ink">{JSON.stringify(after?.[key] ?? null)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {Object.keys(rest).length ? <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[11px] text-ink/80">{JSON.stringify(rest, null, 2)}</pre> : null}
    </div>
  );
}

export function AuditLogTable({ businessId }: { businessId?: string }) {
  const [result, setResult] = useState('all');
  const [period, setPeriod] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const list = useServerList<AuditRow>({ key: 'platform-audit', path: '/audit', filters: { business_id: businessId, result, period }, defaultSort: { by: 'date', dir: 'desc' } });
  const columns: AdminColumn<AuditRow>[] = [
    { key: 'expand', header: '', cell: (row) => <button type="button" aria-label={open === row.id ? 'Hide details' : 'Show details'} aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)} className="rounded p-1 text-muted hover:bg-slate-100">{open === row.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> },
    { key: 'date', header: 'Timestamp', sortKey: 'date', cell: (row) => <span className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</span> },
    { key: 'admin', header: 'Administrator', sortKey: 'admin', cell: (row) => <span className="text-ink/90">{row.admin_email ?? 'System'}</span> },
    { key: 'action', header: 'Action', sortKey: 'action', cell: (row) => <span><span className="block font-semibold text-ink">{humanize(row.action)}</span>{row.reason ? <span className="block max-w-xs truncate text-xs text-muted" title={row.reason}>{row.reason}</span> : null}</span> },
    ...(businessId ? [] : [{ key: 'org', header: 'Organization', sortKey: 'business', hideBelow: 'md' as const, cell: (row: AuditRow) => row.business_id ? <Link to={`/platform/businesses/${row.business_id}/audit`} className="hover:underline">{row.business_name}</Link> : <span className="text-muted">—</span> }]),
    { key: 'resource', header: 'Resource', hideBelow: 'lg', cell: (row) => row.target_type ? <span className="text-xs text-ink/80">{humanize(row.target_type)} <span className="font-mono text-muted">{row.target_id?.slice(0, 8)}</span></span> : '—' },
    { key: 'ip', header: 'IP address', hideBelow: 'lg', cell: (row) => <span className="font-mono text-xs text-muted">{row.ip ?? '—'}</span> },
    { key: 'result', header: 'Result', sortKey: 'result', cell: (row) => <span className="inline-flex items-center gap-1.5"><StatusBadge status={row.result} />{row.sealed ? <ShieldCheck size={13} className="text-emerald-600" aria-label="Sealed in the tamper-evident chain" /> : null}</span> },
  ];
  return (
    <Panel bodyClass="">
      <TableToolbar>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search action, admin or organization…" />
        <FilterSelect label="Result" value={result} onChange={setResult} options={[{ value: 'all', label: 'All results' }, { value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' }, { value: 'denied', label: 'Denied' }]} />
        <FilterSelect label="Date" value={period} onChange={setPeriod} options={[{ value: 'all', label: 'Any time' }, { value: 'today', label: 'Today' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }]} />
      </TableToolbar>
      <AdminTable<AuditRow> {...list.tableProps} columns={columns} rowKey={(row) => row.id} noun="entries" empty={<EmptyState icon={ScrollText} title="No audit entries match" />} />
      {open && list.query.data?.rows.find((row) => row.id === open) ? (
        <div className="border-t border-line bg-slate-50/60 px-5 py-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Details</div>
          <Changes metadata={list.query.data.rows.find((row) => row.id === open)!.metadata} />
        </div>
      ) : null}
    </Panel>
  );
}

export function AuditLogPage() {
  const verify = useMutation({ mutationFn: async () => (await platformApi.get<{ ok: boolean; checked: number; broken_at?: string; reason?: string; unhashed?: number }>('/audit/verify')).data });
  return (
    <>
      <AdminPageHeader icon={ScrollText} title="Audit logs" subtitle="Every privileged action. Entries cannot be edited or deleted, and each one is sealed to the one before it."
        actions={<AdminButton icon={ShieldCheck} onClick={() => verify.mutate()} disabled={verify.isPending}>{verify.isPending ? 'Checking…' : 'Verify integrity'}</AdminButton>} />
      {verify.isError ? <div className="mb-4"><ErrorState error={verify.error} compact /></div> : null}
      {verify.data ? (
        <div role="status" className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${verify.data.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {verify.data.ok ? <ShieldCheck size={16} /> : <ShieldX size={16} />}
          {verify.data.ok ? `Chain intact: ${verify.data.checked} sealed entries checked${verify.data.unhashed ? `, ${verify.data.unhashed} older entries predate sealing` : ''}.` : `Integrity problem at entry ${verify.data.broken_at}: ${verify.data.reason}.`}
        </div>
      ) : null}
      <AuditLogTable />
    </>
  );
}
