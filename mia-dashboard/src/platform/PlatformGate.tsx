import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import {
  BarChart3, Bell, Building2, CreditCard, Database, FileText, Headset, History, KeyRound, LayoutDashboard, Megaphone, RefreshCw, ScrollText, Send, ShieldAlert, ShieldCheck, Users,
} from 'lucide-react';
import { getErrorMessage } from '../lib/format';
import { platformApi, setPlatformToken, signOutPlatform, usePlatformToken, type PlatformAdmin } from '../lib/platformAuth';
import { Button, ErrorNotice } from '../ui/kit';
import PlatformLogin, { PasswordField, PlatformFrame } from './PlatformLogin';
import { AdminContext, useAdmin, useCan } from './context';
import { PlatformShell, type PlatformNavGroup, type PlatformNavItem } from './ui/layout';
import { Modal } from './ui/admin';
import { PlatformOverview, PlatformOverviewSkeleton } from './overview';
import { BusinessesManagement } from './businesses';
import { UsersManagement } from './users';
import { SubscriptionsManagement } from './subscriptions';
import { OrganizationDetails } from './organization';
import { AuditLogPage } from './audit';
import { SupportAccessPage } from './support';
import { NotificationsPage } from './notifications';
import { AnnouncementsPage, ComposeEmail, DeliveryAnalytics, EmailHistory, EmailTemplates } from './comms';
import { Alerts, SyncHealth } from './insights';
import { PinHelpRequests } from './pinHelp';
import { Admins, DataRecords } from './operations';
import { PageHeaderSkeleton } from './ui/skeleton';

export { useAdmin, useCan };

const NAV: (PlatformNavItem & { group: string; permission: string })[] = [
  { group: 'Overview', to: '/platform', label: 'Dashboard', icon: LayoutDashboard, permission: 'metrics:read', end: true },
  { group: 'Overview', to: '/platform/businesses', label: 'Businesses', icon: Building2, permission: 'businesses:read' },
  { group: 'Overview', to: '/platform/users', label: 'User management', icon: Users, permission: 'users:read' },
  { group: 'Overview', to: '/platform/billing', label: 'Subscriptions & plans', icon: CreditCard, permission: 'billing:read' },
  { group: 'Overview', to: '/platform/pin-help', label: 'PIN assistance', icon: KeyRound, permission: 'users:read' },
  { group: 'Operations', to: '/platform/support', label: 'Support access', icon: Headset, permission: 'support:access' },
  { group: 'Operations', to: '/platform/sync', label: 'Sync monitoring', icon: RefreshCw, permission: 'sync:read' },
  { group: 'Operations', to: '/platform/alerts', label: 'Alerts & incidents', icon: ShieldAlert, permission: 'alerts:read', badge: 'alerts' },
  { group: 'Operations', to: '/platform/data', label: 'Data & backups', icon: Database, permission: 'data:manage' },
  { group: 'Communications', to: '/platform/comms/compose', label: 'Compose email', icon: Send, permission: 'communications:manage' },
  { group: 'Communications', to: '/platform/announcements', label: 'Announcements', icon: Megaphone, permission: 'announcements:manage' },
  { group: 'Communications', to: '/platform/comms/templates', label: 'Email templates', icon: FileText, permission: 'communications:manage' },
  { group: 'Communications', to: '/platform/comms/history', label: 'Email history', icon: History, permission: 'communications:manage' },
  { group: 'Communications', to: '/platform/comms/analytics', label: 'Delivery analytics', icon: BarChart3, permission: 'communications:manage' },
  { group: 'Administration', to: '/platform/notifications', label: 'Notifications', icon: Bell, permission: '' },
  { group: 'Administration', to: '/platform/audit', label: 'Audit logs', icon: ScrollText, permission: 'audit:read' },
  { group: 'Administration', to: '/platform/admins', label: 'Platform administrators', icon: ShieldCheck, permission: 'admins:manage' },
];

const GROUPS = ['Overview', 'Operations', 'Communications', 'Administration'];

function Guard({ permission }: { permission: string }) {
  return useCan(permission) ? <Outlet /> : <Navigate to="/platform" replace />;
}

