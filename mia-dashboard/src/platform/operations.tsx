import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatDateTime, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { Badge, Button, Card, DataTable, Dialog, ErrorNotice, inputClass, PageHeader, QueryBoundary, ReasonAction } from '../ui/kit';
import { useAdmin } from './context';
import { Select } from '../ui/Select';

type Row = Record<string, any>;
const rowId = (row: Row) => String(row.id);

function useBusinessOptions() {
  return useQuery({
    queryKey: ['platform-business-options'],
    queryFn: async () => (await platformApi.get<{ rows: Row[] }>('/businesses', { params: { limit: 200 } })).data.rows,
  });
}

function BusinessSelect({ id, value, onChange, allowAll }: { id: string; value: string; onChange: (value: string) => void; allowAll?: boolean }) {
  const options = useBusinessOptions();
  return (
    <Select
      id={id}
      required={!allowAll}
      value={value}
      onChange={onChange}
      placeholder="Choose a business"
      options={[
        ...(allowAll ? [{ value: '', label: 'All businesses' }] : []),
        ...(options.data ?? []).map((row) => ({ value: row.id, label: row.name, hint: row.business_code })),
      ]}
    />
  );
}

export function DataRecords() {
  const client = useQueryClient();
  const [businessId, setBusinessId] = useState('');
  const [type, setType] = useState('export');
  const [notes, setNotes] = useState('');
  const requests = useQuery({ queryKey: ['data-requests'], queryFn: async () => (await platformApi.get<{ rows: Row[] }>('/data-requests')).data });
  const backups = useQuery({ queryKey: ['backups'], queryFn: async () => (await platformApi.get<{ configured: boolean; files: Row[] }>('/backups')).data });
  const create = useMutation({
    mutationFn: () => platformApi.post('/data-requests', { business_id: businessId, type, notes: notes || undefined }),
    onSuccess: async () => {
      setNotes('');
      setBusinessId('');
      await client.invalidateQueries({ queryKey: ['data-requests'] });
    },
  });
  const update = (id: string, status: string) => () => platformApi.patch(`/data-requests/${id}`, { status });
  return (
    <>
      <PageHeader title="Data & backups" subtitle="Export a business from its page. Deletion requests are tracked here, but nothing is deleted automatically." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Log a request">
          <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="space-y-3 p-5">
            <div><label htmlFor="dr-business" className="block text-sm font-medium text-slate-700 mb-1.5">Business</label><BusinessSelect id="dr-business" value={businessId} onChange={setBusinessId} /></div>
            <div>
              <label htmlFor="dr-type" className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
              <Select id="dr-type" value={type} onChange={setType} options={[{ value: 'export', label: 'Export' }, { value: 'deletion', label: 'Deletion' }]} />
            </div>
            <div><label htmlFor="dr-notes" className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label><textarea id="dr-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></div>
            {create.isError ? <ErrorNotice error={create.error} /> : null}
            <Button type="submit" tone="primary" disabled={create.isPending}>Log request</Button>
          </form>
        </Card>
        <Card title="Requests" className="lg:col-span-2">
          <div className={requests.isError ? 'p-4' : ''}>
            <QueryBoundary query={requests}>
              {(data) => (
                <DataTable rows={data.rows} rowKey={rowId} empty="No data requests yet." columns={[
                  { header: 'Business', cell: (row) => <span className="font-semibold text-slate-900">{row.business_name ?? row.business_id}</span> },
                  { header: 'Type', cell: (row) => humanize(row.type) },
                  { header: 'Status', cell: (row) => <Badge tone={row.status === 'completed' ? 'good' : row.status === 'rejected' ? 'bad' : 'warn'}>{humanize(row.status)}</Badge> },
                  { header: 'Logged', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDate(row.created_at)}</span> },
                  { header: '', align: 'right', cell: (row) => row.status === 'completed' || row.status === 'rejected' ? null : (
                    <div className="flex justify-end gap-1.5">
                      {row.status === 'open' ? <ReasonAction label="Start" needsReason={false} title="Mark as in progress" invalidate={['data-requests']} run={update(row.id, 'in_progress')} /> : null}
                      <ReasonAction label="Complete" needsReason={false} title="Mark as completed" description={row.type === 'deletion' ? 'This only updates the record. Deleting the data is a separate manual job.' : undefined} invalidate={['data-requests']} run={update(row.id, 'completed')} />
                      <ReasonAction label="Reject" needsReason={false} title="Reject this request" invalidate={['data-requests']} run={update(row.id, 'rejected')} />
                    </div>
                  ) },
                ]} />
              )}
            </QueryBoundary>
          </div>
        </Card>
      </div>
      <Card title="Database backups" className="mt-6">
        <div className={backups.isError ? 'p-4' : ''}>
          <QueryBoundary query={backups}>
            {(data) => (
              <DataTable rows={data.files} rowKey={(row) => row.name} empty={data.configured ? 'No backup files found.' : 'No backup folder found on this server. Run npm run db:backup, and schedule it.'} columns={[
                { header: 'File', cell: (row) => <code className="text-xs">{row.name}</code> },
                { header: 'Size', align: 'right', cell: (row) => `${(row.size_bytes / 1024 / 1024).toFixed(1)} MB` },
                { header: 'Created', cell: (row) => formatDateTime(row.created_at) },
              ]} />
            )}
          </QueryBoundary>
        </div>
      </Card>
    </>
  );
}

