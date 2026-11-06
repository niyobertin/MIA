import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { formatDate, formatDateTime, formatNumber, getErrorMessage, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { Badge, Button, Card, DataTable, Dialog, ErrorNotice, inputClass, PagedTable, PageHeader, QueryBoundary, ReasonAction, Stat } from '../ui/kit';
import { useCan } from './PlatformGate';

type Row = Record<string, any>;
const rowId = (row: Row) => String(row.id);

const statusBadge = (status: string) => <Badge tone={status === 'suspended' ? 'bad' : 'good'}>{humanize(status)}</Badge>;

export function Businesses() {
  const [status, setStatus] = useState('all');
  return (
    <>
      <PageHeader
        title="Businesses"
        action={(
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} !w-auto`}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        )}
      />
      <PagedTable<Row>
        client={platformApi} path="/businesses" queryKey="platform-businesses" rowKey={rowId} params={{ status }}
        searchPlaceholder="Search name or business code" empty="No businesses match."
        columns={[
          { header: 'Business', cell: (row) => <div><Link to={`/platform/businesses/${row.id}`} className="font-semibold text-slate-900 hover:underline">{row.name}</Link><div className="text-xs text-slate-500">{row.business_code}</div></div> },
          { header: 'Owner', cell: (row) => row.owner_email ?? '—' },
          { header: 'Status', cell: (row) => statusBadge(row.status) },
          { header: 'Plan', cell: (row) => <span>{humanize(row.plan)} · {humanize(row.subscription_status)}</span> },
          { header: 'Users', align: 'right', cell: (row) => row.users },
          { header: 'Joined', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDate(row.created_at)}</span> },
        ]}
      />
    </>
  );
}

function UserActions({ row }: { row: Row }) {
  const post = (action: string) => (reason: string) => platformApi.post(`/users/${row.id}/${action}`, { reason });
  const invalidate = ['platform-users', 'platform-business'];
  const locked = row.locked_until && new Date(row.locked_until) > new Date();
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {locked ? <ReasonAction label="Unlock" title={`Unlock ${row.email}`} invalidate={invalidate} run={post('unlock')} /> : null}
      {row.active ? <ReasonAction label="Send PIN reset" title={`Send a PIN reset to ${row.email}`} description="They get a code by email. You never see it." invalidate={invalidate} run={post('send-pin-reset')} /> : null}
      {row.active ? <ReasonAction label="Sign out" title={`Sign out ${row.email}`} description="Ends their sessions on every device." invalidate={invalidate} run={post('force-signout')} /> : null}
      {row.active
        ? <ReasonAction label="Deactivate" tone="danger" title={`Deactivate ${row.email}`} description="They lose access right away, including sync." invalidate={invalidate} run={post('deactivate')} />
        : <ReasonAction label="Reactivate" title={`Reactivate ${row.email}`} invalidate={invalidate} run={post('reactivate')} />}
    </div>
  );
}

export function PlatformUsers() {
  const canManage = useCan('users:manage');
  return (
    <>
      <PageHeader title="User accounts" subtitle="PINs are never visible here." />
      <PagedTable<Row>
        client={platformApi} path="/users" queryKey="platform-users" rowKey={rowId}
        searchPlaceholder="Search name, email or phone" empty="No users match."
        columns={[
          { header: 'User', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{row.email}</div></div> },
          { header: 'Business', cell: (row) => row.business_id ? <Link to={`/platform/businesses/${row.business_id}`} className="hover:underline">{row.business_name}</Link> : '—' },
          { header: 'Role', cell: (row) => humanize(row.role) },
          { header: 'Status', cell: (row) => !row.active ? <Badge tone="bad">Deactivated</Badge> : row.locked_until && new Date(row.locked_until) > new Date() ? <Badge tone="warn">Locked</Badge> : <Badge tone="good">Active</Badge> },
          ...(canManage ? [{ header: 'Actions', align: 'right' as const, cell: (row: Row) => <UserActions row={row} /> }] : []),
        ]}
      />
    </>
  );
}

function FlagEditor({ id, flags, definitions }: { id: string; flags: Record<string, boolean>; definitions: Record<string, { label: string; description: string }> }) {
  const client = useQueryClient();
  const [pending, setPending] = useState<{ key: string; value: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => platformApi.patch(`/businesses/${id}/flags`, { flags: { [pending!.key]: pending!.value }, reason }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['platform-business', id] });
      setPending(null);
      setReason('');
    },
  });
  return (
    <>
      <ul className="divide-y divide-slate-100">
        {Object.entries(definitions).map(([key, definition]) => (
          <li key={key} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">{definition.label}</div>
              <div className="text-xs text-slate-500">{definition.description}</div>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={flags[key]} onChange={(e) => { mutation.reset(); setPending({ key, value: e.target.checked }); }} className="h-4 w-4 accent-emerald-700" />
              {flags[key] ? 'On' : 'Off'}
            </label>
          </li>
        ))}
      </ul>
      {pending ? (
        <Dialog title={`Turn ${definitions[pending.key].label} ${pending.value ? 'on' : 'off'}`} onClose={() => setPending(null)}>
          <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="space-y-3">
            <label htmlFor="flag-reason" className="block text-sm font-medium text-slate-700">Reason (saved in the audit log)</label>
            <textarea id="flag-reason" required minLength={5} rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setPending(null)}>Cancel</Button>
              <Button type="submit" tone="primary" disabled={mutation.isPending}>Save</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

export function ExportButton({ id, name }: { id: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <ReasonAction
        label="Export data"
        title={`Export data for ${name}`}
        description="Downloads this business's records as JSON. PINs are left out, and the owner is told."
        invalidate={['platform-audit']}
        run={async (reason) => {
          setError(null);
          try {
            const response = await platformApi.get(`/businesses/${id}/export`, { params: { reason }, responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = `mia-${name.replace(/\W+/g, '-').toLowerCase()}.json`;
            link.click();
            URL.revokeObjectURL(url);
          } catch (problem) {
            setError(getErrorMessage(problem, 'Could not export this data.'));
          }
        }}
      />
      {error ? <span role="alert" className="text-xs text-rose-700">{error}</span> : null}
    </span>
  );
}

export function BusinessDetail() {
  const { id = '' } = useParams();
  const canSuspend = useCan('businesses:suspend');
  const canFlags = useCan('flags:manage');
  const canExport = useCan('data:manage');
  const canSeeUsers = useCan('users:read');
  const canManageUsers = useCan('users:manage');
  const query = useQuery({
    queryKey: ['platform-business', id],
    queryFn: async () => (await platformApi.get<Row>(`/businesses/${id}`)).data,
  });
  return (
    <>
      <Link to="/platform/businesses" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:underline"><ArrowLeft size={14} /> Businesses</Link>
      <QueryBoundary query={query}>
        {(data) => {
          const suspended = data.state.status === 'suspended';
          const invalidate = ['platform-business', 'platform-businesses', 'platform-overview'];
          return (
            <div className="space-y-6">
              <PageHeader
                title={data.business.name}
                subtitle={`${data.business.business_code} · ${data.business.country} · ${data.business.currency}`}
                action={(
                  <div className="flex flex-wrap items-start gap-2">
                    {canExport ? <ExportButton id={id} name={data.business.name} /> : null}
                    {canSuspend ? (suspended
                      ? <ReasonAction label="Reactivate" tone="primary" title={`Reactivate ${data.business.name}`} description="Sign-in and sync work again, and the owner is emailed." invalidate={invalidate} run={(reason) => platformApi.post(`/businesses/${id}/reactivate`, { reason })} />
                      : <ReasonAction label="Suspend" tone="danger" title={`Suspend ${data.business.name}`} description="Staff can't sign in or sync until it's reactivated. Phones keep working offline, and the owner is emailed." invalidate={invalidate} run={(reason) => platformApi.post(`/businesses/${id}/suspend`, { reason })} />
                    ) : null}
                  </div>
                )}
              />
              {suspended ? <div role="status" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800"><strong>Suspended {formatDateTime(data.state.suspended_at)}.</strong> {data.state.suspended_reason}</div> : null}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Status" value={statusBadge(data.state.status)} />
                <Stat label="Plan" value={humanize(data.state.plan)} hint={humanize(data.state.subscription_status)} />
                <Stat label="Sales recorded" value={formatNumber(data.counts.sales)} />
                <Stat label="Products · customers" value={`${formatNumber(data.counts.products)} · ${formatNumber(data.counts.customers)}`} />
              </div>
              {canSeeUsers ? (
                <Card title="Team">
                  <DataTable
                    rows={data.users as Row[]}
                    rowKey={rowId}
                    empty="No users in this business."
                    columns={[
                      { header: 'User', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{row.email}</div></div> },
                      { header: 'Role', cell: (row) => humanize(row.role) },
                      { header: 'Status', cell: (row) => row.active ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Deactivated</Badge> },
                      ...(canManageUsers ? [{ header: 'Actions', align: 'right' as const, cell: (row: Row) => <UserActions row={row} /> }] : []),
                    ]}
                  />
                </Card>
              ) : null}
              {canFlags ? <Card title="Feature flags"><FlagEditor id={id} flags={data.flags} definitions={data.flag_definitions} /></Card> : null}
            </div>
          );
        }}
      </QueryBoundary>
    </>
  );
}
