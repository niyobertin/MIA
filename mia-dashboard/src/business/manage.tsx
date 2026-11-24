import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatDateTime, humanize } from '../lib/format';
import { Badge, Card, DataTable, ErrorNotice, PagedTable, PageHeader, QueryBoundary } from '../ui/kit';
import { MetricCard } from '../ui/metrics';
import { Ban, History, RotateCcw, ShieldCheck, Undo2, UserCheck, UserRound, Users } from 'lucide-react';
import { ActionMenu } from '../ui/ActionMenu';
import { ExportMenu } from '../ui/ExportMenu';
import { rowsToTable } from '../lib/exportData';
import type { Column } from '../ui/kit';
import { StatRow } from './tables';
import { TableSkeleton } from '../ui/skeleton';
import { useDashboard } from './BusinessApp';
import { useListFilters } from '../ui/ListFilters';

export { Reports } from './reports';

type Row = Record<string, any>;
const rowId = (row: Row) => String(row.id);

const ROLE_CHOICES = [
  { value: 'MANAGER', label: 'Manager', icon: ShieldCheck },
  { value: 'CASHIER', label: 'Cashier', icon: UserRound },
  { value: 'STAFF', label: 'Staff', icon: Users },
];

function StaffControls({ row }: { row: Row }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (change: { role?: string; active?: boolean }) => api.patch(`/dashboard/staff/${row.id}`, change),
    onSuccess: () => client.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'staff' }),
  });
  return (
    <div className="flex items-center justify-end gap-2">
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      <ActionMenu label={`Actions for ${row.name}`} actions={[
        ...ROLE_CHOICES.map((choice) => ({ label: `Make ${choice.label.toLowerCase()}`, icon: choice.icon, hidden: (row.role ?? 'STAFF') === choice.value, disabled: mutation.isPending, onSelect: () => mutation.mutate({ role: choice.value }) })),
        { label: row.active ? 'Deactivate' : 'Reactivate', icon: row.active ? Ban : RotateCcw, tone: row.active ? 'danger' as const : undefined, disabled: mutation.isPending, onSelect: () => mutation.mutate({ active: !row.active }) },
      ]} />
    </div>
  );
}

export function Staff() {
  const me = useDashboard();
  const canManage = me.permissions.includes('staffManage');
  const filters = useListFilters({ defaultSort: 'name', defaultDirection: 'asc', sortOptions: [
    { value: 'name', label: 'Name', kind: 'text' },
    { value: 'role', label: 'Role', kind: 'text' },
    { value: 'date', label: 'Date joined', kind: 'date' },
  ] });
  const query = useQuery({
    queryKey: ['staff', me.user.id],
    queryFn: async () => (await api.get<{ rows: Row[] }>('/dashboard/staff')).data,
  });
  const staffRows = (rows: Row[]) => filters.apply(rows, (row) => row.created_at, { name: (row) => row.name, role: (row) => row.role, date: (row) => row.created_at });
  const staffColumns: Column<Row>[] = [
                  { header: 'Name', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{row.email}</div></div> },
                  { header: 'Role', cell: (row) => <Badge tone={row.role === 'OWNER' ? 'good' : 'neutral'}>{humanize(row.role)}</Badge> },
                  { header: 'Status', cell: (row) => !row.active ? <Badge tone="bad">Deactivated</Badge> : row.locked ? <Badge tone="warn">Locked</Badge> : <Badge tone="good">Active</Badge> },
                  { header: 'Joined', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{row.created_at ? formatDateTime(row.created_at) : '—'}</span> },
                  ...(canManage ? [{ header: 'Manage', align: 'right' as const, cell: (row: Row) => (row.role === 'OWNER' || row.id === me.user.id ? <span className="text-xs text-slate-400">—</span> : <StaffControls row={row} />) }] : []),
  ];
  const exportStaff = async () => {
    const rows = query.data?.rows ?? [];
    return {
      businessName: me.business.name,
      currency: me.business.currency,
      title: 'Staff & roles',
      period: filters.period,
      stats: [
        { label: 'Staff', value: rows.length, kind: 'count' as const },
        { label: 'Active', value: rows.filter((row) => row.active).length, kind: 'count' as const },
        { label: 'Managers', value: rows.filter((row) => row.role === 'MANAGER' || row.role === 'OWNER').length, kind: 'count' as const },
        { label: 'Cashiers & staff', value: rows.filter((row) => row.role === 'CASHIER' || row.role === 'STAFF').length, kind: 'count' as const },
      ],
      tables: [await rowsToTable('Staff', staffColumns, staffRows(rows))],
    };
  };
  return (
    <>
      <PageHeader title="Staff & roles" subtitle={`New staff join with business code ${me.business.business_code} and start as Staff.`} />
      <StatRow>
        <MetricCard loading={!query.data} icon={Users} tone="slate" label="Staff" value={query.data?.rows.length.toLocaleString()} hint="Everyone on this business" />
        <MetricCard loading={!query.data} icon={UserCheck} tone="green" label="Active" value={query.data?.rows.filter((row) => row.active).length.toLocaleString()} hint="Can sign in" />
        <MetricCard loading={!query.data} icon={ShieldCheck} tone="blue" label="Managers" value={query.data?.rows.filter((row) => row.role === 'MANAGER' || row.role === 'OWNER').length.toLocaleString()} hint="Owner included" />
        <MetricCard loading={!query.data} icon={UserRound} tone="violet" label="Cashiers & staff" value={query.data?.rows.filter((row) => row.role === 'CASHIER' || row.role === 'STAFF').length.toLocaleString()} hint="Day-to-day team" />
      </StatRow>
      <Card>
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 p-4">{filters.controls}<ExportMenu build={exportStaff} disabled={!query.data} /></div>
        <div className={query.isError ? 'p-4' : ''}>
          <QueryBoundary query={query} skeleton={<TableSkeleton rows={6} columns={[{ header: 'Name' }, { header: 'Role' }, { header: 'Status' }, { header: 'Joined' }, ...(canManage ? [{ header: 'Manage', align: 'right' as const }] : [])]} />}>
            {(data) => (
              <DataTable
                rows={staffRows(data.rows)}
                rowKey={rowId}
                empty={filters.period.period === 'all' ? 'No staff yet.' : 'No staff joined in this period.'}
                columns={staffColumns}
              />
            )}
          </QueryBoundary>
        </div>
      </Card>
    </>
  );
}

