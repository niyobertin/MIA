import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatDate, formatDateTime, formatMoney, humanize } from '../lib/format';
import { Badge, Button, Card, DataTable, ErrorNotice, inputClass, PagedTable, PageHeader, QueryBoundary } from '../ui/kit';
import { useDashboard } from './BusinessApp';

type Row = Record<string, any>;
const rowId = (row: Row) => String(row.id);

export function Reports() {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  return (
    <>
      <PageHeader title="Business reports" subtitle="Daily closings recorded in the MIA app." />
      <PagedTable<Row>
        client={api} path="/dashboard/reports/closings" queryKey="closings" rowKey={rowId} empty="No daily closings yet."
        columns={[
          { header: 'Date', cell: (row) => <span className="font-medium text-slate-900 whitespace-nowrap">{formatDate(row.business_date)} #{row.session_number}</span> },
          { header: 'Status', cell: (row) => <Badge tone={row.status === 'closed' ? 'good' : 'info'}>{humanize(row.status)}</Badge> },
          { header: 'Sales', align: 'right', cell: (row) => money(row.total_sales) },
          { header: 'Gross profit', align: 'right', cell: (row) => money(row.gross_profit) },
          { header: 'Expenses', align: 'right', cell: (row) => money(row.expenses) },
          { header: 'Net profit', align: 'right', cell: (row) => money(row.net_profit) },
          { header: 'Cash variance', align: 'right', cell: (row) => row.cash_variance === 0 ? money(0) : <span className="font-semibold text-rose-700">{money(row.cash_variance)}</span> },
        ]}
      />
    </>
  );
}

function StaffControls({ row }: { row: Row }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (change: { role?: string; active?: boolean }) => api.patch(`/dashboard/staff/${row.id}`, change),
    onSuccess: () => client.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'staff' }),
  });
  return (
    <div className="flex items-center justify-end gap-2">
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      <select aria-label={`Role for ${row.name}`} value={row.role ?? 'STAFF'} disabled={mutation.isPending} onChange={(e) => mutation.mutate({ role: e.target.value })} className={`${inputClass} !w-auto !py-1.5`}>
        <option value="MANAGER">Manager</option>
        <option value="CASHIER">Cashier</option>
        <option value="STAFF">Staff</option>
      </select>
      <Button className="!px-2.5 !py-1.5 !text-xs" disabled={mutation.isPending} onClick={() => mutation.mutate({ active: !row.active })}>{row.active ? 'Deactivate' : 'Reactivate'}</Button>
    </div>
  );
}

export function Staff() {
  const me = useDashboard();
  const canManage = me.permissions.includes('staffManage');
  const query = useQuery({
    queryKey: ['staff', me.user.id],
    queryFn: async () => (await api.get<{ rows: Row[] }>('/dashboard/staff')).data,
  });
  return (
    <>
      <PageHeader title="Staff & roles" subtitle={`New staff join with business code ${me.business.business_code} and start as Staff.`} />
      <Card>
        <div className={query.isError ? 'p-4' : ''}>
          <QueryBoundary query={query}>
            {(data) => (
              <DataTable
                rows={data.rows}
                rowKey={rowId}
                empty="No staff yet."
                columns={[
                  { header: 'Name', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{row.email}</div></div> },
                  { header: 'Role', cell: (row) => <Badge tone={row.role === 'OWNER' ? 'good' : 'neutral'}>{humanize(row.role)}</Badge> },
                  { header: 'Status', cell: (row) => !row.active ? <Badge tone="bad">Deactivated</Badge> : row.locked ? <Badge tone="warn">Locked</Badge> : <Badge tone="good">Active</Badge> },
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
  const grants = useQuery({
    queryKey: ['support-access', me.user.id],
    queryFn: async () => (await api.get<{ rows: Row[] }>('/dashboard/support-access')).data,
  });
  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Activity log" subtitle="Includes anything MIA staff did to your business." />
        <PagedTable<Row>
          client={api} path="/dashboard/audit" queryKey="audit" rowKey={rowId} empty="No activity yet."
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
