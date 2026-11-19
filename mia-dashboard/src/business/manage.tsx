import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatDateTime, humanize } from '../lib/format';
import { Badge, Button, Card, DataTable, ErrorNotice, PagedTable, PageHeader, QueryBoundary } from '../ui/kit';
import { useDashboard } from './BusinessApp';
import { Select } from '../ui/Select';
import { useListFilters } from '../ui/ListFilters';

export { Reports } from './reports';

type Row = Record<string, any>;
const rowId = (row: Row) => String(row.id);

function StaffControls({ row }: { row: Row }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (change: { role?: string; active?: boolean }) => api.patch(`/dashboard/staff/${row.id}`, change),
    onSuccess: () => client.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'staff' }),
  });
  return (
    <div className="flex items-center justify-end gap-2">
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      <Select ariaLabel={`Role for ${row.name}`} size="sm" className="w-32" value={row.role ?? 'STAFF'} disabled={mutation.isPending} onChange={(role) => mutation.mutate({ role })} options={[{ value: 'MANAGER', label: 'Manager' }, { value: 'CASHIER', label: 'Cashier' }, { value: 'STAFF', label: 'Staff' }]} />
      <Button className="!px-2.5 !py-1.5 !text-xs" disabled={mutation.isPending} onClick={() => mutation.mutate({ active: !row.active })}>{row.active ? 'Deactivate' : 'Reactivate'}</Button>
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
  return (
    <>
      <PageHeader title="Staff & roles" subtitle={`New staff join with business code ${me.business.business_code} and start as Staff.`} />
      <Card>
        <div className="flex justify-end border-b border-slate-100 p-4">{filters.controls}</div>
        <div className={query.isError ? 'p-4' : ''}>
          <QueryBoundary query={query}>
            {(data) => (
              <DataTable
                rows={filters.apply(data.rows, (row) => row.created_at, { name: (row) => row.name, role: (row) => row.role, date: (row) => row.created_at })}
                rowKey={rowId}
                empty={filters.period.period === 'all' ? 'No staff yet.' : 'No staff joined in this period.'}
                columns={[
                  { header: 'Name', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{row.email}</div></div> },
                  { header: 'Role', cell: (row) => <Badge tone={row.role === 'OWNER' ? 'good' : 'neutral'}>{humanize(row.role)}</Badge> },
                  { header: 'Status', cell: (row) => !row.active ? <Badge tone="bad">Deactivated</Badge> : row.locked ? <Badge tone="warn">Locked</Badge> : <Badge tone="good">Active</Badge> },
                  { header: 'Joined', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{row.created_at ? formatDateTime(row.created_at) : '—'}</span> },
                  ...(canManage ? [{ header: 'Manage', align: 'right' as const, cell: (row: Row) => (row.role === 'OWNER' || row.id === me.user.id ? <span className="text-xs text-slate-400">—</span> : <StaffControls row={row} />) }] : []),
                ]}
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
          params={filters.params} toolbar={filters.controls}
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
          <QueryBoundary query={grants}>
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
