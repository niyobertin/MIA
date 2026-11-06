import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatDateTime, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { Badge, Button, Card, DataTable, Dialog, ErrorNotice, inputClass, PagedTable, PageHeader, QueryBoundary, ReasonAction } from '../ui/kit';
import { OverviewContent, type OverviewData } from '../business/Overview';
import { useAdmin } from './PlatformGate';

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
    <select id={id} required={!allowAll} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">{allowAll ? 'All businesses' : 'Choose a business'}</option>
      {(options.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name} ({row.business_code})</option>)}
    </select>
  );
}

function grantActive(row: Row) {
  return !row.revoked_at && new Date(row.expires_at) > new Date();
}

function SupportViewer({ grant, onClose }: { grant: Row; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['support-view', grant.business_id],
    queryFn: async () => (await platformApi.get<{ business: Row; overview: OverviewData }>(`/support/${grant.business_id}/overview`, { params: { period: '30d' } })).data,
  });
  return (
    <div className="space-y-4">
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span><strong>Read-only support session:</strong> {grant.business_name}, last 30 days. Ends {formatDateTime(grant.expires_at)}. Each view is logged.</span>
        <Button onClick={onClose}>Close view</Button>
      </div>
      <QueryBoundary query={query}>{(data) => <OverviewContent data={data.overview} currency={data.business.currency} />}</QueryBoundary>
    </div>
  );
}

