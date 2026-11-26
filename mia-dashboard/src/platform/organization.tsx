import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity, BarChart3, Building2, CalendarDays, CircleCheck, Code, CreditCard, Database, Eye, FileText, Headset, Lightbulb, Lock, Mail, MapPin, Package, PauseCircle,
  Receipt, RefreshCw, ScrollText, Settings, ShoppingCart, Smartphone, TriangleAlert, UserPlus, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { formatDate, formatDateTime, formatMoney, formatNumber, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { CurveChart, DonutChart } from '../ui/charts';
import {
  ActionMenu, AdminButton, AdminTable, Boundary, ConfirmDialog, DetailList, EmptyState, ErrorState, FilterSelect, KpiCard, Panel, RangeSelect, SearchInput, StatusBadge, TableToolbar, Tabs,
  adminCard, fieldClass, labelClass, timeAgo,
} from './ui/admin';
import { useBreadcrumbs } from './ui/layout';
import { Bone, KpiGridSkeleton, LoadingRegion, PanelSkeleton, SkeletonAvatar, SkeletonButton, SkeletonChart, SkeletonDonut, SkeletonList, SkeletonTable } from './ui/skeleton';
import { useServerList } from './ui/useServerList';
import { RecentActivity } from './widgets';
import { useBusinessActions, BusinessAvatar } from './businesses';
import { GRACE_DAYS, PaymentHistory, SubscriptionHistory, SubscriptionManagementDialog, subscriptionActionsFor, useSubscriptionDetail, type SubscriptionAction } from './subscriptions';
import { UserDetailsDrawer, UserMobileCard, userColumns, useUserActions, type UserRow } from './users';
import { AuditLogTable } from './audit';
import { SupportAccessDialog, SupportBanner, useMyActiveGrant, type Grant } from './support';
import { BusinessPicker, ROLE_OPTIONS, shortId } from './shared';
import { useCan } from './context';
import { bucketLabel } from './overview';

type Tab = 'overview' | 'users' | 'activity' | 'subscriptions' | 'settings' | 'audit';
const TABS: { value: Tab; label: string; icon: LucideIcon; permission?: string }[] = [
  { value: 'overview', label: 'Overview', icon: BarChart3 },
  { value: 'users', label: 'Users', icon: Users, permission: 'users:read' },
  { value: 'activity', label: 'Sales & Activity', icon: ShoppingCart },
  { value: 'subscriptions', label: 'Subscriptions', icon: CreditCard, permission: 'billing:read' },
  { value: 'settings', label: 'Settings', icon: Settings },
  { value: 'audit', label: 'Audit Logs', icon: ScrollText, permission: 'audit:read' },
];

type OrgDetail = {
  business: { id: string; name: string; business_code: string; currency: string; country: string; timezone: string; created_at: string; description: string | null; address: string | null; contact_email: string | null; contact_phone: string | null; logo_url: string | null };
  owner: { id: string; name: string; email: string | null; phone: string | null } | null;
  org_status: 'active' | 'suspended' | 'trial' | 'expired';
  state: { status: string; suspended_reason: string | null; suspended_at: string | null; plan: string; subscription_status: string };
  subscription: { plan: string; plan_name: string | null; status: string; stored_status: string; billing_period: string | null; amount: number | null; started_at: string | null; ends_at: string | null; grace_ends_at: string | null; days_remaining: number | null; grace_days_remaining: number | null; open_balance: number };
  flags: Record<string, boolean>;
  flag_definitions: Record<string, { label: string; description: string }>;
  counts: Record<string, number>;
};

type Stats = {
  range: string; bucket: string; currency: string; history_complete: boolean;
  kpis: Record<string, number> & { sales_growth: number | null; count_growth: number | null; month_growth: number | null };
  roles: { role: string; count: number; active: number }[];
  trend: { day: string; total: number; count: number }[];
  sync: { last_received_at: string | null; devices_30d: number; records_24h: number; pending: null; failed: null; app_version: null };
};

type StatsRange = '7d' | '30d' | '90d' | '12m';
const STATS_RANGES: { value: StatsRange; label: string }[] = [{ value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }, { value: '12m', label: 'Last 12 months' }];

function useOrg(id: string) {
  return useQuery({ queryKey: ['platform-business', id], queryFn: async () => (await platformApi.get<OrgDetail>(`/businesses/${id}`)).data });
}

function useStats(id: string, range: StatsRange, granularity?: string) {
  return useQuery({
    queryKey: ['platform-business-stats', id, range, granularity ?? 'auto'],
    queryFn: async () => (await platformApi.get<Stats>(`/businesses/${id}/stats`, { params: { range, granularity } })).data,
    placeholderData: keepPreviousData,
  });
}

export function OrganizationDetailsSkeleton() {
  return (
    <LoadingRegion label="Loading organization" className="space-y-6">
      <div className={`${adminCard} grid gap-6 p-6 lg:grid-cols-[1fr_240px]`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <SkeletonAvatar size="h-24 w-24" rounded="rounded-2xl" />
          <div className="flex-1 space-y-3"><Bone className="h-7 w-64" /><Bone className="h-4 w-80 max-w-full" /><div className="flex flex-wrap gap-4">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-4 w-32" />)}</div></div>
        </div>
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <SkeletonButton key={i} className="w-full" />)}</div>
      </div>
      <div className="flex gap-6 border-b border-line pb-3">{TABS.map((tab) => <Bone key={tab.value} className="h-4 w-20" />)}</div>
      <KpiGridSkeleton />
      <div className="grid gap-6 xl:grid-cols-3">
        <PanelSkeleton className="xl:col-span-1"><SkeletonChart height={200} title={false} /></PanelSkeleton>
        <PanelSkeleton><SkeletonDonut /></PanelSkeleton>
        <PanelSkeleton><div className="flex flex-col items-center gap-3"><Bone className="h-28 w-28 rounded-full" /><Bone className="h-4 w-24" /><Bone className="h-7 w-24 rounded-full" /></div></PanelSkeleton>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">{[0, 1, 2].map((i) => <PanelSkeleton key={i}><SkeletonList rows={3} /></PanelSkeleton>)}</div>
    </LoadingRegion>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: LucideIcon; label?: string; value: React.ReactNode }) {
  return <span className="flex min-w-0 items-center gap-2 text-sm text-ink/80"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-muted"><Icon size={15} /></span><span className="min-w-0">{label ? <span className="block text-[11px] text-muted">{label}</span> : null}<span className="block truncate font-medium text-ink">{value}</span></span></span>;
}

