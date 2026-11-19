import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, CircleCheck, Download, Eye, History, KeyRound, LogOut, Pencil, ShieldCheck, Unlock, UserCog, UserMinus, UserPlus, Users, UserX } from 'lucide-react';
import { formatDate, formatDateTime, formatNumber, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { Select } from '../ui/Select';
import {
  ActionMenu, AdminButton, AdminTable, Chip, ConfirmDialog, DetailList, Drawer, EmptyState, ErrorState, FilterSelect, IconAction, initials, KpiCard,
  Modal, Panel, SearchInput, StatusBadge, TableToolbar, timeAgo, useInvalidate, fieldClass, labelClass, type AdminColumn, AdminPageHeader,
} from './ui/admin';
import { DrawerSkeleton, KpiGridSkeleton, LoadingRegion, PageHeaderSkeleton, TableCardSkeleton } from './ui/skeleton';
import { useServerList } from './ui/useServerList';
import { BusinessPicker, downloadCsv, ROLE_OPTIONS, shortId } from './shared';
import { useCan } from './context';

export type UserRow = {
  id: string; name: string; email: string | null; phone: string | null; role: string | null; active: boolean; locked_until: string | null;
  failed_login_attempts: number; last_login_at: string | null; business_id: string | null; business_name: string | null; business_code?: string | null; created_at: string;
};
type UserSummary = { total: number; active: number; inactive: number; locked: number; total_30d_ago: number; new_30d: number; platform_admins: number; super_admins: number };

export const isLocked = (row: Pick<UserRow, 'locked_until'>) => Boolean(row.locked_until && new Date(row.locked_until) > new Date());
export const userStatus = (row: Pick<UserRow, 'active' | 'locked_until'>) => (!row.active ? 'inactive' : isLocked(row) ? 'locked' : 'active');

const USER_COLUMNS_SKELETON = [
  { width: 'w-16' }, { width: 'w-32', kind: 'avatar' as const }, { width: 'w-36' }, { width: 'w-16' }, { width: 'w-28' }, { width: 'w-16', kind: 'badge' as const },
  { width: 'w-20' }, { width: 'w-20' }, { width: 'w-16', kind: 'actions' as const, align: 'right' as const },
];

export function UsersManagementSkeleton() {
  return (
    <LoadingRegion label="Loading users" className="space-y-6">
      <PageHeaderSkeleton actions={2} />
      <KpiGridSkeleton />
      <TableCardSkeleton filters={3} columns={USER_COLUMNS_SKELETON} headers={['User ID', 'Full name', 'Email / username', 'Role', 'Organization', 'Status', 'Last login', 'Created', 'Actions']} />
    </LoadingRegion>
  );
}

type Dialog =
  | { kind: 'edit' | 'role' | 'deactivate' | 'reactivate' | 'force-signout' | 'send-pin-reset' | 'unlock'; user: UserRow }
  | { kind: 'add'; businessId?: string }
  | null;

export function useUserActions(onOpen: (user: UserRow) => void) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const canManage = useCan('users:manage');
  const actionsFor = (row: UserRow) => [
    { label: 'View user details', icon: Eye, onSelect: () => onOpen(row) },
    { label: 'Edit user', icon: Pencil, onSelect: () => setDialog({ kind: 'edit', user: row }), hidden: !canManage },
    { label: 'View organization', icon: Building2, onSelect: () => undefined, href: row.business_id ? `/platform/businesses/${row.business_id}` : undefined, hidden: !row.business_id },
    { label: 'Change role', icon: UserCog, onSelect: () => setDialog({ kind: 'role', user: row }), hidden: !canManage || row.role === 'OWNER' || !row.business_id },
    { label: 'Unlock account', icon: Unlock, onSelect: () => setDialog({ kind: 'unlock', user: row }), hidden: !canManage || !isLocked(row) },
    { label: 'Send PIN reset', icon: KeyRound, onSelect: () => setDialog({ kind: 'send-pin-reset', user: row }), hidden: !canManage || !row.active || !row.email },
    { label: 'Revoke active sessions', icon: LogOut, onSelect: () => setDialog({ kind: 'force-signout', user: row }), hidden: !canManage || !row.active },
    { label: 'View user activity', icon: History, onSelect: () => onOpen(row) },
    { label: 'Activate account', icon: CircleCheck, onSelect: () => setDialog({ kind: 'reactivate', user: row }), hidden: !canManage || row.active },
    { label: 'Deactivate account', icon: UserX, tone: 'danger' as const, onSelect: () => setDialog({ kind: 'deactivate', user: row }), hidden: !canManage || !row.active },
  ];
  const dialogs = <UserDialogs dialog={dialog} onClose={() => setDialog(null)} />;
  return { actionsFor, dialogs, openAdd: (businessId?: string) => setDialog({ kind: 'add', businessId }), canManage };
}

