import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, Bell, Building2, CircleAlert, CircleCheck, Clock, CreditCard, Database, HardDrive, Info, Mail, RefreshCw, Server, ShoppingCart, UserPlus, type LucideIcon } from 'lucide-react';
import { formatMoney, formatNumber, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { CHART_COLORS } from '../ui/chartUtils';
import { DonutChart } from '../ui/charts';
import { Boundary, EmptyState, Panel, timeAgo, useAlertSummary } from './ui/admin';
import { Bone, SkeletonBars, SkeletonList } from './ui/skeleton';

export type ActivityRow = { kind: string; ref: string; title: string; detail: string | null; business_id: string | null; business_name: string | null; amount: number | null; at: string };

const ACTION_LABELS: Record<string, string> = {
  'business.suspended': 'Organization suspended', 'business.reactivated': 'Organization reactivated', 'business.profile_changed': 'Organization profile updated',
  'business.flags_changed': 'Features changed', 'business.exported': 'Data exported', 'subscription.renewed': 'Subscription renewed', 'subscription.started': 'Subscription started',
  'subscription.plan_changed': 'Plan changed', 'subscription.extended': 'Subscription extended', 'subscription.suspended': 'Subscription suspended', 'subscription.reactivated': 'Subscription reactivated',
  'billing.subscription_changed': 'Subscription updated', 'billing.invoice_created': 'Invoice created', 'billing.invoice_paid': 'Invoice paid', 'user.created': 'User added by MIA',
  'user.role_changed': 'Role changed', 'user.deactivated': 'User deactivated', 'user.reactivated': 'User reactivated', 'user.signed_out': 'Sessions revoked',
  'support.access_started': 'Support access started', 'support.access_ended': 'Support access ended', 'announcement.created': 'Announcement published', 'email.campaign_created': 'Email campaign sent',
};

function activityView(row: ActivityRow): { icon: LucideIcon; tone: string; title: string; detail: string } {
  if (row.kind === 'business_registered') return { icon: Building2, tone: 'bg-emerald-100 text-emerald-700', title: 'New business registered', detail: row.title };
  if (row.kind === 'user_created') return { icon: UserPlus, tone: 'bg-sky-100 text-sky-700', title: 'New user created', detail: [row.title, humanize(row.detail), row.business_name].filter((part) => part && part !== '—').join(' · ') };
  if (row.kind === 'sales_day') return { icon: ShoppingCart, tone: 'bg-violet-100 text-violet-700', title: `${row.title} sale${row.title === '1' ? '' : 's'} recorded`, detail: formatMoney(row.amount, row.detail ?? 'RWF') };
  const subscription = row.title.startsWith('subscription.') || row.title.startsWith('billing.');
  return { icon: subscription ? CreditCard : RefreshCw, tone: subscription ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600', title: ACTION_LABELS[row.title] ?? humanize(row.title), detail: [row.business_name, row.detail].filter(Boolean).join(' · ') };
}

export function RecentActivity({ businessId, limit = 6, viewAllHref }: { businessId?: string; limit?: number; viewAllHref?: string }) {
  const query = useQuery({
    queryKey: ['platform-activity', businessId ?? 'all', limit],
    queryFn: async () => (await platformApi.get<{ rows: ActivityRow[] }>('/activity', { params: { business_id: businessId, limit } })).data.rows,
    refetchInterval: 60_000,
  });
  return (
    <Panel title="Recent activity" icon={Clock} action={viewAllHref ? <Link to={viewAllHref} className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 hover:underline">View all <ArrowRight size={14} /></Link> : undefined}>
      <Boundary query={query} skeleton={<SkeletonList rows={Math.min(limit, 4)} />} compactError>
        {(rows) => rows.length === 0 ? <EmptyState icon={Activity} title="No activity yet" /> : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const view = activityView(row);
              return (
                <li key={`${row.kind}-${row.ref}`} className="flex items-start gap-3 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${view.tone}`}><view.icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{view.title}</div>
                    <div className="truncate text-xs text-muted">{row.business_id && !businessId ? <Link to={`/platform/businesses/${row.business_id}`} className="hover:underline">{view.detail}</Link> : view.detail}</div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted">{timeAgo(row.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Boundary>
    </Panel>
  );
}

const SEVERITY = {
  critical: { icon: CircleAlert, box: 'bg-rose-50 border-rose-100', iconTone: 'text-rose-600' },
  warning: { icon: AlertTriangle, box: 'bg-amber-50 border-amber-100', iconTone: 'text-amber-600' },
  info: { icon: Info, box: 'bg-sky-50 border-sky-100', iconTone: 'text-sky-600' },
};

export function AlertPanel({ limit = 3 }: { limit?: number }) {
  const query = useAlertSummary();
  return (
    <Panel
      title={<span className="flex items-center gap-2">Important alerts {query.data?.count ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{query.data.count}</span> : null}</span>}
      icon={Bell}
      action={<Link to="/platform/alerts" className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 hover:underline">View all <ArrowRight size={14} /></Link>}
    >
      <Boundary query={query} skeleton={<div className="space-y-2.5"><Bone className="h-16 rounded-xl" /><Bone className="h-16 rounded-xl" /></div>} compactError>
        {(data) => data.items.length === 0 ? <EmptyState icon={CircleCheck} title="No alerts">Everything looks healthy.</EmptyState> : (
          <ul className="space-y-2.5">
            {data.items.slice(0, limit).map((item) => {
              const style = SEVERITY[item.severity];
              return (
                <li key={item.id}>
                  <Link to={item.link} className={`flex gap-3 rounded-xl border p-3.5 hover:brightness-[0.98] ${style.box}`}>
                    <style.icon size={20} className={`mt-0.5 shrink-0 ${style.iconTone}`} />
                    <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{item.title}</span><span className="block truncate text-xs text-muted">{item.detail}</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Boundary>
    </Panel>
  );
}

export type HealthCheck = { status: string; detail: string };
export type Health = { checked_at: string; api: HealthCheck & { uptime_seconds: number }; database: HealthCheck & { latency_ms: number | null }; sync: HealthCheck & { last_received_at: string | null }; backups: HealthCheck & { last_backup_at: string | null }; email: HealthCheck };

export function usePlatformHealth() {
  return useQuery({ queryKey: ['platform-health'], queryFn: async () => (await platformApi.get<Health>('/health')).data, refetchInterval: 120_000, staleTime: 60_000 });
}

export function healthTone(status: string) {
  return status === 'operational' ? { icon: CircleCheck, tone: 'text-emerald-600', label: 'Operational' }
    : status === 'degraded' ? { icon: AlertTriangle, tone: 'text-amber-600', label: 'Degraded' }
      : status === 'not_configured' ? { icon: Info, tone: 'text-slate-400', label: 'Not configured' }
        : { icon: CircleAlert, tone: 'text-rose-600', label: 'Down' };
}

export function HealthTile({ icon: Icon, label, check, sub }: { icon: LucideIcon; label: string; check: HealthCheck; sub?: string }) {
  const tone = healthTone(check.status);
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 px-2 py-1 text-center" title={check.detail}>
      <span className="relative">
        <Icon size={22} className="text-slate-400" />
        <tone.icon size={14} className={`absolute -bottom-1 -right-2 rounded-full bg-white ${tone.tone}`} />
      </span>
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className={`text-xs font-semibold ${tone.tone}`}>{tone.label}</span>
      {sub ? <span className="text-[11px] text-muted">{sub}</span> : null}
    </div>
  );
}

export function PlatformHealthCard() {
  const query = usePlatformHealth();
  return (
    <Panel title="Platform health" icon={Activity}>
      <Boundary query={query} skeleton={<div className="space-y-4"><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col items-center gap-2"><Bone className="h-7 w-7 rounded-full" /><Bone className="h-3 w-16" /><Bone className="h-2.5 w-14" /></div>)}</div><Bone className="h-11 rounded-xl" /></div>} compactError>
        {(data) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-y-5">
              <HealthTile icon={Server} label="API" check={data.api} sub={`Up ${Math.floor(data.api.uptime_seconds / 3600)}h`} />
              <HealthTile icon={Database} label="Database" check={data.database} sub={data.database.latency_ms !== null ? `${data.database.latency_ms} ms` : undefined} />
              <HealthTile icon={RefreshCw} label="Sync" check={data.sync} sub={data.sync.last_received_at ? `Last ${timeAgo(data.sync.last_received_at)}` : 'No uploads yet'} />
              <HealthTile icon={HardDrive} label="Backups" check={data.backups} sub={data.backups.last_backup_at ? timeAgo(data.backups.last_backup_at) : undefined} />
            </div>
            <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ${data.email.status === 'operational' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-muted'}`}>
              <Mail size={15} /> Email: {data.email.detail} · checked {timeAgo(data.checked_at).toLowerCase()}
            </div>
          </div>
        )}
      </Boundary>
    </Panel>
  );
}

export function BusinessDistribution({ plans, distribution }: { plans: { plan: string; name: string | null; count: number }[]; distribution: Record<string, number> }) {
  const total = plans.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="space-y-4">
      <DonutChart centerLabel="Businesses" format={formatNumber} empty="No businesses yet." items={plans.map((row) => ({ label: row.name ?? humanize(row.plan), value: row.count }))} />
      {total > 0 ? (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {(['active', 'trial', 'expired', 'suspended'] as const).map((key) => (
            <div key={key} className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-muted">{humanize(key)}</div><div className="text-sm font-bold text-ink">{formatNumber(distribution[key] ?? 0)}</div></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ROLE_ORDER = ['OWNER', 'MANAGER', 'CASHIER', 'STAFF'];

export function UserRoleDistribution({ roles }: { roles: { role: string; count: number }[] }) {
  const sorted = [...roles].sort((a, b) => (ROLE_ORDER.indexOf(a.role) + 1 || 99) - (ROLE_ORDER.indexOf(b.role) + 1 || 99));
  const max = Math.max(0, ...sorted.map((row) => row.count));
  if (max === 0) return <EmptyState title="No users yet" />;
  return (
    <ul className="space-y-3.5">
      {sorted.map((row, index) => (
        <li key={row.role} className="grid grid-cols-[84px_1fr_32px] items-center gap-3 text-sm">
          <span className="truncate font-medium text-ink">{row.role === 'NONE' ? 'No role yet' : humanize(row.role)}</span>
          <span className="h-2.5 rounded-full bg-slate-100"><span className="block h-2.5 rounded-full" style={{ width: `${Math.max(3, (row.count / max) * 100)}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} /></span>
          <span className="text-right font-semibold tabular-nums text-ink">{formatNumber(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}

export function UserRoleSkeleton() {
  return <SkeletonBars rows={3} />;
}