function OrganizationHeader({ org, onTab, onSupport }: { org: OrgDetail; onTab: (tab: Tab) => void; onSupport: () => void }) {
  const canBilling = useCan('billing:read');
  const canUsers = useCan('users:read');
  const canSupport = useCan('support:access');
  const canSuspend = useCan('businesses:suspend');
  const { actionsFor, dialog } = useBusinessActions();
  const b = org.business;
  return (
    <section className={`${adminCard} grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto]`}>
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
        {b.logo_url ? <img src={b.logo_url} alt={`${b.name} logo`} className="h-24 w-24 shrink-0 rounded-2xl border border-line bg-white object-contain p-2" /> : <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-sky-50 text-3xl font-extrabold text-brand">{b.name.slice(0, 2).toUpperCase()}</span>}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">{b.name}</h1><StatusBadge status={org.org_status} /></div>
            <p className="mt-0.5 text-sm text-muted">{b.description ?? 'No business description yet.'}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoItem icon={FileText} label="Organization ID" value={<span className="font-mono">{b.business_code}</span>} />
            <InfoItem icon={CalendarDays} label="Registered" value={formatDate(b.created_at)} />
            <InfoItem icon={MapPin} label="Address" value={b.address ?? b.country} />
            <InfoItem icon={Mail} label="Contact" value={b.contact_email ?? org.owner?.email ?? b.contact_phone ?? org.owner?.phone ?? '—'} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 lg:w-56 lg:border-l lg:border-line lg:pl-6">
        <div className="text-sm font-bold text-ink">Quick actions</div>
        <AdminButton className="justify-start" icon={Eye} onClick={() => onTab('overview')}>View organization</AdminButton>
        {canBilling ? <AdminButton className="justify-start" icon={CreditCard} onClick={() => onTab('subscriptions')}>Manage subscription</AdminButton> : null}
        {canUsers ? <AdminButton className="justify-start" icon={Users} onClick={() => onTab('users')}>View users</AdminButton> : null}
        <AdminButton className="justify-start" icon={Activity} onClick={() => onTab('activity')}>View activity</AdminButton>
        <div className="flex gap-2">
          {canSupport ? <AdminButton className="flex-1" tone="primary" icon={Headset} onClick={onSupport}>Support access</AdminButton> : null}
          {canSuspend ? <ActionMenu label="More organization actions" actions={actionsFor({ id: b.id, name: b.name, status: org.state.status }).filter((action) => action.label.includes('Suspend') || action.label.includes('Reactivate'))} /> : null}
        </div>
      </div>
      {dialog}
    </section>
  );
}

function SubscriptionStatusCard({ org }: { org: OrgDetail }) {
  const s = org.subscription;
  const total = s.billing_period === 'yearly' ? 365 : s.stored_status === 'trial' ? 30 : 31;
  const remaining = s.days_remaining === null ? null : Math.max(0, s.days_remaining);
  const pct = remaining === null ? 100 : Math.min(100, Math.round((remaining / total) * 100));
  const color = ['expired', 'suspended', 'cancelled'].includes(s.status) ? '#ef4444' : s.status === 'grace' ? '#f97316' : s.status === 'expiring_soon' ? '#f59e0b' : '#159b69';
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <Panel title="Subscription status" icon={CreditCard}>
      <div className="flex flex-col items-center gap-3 text-center">
        <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={remaining === null ? 'No end date' : `${remaining} days remaining`}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="#eef2f6" strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
          <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="800" fill="#14213d">{remaining === null ? '∞' : remaining}</text>
          <text x="60" y="76" textAnchor="middle" fontSize="11" fill="#64748b">{remaining === null ? 'no end date' : 'days left'}</text>
        </svg>
        <StatusBadge status={s.status} />
        <span className="rounded-full bg-brand-soft px-4 py-1.5 text-sm font-bold text-brand-dark">{s.plan_name ?? humanize(s.plan)}</span>
        <div className="w-full space-y-1 text-left text-xs text-muted">
          <div className="flex justify-between"><span>Started</span><span className="font-medium text-ink">{formatDate(s.started_at)}</span></div>
          <div className="flex justify-between"><span>Expires</span><span className="font-medium text-ink">{formatDate(s.ends_at)}</span></div>
          <div className="flex justify-between"><span>Grace period</span><span className="font-medium text-ink">{s.status === 'grace' ? `${s.grace_days_remaining} days left` : s.grace_ends_at ? `until ${formatDate(s.grace_ends_at)}` : `${GRACE_DAYS} days`}</span></div>
          {s.open_balance ? <div className="flex justify-between"><span>Unpaid</span><span className="font-medium text-amber-700">{formatMoney(s.open_balance, org.business.currency)}</span></div> : null}
        </div>
      </div>
    </Panel>
  );
}