const ACTION_COPY: Record<string, { title: string; label: string; description: string; tone?: 'danger' }> = {
  deactivate: { title: 'Deactivate account', label: 'Deactivate', description: 'They lose access right away and are signed out of every device, including sync. They get an email.', tone: 'danger' },
  reactivate: { title: 'Activate account', label: 'Activate', description: 'They can sign in again. They get an email.' },
  'force-signout': { title: 'Revoke active sessions', label: 'Revoke sessions', description: 'Ends their sessions on every device. They must sign in again.' },
  'send-pin-reset': { title: 'Send PIN reset', label: 'Send reset', description: 'They get a reset code by email. You never see the code or their PIN.' },
  unlock: { title: 'Unlock account', label: 'Unlock', description: 'Clears the lock caused by wrong PINs.' },
};

const INVALIDATE = ['platform-users', 'platform-user', 'platform-business', 'platform-org-users', 'platform-overview'];

function UserDialogs({ dialog, onClose }: { dialog: Dialog; onClose: () => void }) {
  if (!dialog) return null;
  if (dialog.kind === 'add') return <AddUserDialog businessId={dialog.businessId} onClose={onClose} />;
  if (dialog.kind === 'edit') return <EditUserDialog user={dialog.user} onClose={onClose} />;
  if (dialog.kind === 'role') return <ChangeRoleDialog user={dialog.user} onClose={onClose} />;
  const copy = ACTION_COPY[dialog.kind];
  const who = dialog.user.email ?? dialog.user.phone ?? dialog.user.name;
  return <ConfirmDialog title={`${copy.title}: ${who}`} description={copy.description} confirmLabel={copy.label} tone={copy.tone} onClose={onClose} invalidate={INVALIDATE} run={(reason) => platformApi.post(`/users/${dialog.user.id}/${dialog.kind}`, { reason })} />;
}

function ChangeRoleDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [role, setRole] = useState(user.role === 'MANAGER' ? 'CASHIER' : 'MANAGER');
  return (
    <ConfirmDialog title={`Change role for ${user.name}`} confirmLabel="Change role" onClose={onClose} invalidate={INVALIDATE}
      description={<>Current role: <strong>{humanize(user.role)}</strong>. The owner is told by email, and {user.name} is signed out so the new access applies. Owner roles cannot be changed here.</>}
      run={(reason) => platformApi.post(`/users/${user.id}/role`, { role, reason })}>
      <div>
        <label className={labelClass} htmlFor="new-role">New role</label>
        <Select id="new-role" value={role} onChange={setRole} searchable={false} options={ROLE_OPTIONS.filter((option) => !['all', 'OWNER', user.role].includes(option.value))} />
      </div>
    </ConfirmDialog>
  );
}

function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  return (
    <ConfirmDialog title={`Edit ${user.name}`} confirmLabel="Save changes" onClose={onClose} invalidate={INVALIDATE}
      description="Only contact details can be edited here. PINs are never visible. The owner is told."
      run={(reason) => platformApi.patch(`/users/${user.id}`, { name, email: email.trim() || null, phone: phone.trim() || null, reason })}>
      <div className="space-y-3">
        <div><label className={labelClass} htmlFor="edit-name">Full name</label><input id="edit-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} /></div>
        <div><label className={labelClass} htmlFor="edit-email">Email</label><input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} /></div>
        <div><label className={labelClass} htmlFor="edit-phone">Phone</label><input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} /></div>
      </div>
    </ConfirmDialog>
  );
}

