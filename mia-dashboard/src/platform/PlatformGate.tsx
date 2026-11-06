import { createContext, useContext, useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Activity, BellRing, Building2, CreditCard, Database, Headset, LayoutDashboard, ScrollText, ShieldAlert, UserCog, Users } from 'lucide-react';
import { getErrorMessage } from '../lib/format';
import { platformApi, setPlatformToken, signOutPlatform, usePlatformToken, type PlatformAdmin } from '../lib/platformAuth';
import { Shell, type NavGroup } from '../ui/Shell';
import { Button, ErrorNotice, Skeleton } from '../ui/kit';
import PlatformLogin, { PasswordField, PlatformFrame } from './PlatformLogin';
import { PlatformOverview, SyncHealth, Alerts } from './insights';
import { BusinessDetail, Businesses, PlatformUsers } from './accounts';
import { Billing } from './billing';
import { Admins, Announcements, AuditLog, DataRecords, SupportAccess } from './operations';

const AdminContext = createContext<PlatformAdmin | null>(null);

export function useAdmin() {
  return useContext(AdminContext) as PlatformAdmin;
}

export function useCan(permission: string) {
  return useAdmin().permissions.includes(permission);
}

const NAV: (NavGroup['items'][number] & { group: string; permission: string })[] = [
  { group: 'Platform', to: '/platform', label: 'Overview', icon: LayoutDashboard, permission: 'metrics:read', end: true },
  { group: 'Platform', to: '/platform/businesses', label: 'Businesses', icon: Building2, permission: 'businesses:read' },
  { group: 'Platform', to: '/platform/users', label: 'User accounts', icon: Users, permission: 'users:read' },
  { group: 'Platform', to: '/platform/billing', label: 'Subscriptions', icon: CreditCard, permission: 'billing:read' },
  { group: 'Operations', to: '/platform/support', label: 'Support access', icon: Headset, permission: 'support:access' },
  { group: 'Operations', to: '/platform/sync', label: 'Sync health', icon: Activity, permission: 'sync:read' },
  { group: 'Operations', to: '/platform/alerts', label: 'Alerts', icon: ShieldAlert, permission: 'alerts:read' },
  { group: 'Operations', to: '/platform/data', label: 'Data & backups', icon: Database, permission: 'data:manage' },
  { group: 'Operations', to: '/platform/announcements', label: 'Announcements', icon: BellRing, permission: 'announcements:manage' },
  { group: 'Governance', to: '/platform/audit', label: 'Audit log', icon: ScrollText, permission: 'audit:read' },
  { group: 'Governance', to: '/platform/admins', label: 'Platform admins', icon: UserCog, permission: 'admins:manage' },
];

const ROLE_LABELS = { SUPER_ADMIN: 'Super admin', SUPPORT: 'Support', FINANCE: 'Finance' };

function Guard({ permission }: { permission: string }) {
  return useCan(permission) ? <Outlet /> : <Navigate to="/platform" replace />;
}

function ChangePassword({ admin }: { admin: PlatformAdmin }) {
  const client = useQueryClient();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await platformApi.post('/auth/change-password', { current, password });
      setPlatformToken(data.token);
      await client.invalidateQueries({ queryKey: ['platform-me'] });
    } catch (problem) {
      setError(getErrorMessage(problem, 'Could not change your password.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformFrame title="Choose a new password" subtitle={`${admin.email} is using a temporary password. Use at least 12 characters with upper and lower case letters and a number.`}>
      <form onSubmit={submit} className="space-y-4">
        {error ? <div role="alert" className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2.5 text-sm text-rose-700">{error}</div> : null}
        <PasswordField id="current-password" label="Temporary password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
        <Button type="submit" tone="primary" disabled={busy} className="w-full !bg-slate-900 hover:!bg-slate-800">{busy ? 'Saving…' : 'Save password'}</Button>
        <button type="button" onClick={signOutPlatform} className="text-sm font-medium text-slate-600 hover:underline">Sign out</button>
      </form>
    </PlatformFrame>
  );
}

function Home() {
  const admin = useAdmin();
  if (admin.permissions.includes('metrics:read')) return <PlatformOverview />;
  return <Navigate to="/platform/businesses" replace />;
}

function PlatformApp({ token }: { token: string }) {
  const me = useQuery({
    queryKey: ['platform-me', token],
    queryFn: async () => (await platformApi.get<{ admin: PlatformAdmin }>('/auth/me')).data.admin,
  });

  if (me.isLoading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (me.isError || !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md space-y-3">
          <ErrorNotice error={me.error} onRetry={() => me.refetch()} />
          <Button onClick={signOutPlatform}>Sign out</Button>
        </div>
      </div>
    );
  }
  const admin = me.data;
  if (admin.must_change_password) return <ChangePassword admin={admin} />;

  const items = NAV.filter((item) => admin.permissions.includes(item.permission));
  const groups: NavGroup[] = ['Platform', 'Operations', 'Governance']
    .map((label) => ({ label, items: items.filter((item) => item.group === label) }))
    .filter((group) => group.items.length > 0);

  return (
    <AdminContext.Provider value={admin}>
      <Routes>
        <Route element={(
          <Shell
            brand="MIA Platform"
            brandSub="Staff only"
            groups={groups}
            userName={admin.name}
            userSub={ROLE_LABELS[admin.role]}
            onSignOut={signOutPlatform}
            sidebarClass="bg-slate-900 text-slate-100"
            activeClass="bg-white/15 text-white"
            inactiveClass="text-slate-300 hover:bg-white/5 hover:text-white"
          />
        )}>
          <Route index element={<Home />} />
          <Route element={<Guard permission="businesses:read" />}>
            <Route path="businesses" element={<Businesses />} />
            <Route path="businesses/:id" element={<BusinessDetail />} />
          </Route>
          <Route element={<Guard permission="users:read" />}><Route path="users" element={<PlatformUsers />} /></Route>
          <Route element={<Guard permission="billing:read" />}><Route path="billing" element={<Billing />} /></Route>
          <Route element={<Guard permission="support:access" />}><Route path="support" element={<SupportAccess />} /></Route>
          <Route element={<Guard permission="sync:read" />}><Route path="sync" element={<SyncHealth />} /></Route>
          <Route element={<Guard permission="alerts:read" />}><Route path="alerts" element={<Alerts />} /></Route>
          <Route element={<Guard permission="data:manage" />}><Route path="data" element={<DataRecords />} /></Route>
          <Route element={<Guard permission="announcements:manage" />}><Route path="announcements" element={<Announcements />} /></Route>
          <Route element={<Guard permission="audit:read" />}><Route path="audit" element={<AuditLog />} /></Route>
          <Route element={<Guard permission="admins:manage" />}><Route path="admins" element={<Admins />} /></Route>
          <Route path="*" element={<Navigate to="/platform" replace />} />
        </Route>
      </Routes>
    </AdminContext.Provider>
  );
}

export default function PlatformGate() {
  const token = usePlatformToken();
  const client = useQueryClient();
  useEffect(() => {
    document.title = 'MIA Platform';
    return () => {
      document.title = 'MIA Dashboard';
    };
  }, []);
  useEffect(() => {
    if (!token) client.clear();
  }, [token, client]);
  return token ? <PlatformApp token={token} /> : <PlatformLogin />;
}