function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const client = useQueryClient();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: async () => (await platformApi.post<{ token: string }>('/auth/change-password', { current, password })).data,
    onSuccess: async (data) => {
      setPlatformToken(data.token);
      await client.invalidateQueries({ queryKey: ['platform-me'] });
      onDone?.();
    },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-4">
      {mutation.isError ? <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{getErrorMessage(mutation.error, 'Could not change your password.')}</div> : null}
      <PasswordField id="current-password" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
      <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
      <p className="text-xs text-slate-500">At least 12 characters with upper and lower case letters and a number. Other sessions are signed out.</p>
      <Button type="submit" tone="primary" disabled={mutation.isPending} className="w-full !bg-[#159b69] hover:!bg-[#0f7d54]">{mutation.isPending ? 'Saving…' : 'Save password'}</Button>
    </form>
  );
}

function ForcedPasswordChange({ admin }: { admin: PlatformAdmin }) {
  return (
    <PlatformFrame title="Choose a new password" subtitle={`${admin.email} is using a temporary password.`}>
      <ChangePasswordForm />
      <button type="button" onClick={signOutPlatform} className="text-sm font-medium text-slate-600 hover:underline">Sign out</button>
    </PlatformFrame>
  );
}

function Home() {
  const admin = useAdmin();
  if (admin.permissions.includes('metrics:read')) return <PlatformOverview />;
  return <Navigate to="/platform/businesses" replace />;
}

function PlatformApp({ token }: { token: string }) {
  const [changingPassword, setChangingPassword] = useState(false);
  const me = useQuery({
    queryKey: ['platform-me', token],
    queryFn: async () => (await platformApi.get<{ admin: PlatformAdmin }>('/auth/me')).data.admin,
  });

  if (me.isPending) {
    return (
      <div className="min-h-screen bg-canvas lg:pl-[260px]">
        <div aria-hidden="true" className="fixed inset-y-0 left-0 hidden w-[260px] bg-navy lg:block" />
        <div className="h-[68px] border-b border-line bg-white" />
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><PageHeaderSkeleton /><PlatformOverviewSkeleton /></div>
      </div>
    );
  }
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
  if (admin.must_change_password) return <ForcedPasswordChange admin={admin} />;

  const items = NAV.filter((item) => !item.permission || admin.permissions.includes(item.permission));
  const groups: PlatformNavGroup[] = GROUPS.map((label) => ({ label, items: items.filter((item) => item.group === label) })).filter((group) => group.items.length > 0);

  return (
    <AdminContext.Provider value={admin}>
      <Routes>
        <Route element={<PlatformShell groups={groups} onChangePassword={() => setChangingPassword(true)} />}>
          <Route index element={<Home />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route element={<Guard permission="businesses:read" />}>
            <Route path="businesses" element={<BusinessesManagement />} />
            <Route path="businesses/:id" element={<OrganizationDetails />} />
            <Route path="businesses/:id/:tab" element={<OrganizationDetails />} />
          </Route>
          <Route element={<Guard permission="users:read" />}><Route path="users" element={<UsersManagement />} /><Route path="pin-help" element={<PinHelpRequests />} /></Route>
          <Route element={<Guard permission="billing:read" />}><Route path="billing" element={<SubscriptionsManagement />} /></Route>
          <Route element={<Guard permission="support:access" />}><Route path="support" element={<SupportAccessPage />} /></Route>
          <Route element={<Guard permission="sync:read" />}><Route path="sync" element={<SyncHealth />} /></Route>
          <Route element={<Guard permission="alerts:read" />}><Route path="alerts" element={<Alerts />} /></Route>
          <Route element={<Guard permission="data:manage" />}><Route path="data" element={<DataRecords />} /></Route>
          <Route element={<Guard permission="announcements:manage" />}><Route path="announcements" element={<AnnouncementsPage />} /></Route>
          <Route element={<Guard permission="communications:manage" />}>
            <Route path="comms/compose" element={<ComposeEmail />} />
            <Route path="comms/templates" element={<EmailTemplates />} />
            <Route path="comms/history" element={<EmailHistory />} />
            <Route path="comms/analytics" element={<DeliveryAnalytics />} />
          </Route>
          <Route element={<Guard permission="audit:read" />}><Route path="audit" element={<AuditLogPage />} /></Route>
          <Route element={<Guard permission="admins:manage" />}><Route path="admins" element={<Admins />} /></Route>
          <Route path="*" element={<Navigate to="/platform" replace />} />
        </Route>
      </Routes>
      {changingPassword ? <Modal title="Change password" onClose={() => setChangingPassword(false)}><ChangePasswordForm onDone={() => setChangingPassword(false)} /></Modal> : null}
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