function AddUserDialog({ businessId: initialBusiness, onClose }: { businessId?: string; onClose: () => void }) {
  const [form, setForm] = useState({ business_id: initialBusiness ?? '', name: '', email: '', phone: '', role: 'CASHIER', reason: '' });
  const [created, setCreated] = useState<{ name: string; pin: string } | null>(null);
  const refresh = useInvalidate();
  const mutation = useMutation({
    mutationFn: async () => (await platformApi.post<{ user: { name: string }; temporary_pin: string }>('/users', form)).data,
    onSuccess: async (data) => { await refresh(INVALIDATE); setCreated({ name: data.user.name, pin: data.temporary_pin }); },
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  if (created) {
    return (
      <Modal title="User added" onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p className="text-muted">Give <strong className="text-ink">{created.name}</strong> this one-time temporary PIN in person or by phone. They must choose their own PIN when they first sign in. It will not be shown again.</p>
          <div className="rounded-xl border border-brand/30 bg-brand-soft py-4 text-center text-3xl font-extrabold tracking-[0.4em] text-brand-dark">{created.pin}</div>
          <div className="flex justify-end"><AdminButton tone="primary" onClick={onClose}>Done</AdminButton></div>
        </div>
      </Modal>
    );
  }
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">Adds a team member to an organization. Owners can't be created here, and the organization owner is told.</p>
        <div><label className={labelClass} htmlFor="add-org">Organization</label><BusinessPicker id="add-org" value={form.business_id} onChange={set('business_id')} /></div>
        <div><label className={labelClass} htmlFor="add-name">Full name</label><input id="add-name" required minLength={2} value={form.name} onChange={(e) => set('name')(e.target.value)} className={fieldClass} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="add-email">Email</label><input id="add-email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} className={fieldClass} /></div>
          <div><label className={labelClass} htmlFor="add-phone">Phone</label><input id="add-phone" value={form.phone} onChange={(e) => set('phone')(e.target.value)} className={fieldClass} /></div>
        </div>
        <div><label className={labelClass} htmlFor="add-role">Role</label><Select id="add-role" value={form.role} onChange={set('role')} searchable={false} options={ROLE_OPTIONS.filter((option) => !['all', 'OWNER'].includes(option.value))} /></div>
        <div><label className={labelClass} htmlFor="add-reason">Reason <span className="font-normal text-muted">(saved in the audit log)</span></label><textarea id="add-reason" required minLength={5} rows={2} value={form.reason} onChange={(e) => set('reason')(e.target.value)} className={fieldClass} /></div>
        {mutation.isError ? <ErrorState error={mutation.error} compact /> : null}
        <div className="flex justify-end gap-2 pt-1">
          <AdminButton type="button" onClick={onClose}>Cancel</AdminButton>
          <AdminButton type="submit" tone="primary" disabled={mutation.isPending || !form.business_id}>{mutation.isPending ? 'Adding…' : 'Add user'}</AdminButton>
        </div>
      </form>
    </Modal>
  );
}

type UserDetail = {
  user: UserRow & { must_change_pin: boolean; updated_at: string };
  logins: { id: string; success: boolean; ip: string | null; user_agent: string | null; created_at: string }[];
  activity: { id: string; action: string; entity: string; created_at: string }[];
  admin_actions: { id: string; action: string; admin_email: string | null; reason: string | null; created_at: string }[];
  permissions: string[];
};

export function UserDetailsDrawer({ userId, onClose, actionsFor }: { userId: string; onClose: () => void; actionsFor?: (row: UserRow) => ReturnType<ReturnType<typeof useUserActions>['actionsFor']> }) {
  const query = useQuery({ queryKey: ['platform-user', userId], queryFn: async () => (await platformApi.get<UserDetail>(`/users/${userId}`)).data });
  const user = query.data?.user;
  return (
    <Drawer title={user?.name ?? 'User details'} subtitle={user ? (user.email ?? user.phone ?? undefined) : undefined} onClose={onClose}
      footer={user && actionsFor ? <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">PINs are never shown.</span><ActionMenu label={`Actions for ${user.name}`} actions={actionsFor(user).filter((action) => action.label !== 'View user details' && action.label !== 'View user activity')} /></div> : undefined}>
      {query.isPending ? <DrawerSkeleton /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : (
        <div className="space-y-7">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand">{initials(query.data.user.name)}</span>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold text-ink">{query.data.user.name}</div>
              <div className="text-xs text-muted">ID {shortId(query.data.user.id)}</div>
              <div className="mt-1"><StatusBadge status={userStatus(query.data.user)} /></div>
            </div>
          </div>
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Profile</h3>
            <DetailList items={[
              { label: 'Email', value: query.data.user.email ?? '—' },
              { label: 'Phone', value: query.data.user.phone ?? '—' },
              { label: 'Role', value: humanize(query.data.user.role) },
              { label: 'Must change PIN', value: query.data.user.must_change_pin ? 'Yes' : 'No' },
              { label: 'Created', value: formatDateTime(query.data.user.created_at) },
              { label: 'Last login', value: query.data.user.last_login_at ? `${formatDateTime(query.data.user.last_login_at)} (${timeAgo(query.data.user.last_login_at)})` : 'Never' },
              { label: 'Failed attempts', value: String(query.data.user.failed_login_attempts) },
              { label: 'Locked until', value: isLocked(query.data.user) ? formatDateTime(query.data.user.locked_until) : '—' },
            ]} />
          </section>
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Organization</h3>
            {query.data.user.business_id ? (
              <Link to={`/platform/businesses/${query.data.user.business_id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-slate-50">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Building2 size={18} /></span>
                <span><span className="block text-sm font-semibold text-ink">{query.data.user.business_name}</span><span className="block text-xs text-muted">{query.data.user.business_code}</span></span>
              </Link>
            ) : <p className="text-sm text-muted">Not linked to an organization yet.</p>}
          </section>
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Permissions</h3>
            {query.data.permissions.length ? <div className="flex flex-wrap gap-1.5">{query.data.permissions.map((permission) => <span key={permission} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink/80">{humanize(permission.replace(/([A-Z])/g, ' $1'))}</span>)}</div> : <p className="text-sm text-muted">No dashboard permissions.</p>}
          </section>
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Login history</h3>
            {query.data.logins.length === 0 ? <p className="text-sm text-muted">No sign-ins recorded yet. History starts from this release.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {query.data.logins.map((login) => (
                  <li key={login.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0"><span className="block font-medium text-ink">{formatDateTime(login.created_at)}</span><span className="block truncate text-xs text-muted">{login.ip ?? 'Unknown network'} · {login.user_agent ?? 'Unknown device'}</span></span>
                    <StatusBadge status={login.success ? 'success' : 'failed'} label={login.success ? 'Signed in' : 'Failed'} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Recent activity</h3>
            {query.data.activity.length + query.data.admin_actions.length === 0 ? <p className="text-sm text-muted">No recorded activity.</p> : (
              <ol className="relative space-y-3 border-l border-line pl-4">
                {[...query.data.admin_actions.map((row) => ({ id: row.id, at: row.created_at, title: humanize(row.action), detail: `By MIA (${row.admin_email ?? 'system'})${row.reason ? ` · ${row.reason}` : ''}` })),
                  ...query.data.activity.map((row) => ({ id: row.id, at: row.created_at, title: humanize(row.action), detail: humanize(row.entity) }))]
                  .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15).map((item) => (
                    <li key={item.id}>
                      <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand" />
                      <div className="text-sm font-semibold text-ink">{item.title}</div>
                      <div className="text-xs text-muted">{item.detail} · {timeAgo(item.at)}</div>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

export function userColumns(actionsFor: (row: UserRow) => ReturnType<ReturnType<typeof useUserActions>['actionsFor']>, onOpen: (row: UserRow) => void, canManage: boolean, options: { organization?: boolean } = {}): AdminColumn<UserRow>[] {
  return [
    { key: 'id', header: 'User ID', cell: (row) => <span className="font-mono text-xs text-muted">{shortId(row.id)}</span>, hideBelow: 'lg' },
    { key: 'name', header: 'Full name', sortKey: 'name', skeleton: { width: 'w-32', kind: 'avatar' }, cell: (row) => (
      <span className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-ink/80">{initials(row.name)}</span><span className="font-semibold text-ink">{row.name}</span></span>
    ) },
    { key: 'email', header: 'Email / username', sortKey: 'email', cell: (row) => <span className="text-ink/80">{row.email ?? row.phone ?? '—'}</span> },
    { key: 'role', header: 'Role', sortKey: 'role', cell: (row) => humanize(row.role) },
    ...(options.organization === false ? [] : [{ key: 'org', header: 'Organization', sortKey: 'business', hideBelow: 'md' as const, cell: (row: UserRow) => row.business_id ? <Link to={`/platform/businesses/${row.business_id}`} className="hover:underline">{row.business_name}</Link> : <span className="text-muted">—</span> }]),
    { key: 'status', header: 'Status', sortKey: 'status', skeleton: { width: 'w-16', kind: 'badge' }, cell: (row) => <StatusBadge status={userStatus(row)} /> },
    { key: 'last_login', header: 'Last login', sortKey: 'last_login', hideBelow: 'lg', cell: (row) => <span className="whitespace-nowrap text-ink/80" title={row.last_login_at ? formatDateTime(row.last_login_at) : undefined}>{timeAgo(row.last_login_at)}</span> },
    { key: 'created', header: 'Created at', sortKey: 'date', hideBelow: 'lg', cell: (row) => <span className="whitespace-nowrap text-ink/80">{formatDate(row.created_at)}</span> },
    { key: 'actions', header: 'Actions', align: 'right', skeleton: { width: 'w-16', kind: 'actions', align: 'right' }, cell: (row) => (
      <span className="inline-flex items-center gap-0.5">
        <IconAction label={`View ${row.name}`} icon={Eye} onClick={() => onOpen(row)} />
        {canManage ? <IconAction label={`Edit ${row.name}`} icon={Pencil} onClick={() => actionsFor(row).find((action) => action.label === 'Edit user')?.onSelect()} /> : null}
        <ActionMenu label={`More actions for ${row.name}`} actions={actionsFor(row).filter((action) => action.label !== 'View user details' && action.label !== 'Edit user')} />
      </span>
    ) },
  ];
}

export function UserMobileCard({ row, onOpen, actions }: { row: UserRow; onOpen: () => void; actions: ReturnType<ReturnType<typeof useUserActions>['actionsFor']> }) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">{initials(row.name)}</span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{row.name}</span>
          <span className="block truncate text-xs text-muted">{row.email ?? row.phone ?? '—'}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><StatusBadge status={userStatus(row)} />{humanize(row.role)}{row.business_name ? ` · ${row.business_name}` : ''}</span>
        </span>
      </button>
      <ActionMenu label={`Actions for ${row.name}`} actions={actions} />
    </div>
  );
}

export function UsersManagement() {
  const [params, setParams] = useSearchParams();
  const businessId = params.get('business_id') ?? '';
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const openUser = params.get('user');
  const setOpenUser = (id: string | null) => setParams((current) => { const next = new URLSearchParams(current); if (id) next.set('user', id); else next.delete('user'); return next; }, { replace: true });
  const list = useServerList<UserRow, UserSummary>({ key: 'platform-users', path: '/users', filters: { business_id: businessId || undefined, role, status }, defaultSort: { by: 'date', dir: 'desc' } });
  const { actionsFor, dialogs, openAdd, canManage } = useUserActions((row) => setOpenUser(row.id));
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data } = await platformApi.get<{ rows: UserRow[] }>('/users', { params: { business_id: businessId || undefined, role: role === 'all' ? undefined : role, status: status === 'all' ? undefined : status, q: list.search || undefined, limit: 200, sort_by: list.sort.by, sort: list.sort.dir } });
      downloadCsv('mia-users.csv', ['User ID', 'Name', 'Email', 'Phone', 'Role', 'Organization', 'Status', 'Last login', 'Created'], data.rows.map((row) => [row.id, row.name, row.email, row.phone, row.role, row.business_name, userStatus(row), row.last_login_at, row.created_at]));
    } finally {
      setExporting(false);
    }
  };

  if (list.query.isPending && !list.query.data) return <UsersManagementSkeleton />;
  const summary = list.query.data?.summary;
  const growth = summary && summary.total_30d_ago > 0 ? Math.round(((summary.total - summary.total_30d_ago) / summary.total_30d_ago) * 1000) / 10 : null;
  return (
    <>
      <AdminPageHeader icon={Users} title="Users Management" subtitle="Manage all users across organizations." refreshing={list.query.isFetching && !list.query.isPending}
        actions={<>{summary ? <Chip tone="green">Total users: {formatNumber(summary.total)}</Chip> : null}{canManage ? <AdminButton tone="primary" icon={UserPlus} onClick={() => openAdd(businessId || undefined)}>Add user</AdminButton> : null}</>} />
      {summary ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Users} tone="blue" label="Total users" value={formatNumber(summary.total)} growth={growth} growthLabel="vs 30 days ago" hint={`${formatNumber(summary.new_30d)} joined in 30 days`} />
          <KpiCard icon={CircleCheck} tone="green" label="Active users" value={formatNumber(summary.active)} hint={summary.locked ? `${formatNumber(summary.locked)} locked right now` : 'Can sign in'} />
          <KpiCard icon={UserMinus} tone="violet" label="Inactive users" value={formatNumber(summary.inactive)} hint="Deactivated accounts" />
          <KpiCard icon={ShieldCheck} tone="amber" label="Platform admins" value={formatNumber(summary.platform_admins)} hint={`${formatNumber(summary.super_admins)} super admin${summary.super_admins === 1 ? '' : 's'}`} />
        </div>
      ) : list.query.isError ? null : <div className="mb-6"><KpiGridSkeleton /></div>}
      <Panel bodyClass="">
        <TableToolbar actions={<AdminButton icon={Download} onClick={exportCsv} disabled={exporting || !list.query.data?.total}>{exporting ? 'Exporting…' : 'Export'}</AdminButton>}>
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search users by name, email or ID…" />
          <BusinessPicker value={businessId} onChange={(value) => { setParams((current) => { const next = new URLSearchParams(current); if (value) next.set('business_id', value); else next.delete('business_id'); return next; }, { replace: true }); }} allowAll className="w-full sm:w-52" />
          <FilterSelect label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'locked', label: 'Locked' }]} />
        </TableToolbar>
        <AdminTable<UserRow>
          {...list.tableProps}
          columns={userColumns(actionsFor, (row) => setOpenUser(row.id), canManage)}
          rowKey={(row) => row.id}
          noun="users"
          onRowClick={(row) => setOpenUser(row.id)}
          mobileCard={(row) => <UserMobileCard row={row} onOpen={() => setOpenUser(row.id)} actions={actionsFor(row)} />}
          empty={<EmptyState icon={Users} title={list.search || businessId || role !== 'all' || status !== 'all' ? 'No users match these filters' : 'No users yet'}>{list.search ? 'Try a different name, email or ID.' : undefined}</EmptyState>}
        />
      </Panel>
      {openUser ? <UserDetailsDrawer userId={openUser} onClose={() => setOpenUser(null)} actionsFor={actionsFor} /> : null}
      {dialogs}
    </>
  );
}