function OrganizationHealthCard({ stats }: { stats: Stats | undefined }) {
  const stale = stats?.sync.last_received_at ? Date.now() - new Date(stats.sync.last_received_at).getTime() > 14 * 86_400_000 : true;
  return (
    <Panel title="System health" icon={Database}>
      {!stats ? <SkeletonList rows={3} /> : (
        <ul className="space-y-3 text-sm">
          <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-ink"><Database size={16} className="text-muted" />Database</span><StatusBadge status="operational" label="Connected" /></li>
          <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-ink"><RefreshCw size={16} className="text-muted" />Last sync received</span><span className={`text-xs font-semibold ${stale ? 'text-amber-700' : 'text-emerald-700'}`}>{stats.sync.last_received_at ? timeAgo(stats.sync.last_received_at) : 'Never'}</span></li>
          <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-ink"><Smartphone size={16} className="text-muted" />Devices (30 days)</span><span className="font-semibold text-ink">{formatNumber(stats.sync.devices_30d)}</span></li>
          <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-ink"><Activity size={16} className="text-muted" />Records in 24 hours</span><span className="font-semibold text-ink">{formatNumber(stats.sync.records_24h)}</span></li>
          <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-ink"><Code size={16} className="text-muted" />Pending / failed sync, app version</span><span className="text-xs text-muted">Kept on the phone</span></li>
        </ul>
      )}
    </Panel>
  );
}

function OrganizationInsights({ org, stats }: { org: OrgDetail; stats: Stats | undefined }) {
  if (!stats) return <PanelSkeleton><SkeletonList rows={3} /></PanelSkeleton>;
  const insights: { tone: 'good' | 'warn'; text: string }[] = [];
  insights.push({ tone: 'good', text: `${formatNumber(stats.kpis.active_users)} of ${formatNumber(stats.kpis.users)} users are active; ${formatNumber(stats.kpis.signed_in_30d)} signed in during the last 30 days.` });
  if (stats.kpis.sales_growth !== null) insights.push({ tone: stats.kpis.sales_growth >= 0 ? 'good' : 'warn', text: `Sales are ${stats.kpis.sales_growth >= 0 ? 'up' : 'down'} ${Math.abs(stats.kpis.sales_growth)}% compared with the previous period.` });
  else insights.push({ tone: 'good', text: 'Not enough sales history yet to compare periods.' });
  if (['grace', 'expired', 'expiring_soon', 'pending_payment', 'suspended'].includes(org.subscription.status)) insights.push({ tone: 'warn', text: `Subscription needs attention: ${humanize(org.subscription.status).toLowerCase()}.` });
  else insights.push({ tone: 'good', text: org.subscription.plan === 'free' ? 'On the Free plan.' : 'Subscription is active and up to date.' });
  if (stats.kpis.low_stock) insights.push({ tone: 'warn', text: `${formatNumber(stats.kpis.low_stock)} products are at or below their reorder level.` });
  if (stats.kpis.unpaid_count) insights.push({ tone: 'warn', text: `${formatNumber(stats.kpis.unpaid_count)} unpaid customer sales (${formatMoney(stats.kpis.unpaid_total, stats.currency)}).` });
  return (
    <Panel title="Organization insights" icon={Lightbulb} className="bg-sky-50/40">
      <ul className="space-y-2.5">{insights.map((item) => <li key={item.text} className="flex items-start gap-2 text-sm text-ink/90">{item.tone === 'good' ? <CircleCheck size={17} className="mt-0.5 shrink-0 text-emerald-600" /> : <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />}{item.text}</li>)}</ul>
    </Panel>
  );
}