export function SupportAccess() {
  const admin = useAdmin();
  const client = useQueryClient();
  const [businessId, setBusinessId] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState('');
  const [viewing, setViewing] = useState<Row | null>(null);
  const grants = useQuery({ queryKey: ['support-grants'], queryFn: async () => (await platformApi.get<{ rows: Row[] }>('/support/grants')).data });
  const start = useMutation({
    mutationFn: () => platformApi.post('/support/grants', { business_id: businessId, minutes, reason }),
    onSuccess: async () => {
      setReason('');
      setBusinessId('');
      await client.invalidateQueries({ queryKey: ['support-grants'] });
    },
  });
  if (viewing) return <SupportViewer grant={viewing} onClose={() => setViewing(null)} />;
  return (
    <>
      <PageHeader title="Support access" subtitle="Time-limited, read-only access to one business. The owner is told, and it appears in their activity log." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Start a session">
          <form onSubmit={(event) => { event.preventDefault(); start.mutate(); }} className="space-y-3 p-5">
            <div><label htmlFor="grant-business" className="block text-sm font-medium text-slate-700 mb-1.5">Business</label><BusinessSelect id="grant-business" value={businessId} onChange={setBusinessId} /></div>
            <div>
              <label htmlFor="grant-minutes" className="block text-sm font-medium text-slate-700 mb-1.5">Length</label>
              <select id="grant-minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inputClass}>
                <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option>
              </select>
            </div>
            <div><label htmlFor="grant-reason" className="block text-sm font-medium text-slate-700 mb-1.5">Reason (the owner sees this)</label><textarea id="grant-reason" required minLength={5} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></div>
            {start.isError ? <ErrorNotice error={start.error} /> : null}
            <Button type="submit" tone="primary" disabled={start.isPending}>Start session</Button>
          </form>
        </Card>
        <Card title="Sessions" className="lg:col-span-2">
          <div className={grants.isError ? 'p-4' : ''}>
            <QueryBoundary query={grants}>
              {(data) => (
                <DataTable rows={data.rows} rowKey={rowId} empty="No support sessions yet." columns={[
                  { header: 'Business', cell: (row) => <div><div className="font-semibold text-slate-900">{row.business_name}</div><div className="text-xs text-slate-500">{row.admin_name}</div></div> },
                  { header: 'Reason', cell: (row) => <span className="text-xs">{row.reason}</span> },
                  { header: 'Status', cell: (row) => grantActive(row) ? <Badge tone="info">Active</Badge> : <Badge>Ended</Badge> },
                  { header: 'Started', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(row.created_at)}</span> },
                  { header: '', align: 'right', cell: (row) => grantActive(row) ? (
                    <div className="flex justify-end gap-1.5">
                      {row.admin_id === admin.id ? <Button className="!px-2.5 !py-1.5 !text-xs" onClick={() => setViewing(row)}>View</Button> : null}
                      {row.admin_id === admin.id || admin.role === 'SUPER_ADMIN' ? <ReasonAction label="End" needsReason={false} title="End this support session" invalidate={['support-grants']} run={() => platformApi.post(`/support/grants/${row.id}/revoke`)} /> : null}
                    </div>
                  ) : null },
                ]} />
              )}
            </QueryBoundary>
          </div>
        </Card>
      </div>
    </>
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
              <select id="dr-type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}><option value="export">Export</option><option value="deletion">Deletion</option></select>
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

export function Announcements() {
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('info');
  const [businessId, setBusinessId] = useState('');
  const query = useQuery({ queryKey: ['announcements'], queryFn: async () => (await platformApi.get<{ rows: Row[] }>('/announcements')).data });
  const create = useMutation({
    mutationFn: () => platformApi.post('/announcements', { title, body, severity, business_id: businessId || null }),
    onSuccess: async () => {
      setTitle('');
      setBody('');
      setBusinessId('');
      await client.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
  return (
    <>
      <PageHeader title="Announcements" subtitle="Shown at the top of the web dashboard. The mobile app doesn't show them yet." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="New announcement">
          <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="space-y-3 p-5">
            <div><label htmlFor="an-title" className="block text-sm font-medium text-slate-700 mb-1.5">Title</label><input id="an-title" required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} /></div>
            <div><label htmlFor="an-body" className="block text-sm font-medium text-slate-700 mb-1.5">Message</label><textarea id="an-body" required minLength={3} maxLength={1000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} /></div>
            <div>
              <label htmlFor="an-severity" className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
              <select id="an-severity" value={severity} onChange={(e) => setSeverity(e.target.value)} className={inputClass}><option value="info">Information</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
            </div>
            <div><label htmlFor="an-business" className="block text-sm font-medium text-slate-700 mb-1.5">Show to</label><BusinessSelect id="an-business" value={businessId} onChange={setBusinessId} allowAll /></div>
            {create.isError ? <ErrorNotice error={create.error} /> : null}
            <Button type="submit" tone="primary" disabled={create.isPending}>Publish</Button>
          </form>
        </Card>
        <Card title="Published" className="lg:col-span-2">
          <div className={query.isError ? 'p-4' : ''}>
            <QueryBoundary query={query}>
              {(data) => (
                <DataTable rows={data.rows} rowKey={rowId} empty="No announcements yet." columns={[
                  { header: 'Announcement', cell: (row) => <div className="min-w-[12rem]"><div className="font-semibold text-slate-900">{row.title}</div><div className="text-xs text-slate-500">{row.body}</div></div> },
                  { header: 'Show to', cell: (row) => row.business_name ?? 'All businesses' },
                  { header: 'Status', cell: (row) => row.active ? <Badge tone="good">Live</Badge> : <Badge>Ended</Badge> },
                  { header: '', align: 'right', cell: (row) => row.active ? <ReasonAction label="End" needsReason={false} title={`End "${row.title}"`} invalidate={['announcements']} run={() => platformApi.patch(`/announcements/${row.id}`, { active: false })} /> : null },
                ]} />
              )}
            </QueryBoundary>
          </div>
        </Card>
      </div>
    </>
  );
}

export function AuditLog() {
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every platform action and sign-in. Entries can't be edited or deleted here." />
      <PagedTable<Row>
        client={platformApi} path="/audit" queryKey="platform-audit" rowKey={rowId} searchPlaceholder="Search action, admin or business" empty="No entries match."
        columns={[
          { header: 'When', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(row.created_at)}</span> },
          { header: 'Admin', cell: (row) => row.admin_email ?? 'Unknown' },
          { header: 'Action', cell: (row) => <span className="font-medium text-slate-900">{humanize(row.action)}</span> },
          { header: 'Business', cell: (row) => row.business_name ?? '—' },
          { header: 'Reason', cell: (row) => <span className="text-xs">{row.reason ?? '—'}</span> },
          { header: 'IP address', cell: (row) => <code className="text-xs">{row.ip ?? '—'}</code> },
        ]}
      />
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
              <select id="ad-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
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
                  { header: 'Two-factor', cell: (row) => row.totp_enabled ? <Badge tone="good">On</Badge> : <Badge tone="warn">Not set up</Badge> },
                  { header: 'Status', cell: (row) => row.active ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Deactivated</Badge> },
                  { header: 'Last sign-in', cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(row.last_login_at)}</span> },
                  { header: 'Actions', align: 'right', cell: (row) => row.id === me.id ? null : (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <ReasonAction label="Reset password" title={`Reset the password for ${row.email}`} description="Creates a temporary password and signs them out." invalidate={['platform-admins']} run={action(row.id, 'reset-password')} onDone={(result) => setTemporary({ email: row.email, password: (result as { data: { temporary_password: string } }).data.temporary_password })} />
                      <ReasonAction label="Reset 2FA" title={`Reset two-factor for ${row.email}`} description="They set it up again at their next sign-in." invalidate={['platform-admins']} run={action(row.id, 'reset-2fa')} />
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