export function Activity() {
  const me = useDashboard();
  const filters = useListFilters({ sortOptions: [
    { value: 'date', label: 'Date', kind: 'date' },
    { value: 'action', label: 'Action', kind: 'text' },
    { value: 'user', label: 'User', kind: 'text' },
  ] });
  const grants = useQuery({
    queryKey: ['support-access', me.user.id],
    queryFn: async () => (await api.get<{ rows: Row[] }>('/dashboard/support-access')).data,
  });
  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Activity log" subtitle="Includes anything MIA staff did to your business." />
        <PagedTable<Row>
          client={api} path="/dashboard/audit" queryKey="audit" rowKey={rowId} empty="No activity in this period."
          searchPlaceholder="Search action, item or person"
          exportTitle="Activity log"
          exportStats={(s: { count: number; people: number; reversals: number }) => [
            { label: 'Actions', value: s.count, kind: 'count' },
            { label: 'People', value: s.people, kind: 'count' },
            { label: 'Cancellations', value: s.reversals, kind: 'count' },
          ]}
          params={filters.params} toolbar={filters.controls}
          stats={(s?: { count: number; people: number; reversals: number }) => (
            <StatRow>
              <MetricCard loading={!s} icon={History} tone="slate" label="Actions" value={s?.count.toLocaleString()} hint="In the chosen period" />
              <MetricCard loading={!s} icon={Users} tone="blue" label="People" value={s?.people.toLocaleString()} hint="Who did something" />
              <MetricCard loading={!s} icon={Undo2} tone="amber" label="Cancellations" value={s?.reversals.toLocaleString()} hint="Voids, deletes, cancels" />
            </StatRow>
          )}
          columns={[
            { header: 'Action', cell: (row) => <span className="font-medium text-slate-900">{humanize(row.action)}</span> },
            { header: 'Item', cell: (row) => humanize(row.entity) },
            { header: 'By', cell: (row) => row.role === 'MIA_PLATFORM' ? <Badge tone="info">MIA staff</Badge> : row.user_name ?? '—' },
            { header: 'Reason', cell: (row) => row.reason ?? '—' },
            { header: 'Date', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(row.created_at)}</span> },
          ]}
        />
      </div>
      <Card title="MIA support access">
        <div className={grants.isError ? 'p-4' : ''}>
          <QueryBoundary query={grants} skeleton={<TableSkeleton rows={3} columns={[{ header: 'Support person' }, { header: 'Reason' }, { header: 'Started' }, { header: 'Ended' }]} />}>
            {(data) => (
              <DataTable
                rows={data.rows}
                rowKey={rowId}
                empty="MIA support has not accessed your business."
                columns={[
                  { header: 'Support person', cell: (row) => <span className="font-medium text-slate-900">{row.admin_name}</span> },
                  { header: 'Reason', cell: (row) => row.reason },
                  { header: 'Started', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(row.created_at)}</span> },
                  { header: 'Ended', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(row.revoked_at ?? row.expires_at)}</span> },
                ]}
              />
            )}
          </QueryBoundary>
        </div>
      </Card>
    </div>
  );
}

export function BusinessSettings() {
  const me = useDashboard();
  const fields: [string, string][] = [
    ['Business name', me.business.name],
    ['Business code', me.business.business_code],
    ['Currency', me.business.currency],
    ['Country', me.business.country],
    ['Timezone', me.business.timezone],
    ['Your role', humanize(me.user.role)],
    ['Your email', me.user.email],
  ];
  return (
    <>
      <PageHeader title="Settings" subtitle="Business details are changed in the MIA app." />
      <Card>
        <dl className="divide-y divide-slate-100">
          {fields.map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