function OverviewTab({ org }: { org: OrgDetail }) {
  const [range, setRange] = useState<StatsRange>('30d');
  const [granularity, setGranularity] = useState('auto');
  const stats = useStats(org.business.id, range, granularity === 'auto' ? undefined : granularity);
  const money = (value: number) => formatMoney(value, org.business.currency);
  const s = stats.data;
  return (
    <div className="space-y-6">
      {stats.isPending ? <KpiGridSkeleton /> : stats.isError ? <ErrorState error={stats.error} onRetry={() => stats.refetch()} compact /> : s ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard soft icon={Users} tone="green" label="Total users" value={formatNumber(s.kpis.users)} hint={`${formatNumber(s.kpis.active_users)} active`} />
          <KpiCard soft icon={ShoppingCart} tone="blue" label="Sales this month" value={formatNumber(s.kpis.sales_month_count)} growth={s.kpis.month_growth} growthLabel="vs last month" hint={money(s.kpis.sales_month_total)} spark={s.trend.map((row) => row.count)} />
          <KpiCard soft icon={Wallet} tone="violet" label="Sales volume" value={money(s.kpis.range_total)} growth={s.kpis.sales_growth} growthLabel="vs previous period" hint={STATS_RANGES.find((item) => item.value === range)?.label} spark={s.trend.map((row) => row.total)} />
          <KpiCard soft icon={Receipt} tone="amber" label="Transactions" value={formatNumber(s.kpis.transactions)} hint={`${formatNumber(s.kpis.range_count)} in this period · all-time count`} />
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr_0.8fr]">
        <Panel title="Sales trend" icon={BarChart3} action={<div className="flex flex-wrap gap-2"><FilterSelect label="Group by" value={granularity} onChange={setGranularity} className="w-32" options={[{ value: 'auto', label: 'Auto' }, { value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} /><RangeSelect value={range} onChange={setRange} options={STATS_RANGES} /></div>}>
          {stats.isPending ? <SkeletonChart title={false} height={220} /> : s ? (
            <div className={stats.isFetching ? 'opacity-60' : ''}>
              <CurveChart name="Sales" format={money} labels={s.trend.map((row) => bucketLabel(row.day, s.bucket))} series={[{ name: 'Sales', color: '#159b69', values: s.trend.map((row) => row.total) }]} />
              <p className="mt-1 text-xs text-muted">{formatNumber(s.kpis.range_count)} sales totalling {money(s.kpis.range_total)} in this period.</p>
            </div>
          ) : null}
        </Panel>
        <Panel title="Users by role" icon={Users}>
          {stats.isPending ? <SkeletonDonut /> : s ? <DonutChart centerLabel="Users" format={formatNumber} empty="No users yet." items={s.roles.map((row) => ({ label: row.role === 'NONE' ? 'No role' : humanize(row.role), value: row.count }))} /> : null}
        </Panel>
        <SubscriptionStatusCard org={org} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <RecentActivity businessId={org.business.id} limit={6} />
        <OrganizationHealthCard stats={s} />
        <OrganizationInsights org={org} stats={s} />
      </div>
    </div>
  );
}

function UsersTab({ org }: { org: OrgDetail }) {
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [openUser, setOpenUser] = useState<string | null>(null);
  const list = useServerList<UserRow>({ key: 'platform-org-users', path: '/users', filters: { business_id: org.business.id, role, status }, defaultSort: { by: 'name', dir: 'asc' } });
  const { actionsFor, dialogs, openAdd, canManage } = useUserActions((row) => setOpenUser(row.id));
  return (
    <>
      <Panel bodyClass="">
        <TableToolbar actions={canManage ? <AdminButton tone="primary" icon={UserPlus} onClick={() => openAdd(org.business.id)}>Add user</AdminButton> : undefined}>
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search users in this organization…" />
          <FilterSelect label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'locked', label: 'Locked' }]} />
        </TableToolbar>
        <AdminTable<UserRow> {...list.tableProps} columns={userColumns(actionsFor, (row) => setOpenUser(row.id), canManage, { organization: false })} rowKey={(row) => row.id} noun="users"
          onRowClick={(row) => setOpenUser(row.id)} mobileCard={(row) => <UserMobileCard row={row} onOpen={() => setOpenUser(row.id)} actions={actionsFor(row)} />}
          empty={<EmptyState icon={Users} title="No users match" />} />
      </Panel>
      <p className="mt-3 text-xs text-muted">PINs are never shown. Owner roles can only be changed by the business. Every action asks for a reason and is audited, and the owner is told.</p>
      {openUser ? <UserDetailsDrawer userId={openUser} onClose={() => setOpenUser(null)} actionsFor={actionsFor} /> : null}
      {dialogs}
    </>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className={`${adminCard} flex items-start gap-3 p-4`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink/70"><Icon size={18} /></span>
      <div className="min-w-0"><div className="text-xs font-medium text-muted">{label}</div><div className="truncate text-lg font-extrabold text-ink">{value}</div>{hint ? <div className="text-xs text-muted">{hint}</div> : null}</div>
    </div>
  );
}

