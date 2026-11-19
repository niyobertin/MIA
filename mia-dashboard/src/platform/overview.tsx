import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, CircleCheck, LayoutDashboard, PieChart, ShoppingCart, Store, TrendingUp, TriangleAlert, Users } from 'lucide-react';
import { formatDay, formatMoney, formatNumber } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { CurveChart } from '../ui/charts';
import { AdminPageHeader, Chip, ErrorState, KpiCard, Panel, RangeSelect, Segmented } from './ui/admin';
import { KpiGridSkeleton, LoadingRegion, PanelSkeleton, SkeletonChart, SkeletonDonut } from './ui/skeleton';
import { AlertPanel, BusinessDistribution, PlatformHealthCard, RecentActivity, UserRoleDistribution, UserRoleSkeleton, usePlatformHealth } from './widgets';
import { useCan } from './context';

export type Range = '7d' | '30d' | '90d' | '12m';
export const RANGE_OPTIONS: { value: Range; label: string; short: string }[] = [
  { value: '7d', label: 'Last 7 days', short: '7D' },
  { value: '30d', label: 'Last 30 days', short: '30D' },
  { value: '90d', label: 'Last 90 days', short: '90D' },
  { value: '12m', label: 'Last 12 months', short: '12M' },
];

type Kpi = { value: number; growth: number | null };
export type OverviewData = {
  range: Range;
  bucket: 'day' | 'week' | 'month';
  history_complete: boolean;
  kpis: {
    businesses: Kpi & { new: number };
    users: Kpi & { active: number; inactive: number; new: number };
    sales_volume: Kpi & { currency: string; previous: number };
    transactions: Kpi & { previous: number };
  };
  other_currencies: { currency: string; total: number }[];
  roles: { role: string; count: number }[];
  plans: { plan: string; name: string | null; count: number }[];
  distribution: Record<string, number>;
  series: { day: string; businesses: number; users: number; transactions: number; sales_volume: number }[];
};

const COMPARE_LABEL: Record<Range, string> = { '7d': 'vs previous 7 days', '30d': 'vs previous 30 days', '90d': 'vs previous 90 days', '12m': 'vs previous 12 months' };

export function bucketLabel(day: string, bucket: string) {
  if (bucket === 'month') return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  return formatDay(day);
}

function SystemStatusChip() {
  const health = usePlatformHealth();
  if (!health.data) return null;
  const checks = [health.data.api, health.data.database, health.data.sync];
  const ok = checks.every((check) => check.status === 'operational');
  return ok
    ? <Chip tone="green"><CircleCheck size={16} />All systems operational</Chip>
    : <Chip tone="amber"><TriangleAlert size={16} />Some systems need attention</Chip>;
}

export function PlatformOverviewSkeleton() {
  return (
    <LoadingRegion label="Loading platform overview" className="space-y-6">
      <KpiGridSkeleton />
      <div className="grid gap-6 xl:grid-cols-3">
        <PanelSkeleton className="xl:col-span-2"><SkeletonChart height={260} title={false} /></PanelSkeleton>
        <div className="space-y-6">
          <PanelSkeleton><SkeletonDonut /></PanelSkeleton>
          <PanelSkeleton><UserRoleSkeleton /></PanelSkeleton>
        </div>
      </div>
    </LoadingRegion>
  );
}

export function PlatformOverview() {
  const [range, setRange] = useState<Range>('30d');
  const canAlerts = useCan('metrics:read');
  const canAudit = useCan('audit:read');
  const query = useQuery({
    queryKey: ['platform-overview', range],
    queryFn: async () => (await platformApi.get<OverviewData>('/overview', { params: { range } })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
  });
  const data = query.data;
  const refreshing = query.isFetching && !query.isPending;
  const compare = data?.history_complete ? COMPARE_LABEL[range] : undefined;
  return (
    <>
      <AdminPageHeader
        icon={LayoutDashboard}
        title="Platform Overview"
        subtitle="Monitor your entire MIA ecosystem."
        refreshing={refreshing}
        actions={<><SystemStatusChip /><RangeSelect value={range} onChange={setRange} options={RANGE_OPTIONS} /></>}
      />
      {query.isPending ? <PlatformOverviewSkeleton /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Store} tone="green" label="Total Businesses" value={formatNumber(data.kpis.businesses.value)} growth={data.kpis.businesses.growth} growthLabel={`new ${compare ?? ''}`.trim()} hint={`${formatNumber(data.kpis.businesses.new)} new in this period`} spark={data.series.map((row) => row.businesses)} />
            <KpiCard icon={Users} tone="blue" label="Total Users" value={formatNumber(data.kpis.users.value)} growth={data.kpis.users.growth} growthLabel={compare} hint={`${formatNumber(data.kpis.users.active)} active · ${formatNumber(data.kpis.users.inactive)} inactive`} spark={data.series.map((row) => row.users)} />
            <KpiCard icon={ShoppingCart} tone="violet" label="Sales Volume" value={formatMoney(data.kpis.sales_volume.value, data.kpis.sales_volume.currency)} growth={data.kpis.sales_volume.growth} growthLabel={compare}
              hint={data.other_currencies.length ? `Plus ${data.other_currencies.map((row) => formatMoney(row.total, row.currency)).join(', ')}` : 'Across all organizations'} spark={data.series.map((row) => row.sales_volume)} />
            <KpiCard icon={BarChart3} tone="amber" label="Sales Transactions" value={formatNumber(data.kpis.transactions.value)} growth={data.kpis.transactions.growth} growthLabel={compare} hint={data.history_complete ? undefined : 'Not enough history to compare yet'} spark={data.series.map((row) => row.transactions)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Business registrations trend" icon={TrendingUp} className="xl:col-span-2"
              action={<Segmented label="Chart range" value={range} onChange={setRange} options={RANGE_OPTIONS.map((option) => ({ value: option.value, label: option.short }))} />}>
              <div className={refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                <CurveChart name="New businesses" format={formatNumber} labels={data.series.map((row) => bucketLabel(row.day, data.bucket))} series={[{ name: 'New businesses', color: '#159b69', values: data.series.map((row) => row.businesses) }]} />
              </div>
            </Panel>
            <div className="space-y-6">
              <Panel title="Business by plan" icon={PieChart}><BusinessDistribution plans={data.plans} distribution={data.distribution} /></Panel>
              <Panel title="Users by role" icon={Users}><UserRoleDistribution roles={data.roles} /></Panel>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <PlatformHealthCard />
        <RecentActivity viewAllHref={canAudit ? '/platform/audit' : undefined} />
        {canAlerts ? <AlertPanel /> : null}
      </div>
    </>
  );
}
