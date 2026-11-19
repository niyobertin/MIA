import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Building2, CircleCheck, CreditCard, Crown, Eye, Mail, PauseCircle, Pencil, Phone, PlayCircle, Users } from 'lucide-react';
import { formatDate, formatNumber, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import {
  ActionMenu, AdminPageHeader, AdminTable, Chip, ConfirmDialog, EmptyState, FilterSelect, IconAction, KpiCard, Panel, PlanBadge, SearchInput, StatusBadge, TableToolbar, type AdminColumn, type MenuAction,
} from './ui/admin';
import { KpiGridSkeleton, LoadingRegion, PageHeaderSkeleton, TableCardSkeleton } from './ui/skeleton';
import { useServerList } from './ui/useServerList';
import { useCan } from './context';

export type BusinessRow = {
  id: string; name: string; business_code: string; currency: string; created_at: string; contact_email: string | null; contact_phone: string | null; logo_url: string | null;
  status: string; plan: string; plan_name: string | null; subscription_status: string; subscription_effective: string; org_status: 'active' | 'suspended' | 'trial' | 'expired';
  users: number; owner_name: string | null; owner_email: string | null; owner_phone: string | null;
};
type BusinessSummary = { total: number; active: number; trial: number; expired: number; suspended: number; paid: number; new_30d: number; previous_new_30d: number };
type Plan = { code: string; name: string; monthly_price: number; active: boolean; businesses: number };

export function usePlans() {
  return useQuery({
    queryKey: ['platform-plans'],
    queryFn: async () => (await platformApi.get<{ rows: Plan[]; in_use: string[]; unlisted: number }>('/plans')).data,
    staleTime: 5 * 60_000,
  });
}

export function planOptions(plans: ReturnType<typeof usePlans>['data'], allLabel = 'All plans') {
  const known = new Map((plans?.rows ?? []).map((plan) => [plan.code, plan.name]));
  const codes = new Set(['free', ...(plans?.rows ?? []).map((plan) => plan.code), ...(plans?.in_use ?? [])]);
  return [{ value: 'all', label: allLabel }, ...[...codes].map((code) => ({ value: code, label: known.get(code) ?? humanize(code) }))];
}

export function BusinessAvatar({ name, logo }: { name: string; logo?: string | null }) {
  return logo
    ? <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-xl border border-line bg-white object-contain" />
    : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xs font-bold text-emerald-800">{name.slice(0, 2).toUpperCase()}</span>;
}

type Pending = { kind: 'suspend' | 'reactivate'; row: Pick<BusinessRow, 'id' | 'name'> } | null;

export function useBusinessActions() {
  const [pending, setPending] = useState<Pending>(null);
  const canSuspend = useCan('businesses:suspend');
  const canBilling = useCan('billing:read');
  const canUsers = useCan('users:read');
  const actionsFor = (row: Pick<BusinessRow, 'id' | 'name' | 'status'>): MenuAction[] => [
    { label: 'View organization', icon: Eye, href: `/platform/businesses/${row.id}`, onSelect: () => undefined },
    { label: 'Edit organization profile', icon: Pencil, href: `/platform/businesses/${row.id}/settings`, onSelect: () => undefined },
    { label: 'View users', icon: Users, href: `/platform/businesses/${row.id}/users`, onSelect: () => undefined, hidden: !canUsers },
    { label: 'Manage subscription', icon: CreditCard, href: `/platform/businesses/${row.id}/subscriptions`, onSelect: () => undefined, hidden: !canBilling },
    { label: 'View organization activity', icon: Activity, href: `/platform/businesses/${row.id}/activity`, onSelect: () => undefined },
    { label: 'Suspend organization', icon: PauseCircle, tone: 'danger', onSelect: () => setPending({ kind: 'suspend', row }), hidden: !canSuspend || row.status === 'suspended' },
    { label: 'Reactivate organization', icon: PlayCircle, onSelect: () => setPending({ kind: 'reactivate', row }), hidden: !canSuspend || row.status !== 'suspended' },
  ];
  const dialog = pending ? (
    <ConfirmDialog
      title={`${pending.kind === 'suspend' ? 'Suspend' : 'Reactivate'} ${pending.row.name}`}
      description={pending.kind === 'suspend'
        ? 'Staff cannot sign in or sync until it is reactivated. Phones keep working offline. This is separate from the subscription, and the owner is emailed.'
        : 'Sign-in and sync work again, and the owner is emailed. The subscription status does not change.'}
      confirmLabel={pending.kind === 'suspend' ? 'Suspend organization' : 'Reactivate'}
      tone={pending.kind === 'suspend' ? 'danger' : 'primary'}
      onClose={() => setPending(null)}
      invalidate={['platform-businesses', 'platform-business', 'platform-overview', 'platform-alert-summary', 'platform-activity']}
      run={(reason) => platformApi.post(`/businesses/${pending.row.id}/${pending.kind}`, { reason })}
    />
  ) : null;
  return { actionsFor, dialog };
}

const SKELETON_COLUMNS = [
  { width: 'w-16' }, { width: 'w-36', kind: 'avatar' as const }, { width: 'w-16', kind: 'badge' as const }, { width: 'w-16', kind: 'badge' as const },
  { width: 'w-28', kind: 'stack' as const }, { width: 'w-20' }, { width: 'w-28', kind: 'stack' as const }, { width: 'w-16', kind: 'actions' as const, align: 'right' as const },
];

export function BusinessesManagementSkeleton() {
  return (
    <LoadingRegion label="Loading businesses" className="space-y-6">
      <PageHeaderSkeleton actions={1} />
      <KpiGridSkeleton />
      <TableCardSkeleton filters={3} columns={SKELETON_COLUMNS} headers={['Organization ID', 'Business name', 'Plan', 'Status', 'Owner', 'Registered', 'Contact', 'Actions']} />
    </LoadingRegion>
  );
}

export function BusinessesManagement() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? 'all');
  const [plan, setPlan] = useState('all');
  const [period, setPeriod] = useState('all');
  const plans = usePlans();
  const list = useServerList<BusinessRow, BusinessSummary>({ key: 'platform-businesses', path: '/businesses', filters: { status, plan, period }, defaultSort: { by: 'date', dir: 'desc' } });
  const { actionsFor, dialog } = useBusinessActions();
  if (list.query.isPending && !list.query.data) return <BusinessesManagementSkeleton />;
  const summary = list.query.data?.summary;
  const growth = summary && summary.previous_new_30d > 0 ? Math.round(((summary.new_30d - summary.previous_new_30d) / summary.previous_new_30d) * 1000) / 10 : null;
  const columns: AdminColumn<BusinessRow>[] = [
    { key: 'code', header: 'Organization ID', sortKey: 'code', cell: (row) => <span className="font-mono text-xs text-muted">{row.business_code}</span>, hideBelow: 'xl' },
    { key: 'name', header: 'Business name', sortKey: 'name', skeleton: { width: 'w-36', kind: 'avatar' }, cell: (row) => (
      <Link to={`/platform/businesses/${row.id}`} className="flex items-center gap-3"><BusinessAvatar name={row.name} logo={row.logo_url} /><span className="min-w-0"><span className="block truncate font-semibold text-ink hover:underline">{row.name}</span><span className="block text-xs text-muted">{formatNumber(row.users)} user{row.users === 1 ? '' : 's'}</span></span></Link>
    ) },
    { key: 'plan', header: 'Subscription plan', sortKey: 'plan', skeleton: { width: 'w-16', kind: 'badge' }, cell: (row) => <span className="flex flex-col items-start gap-1"><PlanBadge plan={row.plan} name={row.plan_name} />{row.subscription_effective !== 'active' && row.subscription_effective !== 'trial' ? <StatusBadge status={row.subscription_effective} /> : null}</span> },
    { key: 'status', header: 'Organization status', sortKey: 'status', skeleton: { width: 'w-16', kind: 'badge' }, cell: (row) => <StatusBadge status={row.org_status} /> },
    { key: 'owner', header: 'Owner', hideBelow: 'md', cell: (row) => row.owner_name ? <span className="min-w-0"><span className="block font-medium text-ink">{row.owner_name}</span><span className="block truncate text-xs text-muted">{row.owner_email ?? row.owner_phone}</span></span> : <span className="text-muted">No owner yet</span> },
    { key: 'date', header: 'Registered on', sortKey: 'date', hideBelow: 'lg', cell: (row) => <span className="whitespace-nowrap">{formatDate(row.created_at)}</span> },
    { key: 'contact', header: 'Contact', hideBelow: 'xl', cell: (row) => {
      const email = row.contact_email ?? row.owner_email;
      const phone = row.contact_phone ?? row.owner_phone;
      return email || phone ? <span className="space-y-0.5 text-xs text-ink/80">{email ? <span className="flex items-center gap-1.5"><Mail size={12} className="text-muted" />{email}</span> : null}{phone ? <span className="flex items-center gap-1.5"><Phone size={12} className="text-muted" />{phone}</span> : null}</span> : <span className="text-muted">—</span>;
    } },
    { key: 'actions', header: 'Actions', align: 'right', skeleton: { width: 'w-16', kind: 'actions', align: 'right' }, cell: (row) => (
      <span className="inline-flex items-center gap-0.5"><IconAction label={`Open ${row.name}`} icon={Eye} href={`/platform/businesses/${row.id}`} /><ActionMenu label={`Actions for ${row.name}`} actions={actionsFor(row).slice(1)} /></span>
    ) },
  ];
  return (
    <>
      <AdminPageHeader icon={Building2} title="Businesses" subtitle="Manage registered businesses on MIA." refreshing={list.query.isFetching && !list.query.isPending}
        actions={summary ? <Chip tone="green">Total businesses: {formatNumber(summary.total)}</Chip> : null} />
      {summary ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Building2} tone="blue" label="Total businesses" value={formatNumber(summary.total)} growth={growth} growthLabel="new vs previous 30 days" hint={`${formatNumber(summary.new_30d)} registered in 30 days`} />
          <KpiCard icon={CircleCheck} tone="green" label="Active businesses" value={formatNumber(summary.active)} hint={`${formatNumber(summary.trial)} on trial · ${formatNumber(summary.expired)} expired`} />
          <KpiCard icon={PauseCircle} tone="amber" label="Suspended" value={formatNumber(summary.suspended)} hint="Sign-in and sync paused" />
          <KpiCard icon={Crown} tone="violet" label="Paid subscriptions" value={formatNumber(summary.paid)} hint="On any plan other than Free" />
        </div>
      ) : list.query.isError ? null : <div className="mb-6"><KpiGridSkeleton /></div>}
      <Panel bodyClass="">
        <TableToolbar>
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search by business name or organization ID…" />
          <FilterSelect label="Plan" value={plan} onChange={setPlan} options={planOptions(plans.data)} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' }, { value: 'expired', label: 'Expired' }, { value: 'suspended', label: 'Suspended' }]} />
          <FilterSelect label="Registered" value={period} onChange={setPeriod} options={[{ value: 'all', label: 'Registered any time' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }]} />
        </TableToolbar>
        <AdminTable<BusinessRow>
          {...list.tableProps}
          columns={columns}
          rowKey={(row) => row.id}
          noun="businesses"
          mobileCard={(row) => (
            <div className="flex items-start gap-3">
              <Link to={`/platform/businesses/${row.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                <BusinessAvatar name={row.name} logo={row.logo_url} />
                <span className="min-w-0"><span className="block truncate font-semibold text-ink">{row.name}</span><span className="block text-xs text-muted">{row.business_code} · {formatDate(row.created_at)}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5"><StatusBadge status={row.org_status} /><PlanBadge plan={row.plan} name={row.plan_name} /></span></span>
              </Link>
              <ActionMenu label={`Actions for ${row.name}`} actions={actionsFor(row)} />
            </div>
          )}
          empty={<EmptyState icon={Building2} title={list.search || status !== 'all' || plan !== 'all' || period !== 'all' ? 'No businesses match these filters' : 'No businesses yet'}>Businesses appear here when an owner registers in the MIA app.</EmptyState>}
        />
      </Panel>
      {dialog}
    </>
  );
}