function SupportRecords({ org, grant, onRequest }: { org: OrgDetail; grant: Grant | null; onRequest: (minLevel: number) => void }) {
  const level = grant?.level ?? 0;
  const sales = useQuery({
    queryKey: ['support-view', org.business.id, 'sales', grant?.id],
    queryFn: async () => (await platformApi.get<{ masked: boolean; rows: { id: string; reference_number: string | null; sale_date: string; total_amount: number; paid_amount: number; payment_status: string; voided: boolean; cashier: string | null; customer_name: string | null; customer_phone: string | null }[] }>(`/support/${org.business.id}/sales`)).data,
    enabled: level >= 2,
  });
  const monitoring = useQuery({
    queryKey: ['support-view', org.business.id, 'monitoring', grant?.id],
    queryFn: async () => (await platformApi.get<{ devices: { device_id: string; last_seen: string; records: number }[]; signals: Record<string, number> }>(`/support/${org.business.id}/monitoring`)).data,
    enabled: level >= 1,
  });
  if (!useCan('support:access')) return null;
  if (!grant) {
    return (
      <Panel title="Detailed business records" icon={Lock}>
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Individual sales, customers and device details are private to {org.business.name}. Start a time-limited, audited support session to look at them.</p>
          <AdminButton tone="primary" icon={Headset} onClick={() => onRequest(1)}>Request support access</AdminButton>
        </div>
      </Panel>
    );
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Panel title={<span className="flex items-center gap-2">Recent sales {sales.data?.masked ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted">Customer details masked</span> : null}</span>} icon={Receipt} bodyClass="">
        {level < 2 ? <div className="p-5"><EmptyState icon={Lock} title="Needs level 2 access">Your level 1 session covers monitoring only.<AdminButton className="mt-3" onClick={() => onRequest(2)}>Request read-only access</AdminButton></EmptyState></div> : (
          <Boundary query={sales} skeleton={<SkeletonTable columns={[{ width: 'w-24' }, { width: 'w-20' }, { width: 'w-24' }, { width: 'w-16', kind: 'badge' }, { width: 'w-20', align: 'right' }]} rows={6} />} compactError>
            {(data) => data.rows.length === 0 ? <EmptyState icon={Receipt} title="No sales yet" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line bg-slate-50/60 text-left text-xs font-semibold text-muted"><th className="px-5 py-3">Sale</th><th className="px-5 py-3">Cashier</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
                  <tbody>{data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-2.5"><span className="block font-medium text-ink">{row.reference_number ?? shortId(row.id)}</span><span className="text-xs text-muted">{formatDateTime(row.sale_date)}</span></td>
                      <td className="px-5 py-2.5">{row.cashier ?? '—'}</td>
                      <td className="px-5 py-2.5">{row.customer_name ?? '—'}{row.customer_phone ? <span className="block text-xs text-muted">{row.customer_phone}</span> : null}</td>
                      <td className="px-5 py-2.5">{row.voided ? <StatusBadge status="void" label="Voided" /> : <StatusBadge status={row.payment_status === 'paid' ? 'paid' : 'open'} label={humanize(row.payment_status)} />}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{formatMoney(row.total_amount, org.business.currency)}</td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr className="border-t-2 border-line bg-slate-50/80 font-semibold text-ink">
                    <td className="px-5 py-3" colSpan={4}>Total <span className="text-xs font-medium text-muted">({data.rows.length} {data.rows.length === 1 ? 'sale' : 'sales'} shown, voided left out)</span></td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatMoney(data.rows.reduce((sum: number, row: { voided?: boolean; total_amount: number }) => sum + (row.voided ? 0 : Number(row.total_amount) || 0), 0), org.business.currency)}</td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </Boundary>
        )}
      </Panel>
      <Panel title="Devices and technical signals" icon={Smartphone}>
        <Boundary query={monitoring} skeleton={<SkeletonList rows={3} />} compactError>
          {(data) => (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-ink">{data.signals.locked_users}</div>Locked users</div>
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-ink">{data.signals.failed_logins_7d}</div>Failed sign-ins (7d)</div>
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-ink">{data.signals.voids_7d}</div>Voids (7d)</div>
              </div>
              {data.devices.length === 0 ? <p className="text-sm text-muted">No device uploads in the last 30 days.</p> : (
                <ul className="divide-y divide-line">{data.devices.map((device) => <li key={device.device_id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="truncate font-mono text-xs text-ink/80">{device.device_id}</span><span className="shrink-0 text-xs text-muted">{formatNumber(device.records)} records · {timeAgo(device.last_seen)}</span></li>)}</ul>
              )}
            </div>
          )}
        </Boundary>
      </Panel>
    </div>
  );
}

function ActivityTab({ org, grant, onRequest }: { org: OrgDetail; grant: Grant | null; onRequest: (minLevel: number) => void }) {
  const [range, setRange] = useState<StatsRange>('30d');
  const stats = useStats(org.business.id, range);
  const money = (value: number) => formatMoney(value, org.business.currency);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Totals only. These come from records the business has synced; no individual records are shown here.</p>
        <RangeSelect value={range} onChange={setRange} options={STATS_RANGES} />
      </div>
      {stats.isPending ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className={`${adminCard} flex gap-3 p-4`}><Bone className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Bone className="h-3 w-20" /><Bone className="h-5 w-28" /></div></div>)}</div>
        : stats.isError ? <ErrorState error={stats.error} onRetry={() => stats.refetch()} compact /> : stats.data ? (
          <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${stats.isFetching ? 'opacity-60' : ''}`}>
            <Metric icon={ShoppingCart} label="Total sales" value={money(stats.data.kpis.range_total)} hint={`${formatNumber(stats.data.kpis.range_count)} sales`} />
            <Metric icon={Package} label="Total purchases" value={money(stats.data.kpis.purchases_total)} hint={`${formatNumber(stats.data.kpis.purchases_count)} purchases`} />
            <Metric icon={Wallet} label="Total expenses" value={money(stats.data.kpis.expenses_total)} hint={`${formatNumber(stats.data.kpis.expenses_count)} expenses`} />
            <Metric icon={Receipt} label="Transactions (all time)" value={formatNumber(stats.data.kpis.transactions)} hint={`${formatNumber(stats.data.kpis.voided)} voided`} />
            <Metric icon={Package} label="Inventory items" value={formatNumber(stats.data.kpis.inventory_items)} />
            <Metric icon={TriangleAlert} label="Low-stock items" value={formatNumber(stats.data.kpis.low_stock)} hint="At or below reorder level" />
            <Metric icon={FileText} label="Pending invoices" value={formatNumber(stats.data.kpis.unpaid_count)} hint={`${money(stats.data.kpis.unpaid_total)} owed by customers`} />
            <Metric icon={Users} label="Customers" value={formatNumber(stats.data.kpis.customers)} />
          </div>
        ) : null}
      {grant ? <SupportBanner grant={grant} /> : null}
      <SupportRecords org={org} grant={grant} onRequest={onRequest} />
      <RecentActivity businessId={org.business.id} limit={15} />
    </div>
  );
}

function SubscriptionsTab({ org }: { org: OrgDetail }) {
  const query = useSubscriptionDetail(org.business.id);
  const canWrite = useCan('billing:write');
  const [action, setAction] = useState<SubscriptionAction | null>(null);
  return (
    <Boundary query={query} skeleton={<div className="grid gap-6 xl:grid-cols-3"><PanelSkeleton className="xl:col-span-2"><div className="grid grid-cols-2 gap-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="space-y-1.5"><Bone className="h-2.5 w-16" /><Bone className="h-4 w-28" /></div>)}</div></PanelSkeleton><PanelSkeleton><SkeletonList rows={4} /></PanelSkeleton></div>}>
      {(data) => {
        const s = data.subscription;
        const current = { plan: s.plan, subscription_status: s.stored_status, current_period_end: s.stored_status === 'trial' ? null : s.ends_at, trial_ends_at: s.stored_status === 'trial' ? s.ends_at : null, name: data.business.name };
        const actions = subscriptionActionsFor(current, canWrite, setAction);
        return (
          <div className="space-y-6">
            {s.status === 'grace' ? <div role="alert" className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900"><TriangleAlert size={16} />Expired {formatDate(s.ends_at)}. Grace period ends {formatDate(s.grace_ends_at)} ({s.grace_days_remaining} days left).</div> : null}
            {s.status === 'expired' ? <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><TriangleAlert size={16} />Expired. The {GRACE_DAYS}-day grace period ended {formatDate(s.grace_ends_at)}.</div> : null}
            <div className="grid gap-6 xl:grid-cols-3">
              <Panel title="Current subscription" icon={CreditCard} className="xl:col-span-2" action={<div className="flex flex-wrap gap-2">{actions.filter((item) => !item.hidden).slice(0, 2).map((item) => <AdminButton key={item.label} className="!min-h-9" icon={item.icon} tone={item.label.startsWith('Renew') ? 'primary' : 'secondary'} onClick={item.onSelect}>{item.label}</AdminButton>)}<ActionMenu label="More subscription actions" actions={actions.slice(2)} /></div>}>
                <DetailList items={[
                  { label: 'Current plan', value: s.plan_name ?? humanize(s.plan) },
                  { label: 'Status', value: <StatusBadge status={s.status} /> },
                  { label: 'Subscription amount', value: s.amount !== null ? formatMoney(s.amount, data.business.currency) : s.plan === 'free' ? 'Free' : '—' },
                  { label: 'Billing period', value: humanize(s.billing_period) },
                  { label: 'Start date', value: formatDate(s.started_at) },
                  { label: 'Expiry date', value: formatDate(s.ends_at) },
                  { label: 'Remaining days', value: s.days_remaining === null ? 'No end date' : String(Math.max(0, s.days_remaining)) },
                  { label: 'Grace period', value: s.grace_ends_at ? `${GRACE_DAYS} days, until ${formatDate(s.grace_ends_at)}` : `${GRACE_DAYS} days after expiry` },
                  { label: 'Unpaid balance', value: formatMoney(s.open_balance, data.business.currency) },
                  { label: 'List price', value: s.plan_monthly_price !== null ? `${formatMoney(s.plan_monthly_price, 'RWF')} / month` : '—' },
                ]} />
              </Panel>
              <Panel title="Renewal and change history" icon={RefreshCw}><SubscriptionHistory data={data} /></Panel>
            </div>
            <Panel title="Payment history" icon={Receipt}><PaymentHistory data={data} /></Panel>
            {action ? <SubscriptionManagementDialog businessId={org.business.id} current={current} action={action} onClose={() => setAction(null)} /> : null}
          </div>
        );
      }}
    </Boundary>
  );
}

function SettingsTab({ org, grant, onRequest }: { org: OrgDetail; grant: Grant | null; onRequest: (minLevel: number) => void }) {
  const b = org.business;
  const canFlags = useCan('flags:manage');
  const canSupport = useCan('support:access');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: b.name, description: b.description ?? '', address: b.address ?? '', contact_email: b.contact_email ?? '', contact_phone: b.contact_phone ?? '', logo_url: b.logo_url ?? '' });
  const [flag, setFlag] = useState<{ key: string; value: boolean } | null>(null);
  const canEdit = Boolean(grant && grant.level >= 3);
  return (
    <div className="space-y-6">
      {grant ? <SupportBanner grant={grant} /> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Business profile" icon={Building2} action={canSupport ? (canEdit ? <AdminButton className="!min-h-9" icon={Settings} onClick={() => setEditing(true)}>Edit profile</AdminButton> : <AdminButton className="!min-h-9" icon={Lock} onClick={() => onRequest(3)}>Unlock editing</AdminButton>) : undefined}>
          <div className="mb-4 flex items-center gap-3"><BusinessAvatar name={b.name} logo={b.logo_url} /><span className="text-sm text-muted">{canEdit ? 'Editing is allowed by your level 3 session.' : 'Changes need a level 3 support session and are audited.'}</span></div>
          <DetailList items={[
            { label: 'Business name', value: b.name }, { label: 'Organization ID', value: <span className="font-mono">{b.business_code}</span> },
            { label: 'Description', value: b.description ?? '—' }, { label: 'Address', value: b.address ?? '—' },
            { label: 'Contact email', value: b.contact_email ?? '—' }, { label: 'Contact phone', value: b.contact_phone ?? '—' },
            { label: 'Owner', value: org.owner ? `${org.owner.name}${org.owner.email ? ` · ${org.owner.email}` : ''}` : '—' }, { label: 'Internal ID', value: <span className="font-mono text-xs">{b.id}</span> },
          ]} />
        </Panel>
        <Panel title="Business settings" icon={Settings}>
          <DetailList items={[
            { label: 'Currency', value: b.currency }, { label: 'Country', value: b.country }, { label: 'Time zone', value: b.timezone },
            { label: 'Users', value: formatNumber(org.counts.users) }, { label: 'Products', value: formatNumber(org.counts.products) }, { label: 'Customers', value: formatNumber(org.counts.customers) },
          ]} />
          <div className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-muted">Tax, receipt and printer settings are stored on each phone and are not synced to the server, so they cannot be shown or changed here. Secrets and sign-in details are never shown.</div>
        </Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Users and permissions" icon={Users}>
          <p className="mb-3 text-sm text-muted">Roles are set by the business owner. Access per role:</p>
          <ul className="space-y-2 text-sm">
            <li><strong className="text-ink">Owner</strong> <span className="text-muted">— everything, manage users, close the day</span></li>
            <li><strong className="text-ink">Manager</strong> <span className="text-muted">— products, purchases, sales, expenses, reports, close the day</span></li>
            <li><strong className="text-ink">Cashier</strong> <span className="text-muted">— sales, customer payments, limited stock view</span></li>
            <li><strong className="text-ink">Staff</strong> <span className="text-muted">— limited operational access</span></li>
          </ul>
        </Panel>
        <Panel title="Application features" icon={Code}>
          <ul className="divide-y divide-line">
            {Object.entries(org.flag_definitions).map(([key, definition]) => (
              <li key={key} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{definition.label}</span><span className="block text-xs text-muted">{definition.description}</span></span>
                <label className={`flex shrink-0 items-center gap-2 text-xs font-semibold ${canFlags ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input type="checkbox" role="switch" checked={org.flags[key]} disabled={!canFlags} onChange={(e) => setFlag({ key, value: e.target.checked })} className="h-4 w-4 accent-brand" />{org.flags[key] ? 'On' : 'Off'}
                </label>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      {flag ? <ConfirmDialog title={`Turn ${org.flag_definitions[flag.key].label} ${flag.value ? 'on' : 'off'}`} confirmLabel="Save" onClose={() => setFlag(null)} invalidate={['platform-business']} run={(reason) => platformApi.patch(`/businesses/${b.id}/flags`, { flags: { [flag.key]: flag.value }, reason })} /> : null}
      {editing ? (
        <ConfirmDialog title="Edit business profile" confirmLabel="Save profile" onClose={() => setEditing(false)} invalidate={['platform-business', 'platform-businesses', 'platform-audit']}
          description="The owner is emailed about this change."
          run={(reason) => platformApi.patch(`/businesses/${b.id}/profile`, { reason, name: form.name, description: form.description || null, address: form.address || null, contact_email: form.contact_email || null, contact_phone: form.contact_phone || null, logo_url: form.logo_url || null })}>
          <div className="space-y-3">
            <div><label className={labelClass} htmlFor="p-name">Business name</label><input id="p-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} /></div>
            <div><label className={labelClass} htmlFor="p-desc">Description</label><input id="p-desc" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} /></div>
            <div><label className={labelClass} htmlFor="p-address">Address</label><input id="p-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={fieldClass} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={labelClass} htmlFor="p-email">Contact email</label><input id="p-email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className={fieldClass} /></div>
              <div><label className={labelClass} htmlFor="p-phone">Contact phone</label><input id="p-phone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className={fieldClass} /></div>
            </div>
            <div><label className={labelClass} htmlFor="p-logo">Logo link (https)</label><input id="p-logo" type="url" placeholder="https://" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} className={fieldClass} /></div>
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

export function OrganizationDetails() {
  const { id = '', tab: rawTab } = useParams();
  const navigate = useNavigate();
  const org = useOrg(id);
  const permissions = { 'users:read': useCan('users:read'), 'billing:read': useCan('billing:read'), 'audit:read': useCan('audit:read') } as Record<string, boolean>;
  const tabs = TABS.filter((tab) => !tab.permission || permissions[tab.permission]);
  const tab = (tabs.find((item) => item.value === rawTab)?.value ?? 'overview') as Tab;
  const setTab = (next: Tab) => navigate(`/platform/businesses/${id}${next === 'overview' ? '' : `/${next}`}`);
  const { grant } = useMyActiveGrant(id);
  const [support, setSupport] = useState<{ minLevel: number } | null>(null);
  useBreadcrumbs(org.data ? [{ label: org.data.business.name }] : null);
  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Building2 size={26} /></span>
          <div><h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">Organization Details</h2><p className="text-sm text-muted">View and monitor everything about this organization.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-64"><BusinessPicker label="Switch organization" value={id} onChange={(next) => next && navigate(`/platform/businesses/${next}${tab === 'overview' ? '' : `/${tab}`}`)} /></div>
          {org.data ? <StatusBadge status={org.data.org_status} /> : null}
        </div>
      </header>
      {org.isPending ? <OrganizationDetailsSkeleton /> : org.isError ? <ErrorState error={org.error} onRetry={() => org.refetch()} /> : (
        <div className="space-y-6">
          {org.data.state.status === 'suspended' ? <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><PauseCircle size={16} /><span><strong>Suspended {formatDateTime(org.data.state.suspended_at)}.</strong> {org.data.state.suspended_reason}</span></div> : null}
          <OrganizationHeader org={org.data} onTab={setTab} onSupport={() => setSupport({ minLevel: 1 })} />
          {grant && tab === 'overview' ? <SupportBanner grant={grant} /> : null}
          <Tabs label="Organization sections" value={tab} onChange={setTab} tabs={tabs} />
          <div role="tabpanel" aria-label={tabs.find((item) => item.value === tab)?.label}>
            {tab === 'overview' ? <OverviewTab org={org.data} /> : null}
            {tab === 'users' ? <UsersTab org={org.data} /> : null}
            {tab === 'activity' ? <ActivityTab org={org.data} grant={grant} onRequest={(minLevel) => setSupport({ minLevel })} /> : null}
            {tab === 'subscriptions' ? <SubscriptionsTab org={org.data} /> : null}
            {tab === 'settings' ? <SettingsTab org={org.data} grant={grant} onRequest={(minLevel) => setSupport({ minLevel })} /> : null}
            {tab === 'audit' ? <AuditLogTable businessId={org.data.business.id} /> : null}
          </div>
        </div>
      )}
      {support && org.data ? <SupportAccessDialog businessId={id} businessName={org.data.business.name} minLevel={support.minLevel} onClose={() => setSupport(null)} /> : null}
    </>
  );
}