const ROLE_OPTIONS = [
  { value: 'SUPPORT', label: 'Support' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'SUPER_ADMIN', label: 'Super admin' },
];

export function Admins() {
  const me = useAdmin();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('SUPPORT');
  const [temporary, setTemporary] = useState<{ email: string; password: string } | null>(null);
  const query = useQuery({ queryKey: ['platform-admins'], queryFn: async () => (await platformApi.get<{ rows: Row[] }>('/admins')).data });
  const create = useMutation({
    mutationFn: () => platformApi.post('/admins', { name, email, role }),
    onSuccess: async ({ data }) => {
      setTemporary({ email: data.admin.email, password: data.temporary_password });
      setName('');
      setEmail('');
      await client.invalidateQueries({ queryKey: ['platform-admins'] });
    },
  });
  const action = (id: string, name: string, extra?: Row) => (reason: string) => platformApi.post(`/admins/${id}/${name}`, { reason, ...extra });
  return (
    <>
      <PageHeader title="Platform admins" subtitle="Super admin has full access. Support handles accounts and sync. Finance handles subscriptions." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Add an admin">
          <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="space-y-3 p-5">
            <div><label htmlFor="ad-name" className="block text-sm font-medium text-slate-700 mb-1.5">Name</label><input id="ad-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></div>
            <div><label htmlFor="ad-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label><input id="ad-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></div>
            <div>
              <label htmlFor="ad-role" className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
              <Select id="ad-role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
            </div>
            {create.isError ? <ErrorNotice error={create.error} /> : null}
            <Button type="submit" tone="primary" disabled={create.isPending}>Add admin</Button>
          </form>
        </Card>
        <Card title="Admins" className="lg:col-span-2">
          <div className={query.isError ? 'p-4' : ''}>
            <QueryBoundary query={query}>
              {(data) => (
                <DataTable rows={data.rows} rowKey={rowId} columns={[
                  { header: 'Admin', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}{row.id === me.id ? ' (you)' : ''}</div><div className="text-xs text-slate-500">{row.email}</div></div> },
                  { header: 'Role', cell: (row) => humanize(row.role) },
                  { header: 'Two-factor', cell: (row) => row.two_factor === 'email' ? <Badge tone="good">Email code</Badge> : <Badge tone="warn">Off</Badge> },
                  { header: 'Status', cell: (row) => row.active ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Deactivated</Badge> },
                  { header: 'Last sign-in', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(row.last_login_at)}</span> },
                  { header: 'Actions', align: 'right', cell: (row) => row.id === me.id ? null : (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <ReasonAction label="Reset password" title={`Reset the password for ${row.email}`} description="Creates a temporary password and signs them out." invalidate={['platform-admins']} run={action(row.id, 'reset-password')} onDone={(result) => setTemporary({ email: row.email, password: (result as { data: { temporary_password: string } }).data.temporary_password })} />
                      {row.active
                        ? <ReasonAction label="Deactivate" tone="danger" title={`Deactivate ${row.email}`} invalidate={['platform-admins']} run={action(row.id, 'deactivate')} />
                        : <ReasonAction label="Reactivate" title={`Reactivate ${row.email}`} invalidate={['platform-admins']} run={action(row.id, 'reactivate')} />}
                    </div>
                  ) },
                ]} />
              )}
            </QueryBoundary>
          </div>
        </Card>
      </div>
      {temporary ? (
        <Dialog title="Temporary password" onClose={() => setTemporary(null)}>
          <p className="text-sm text-slate-600 mb-3">Give this to {temporary.email} privately. It's shown only once, and they must change it at sign-in.</p>
          <code className="block break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-slate-900">{temporary.password}</code>
          <div className="mt-4 flex justify-end"><Button onClick={() => setTemporary(null)}>Done</Button></div>
        </Dialog>
      ) : null}
    </>
  );
}
