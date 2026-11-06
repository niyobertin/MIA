import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDate, formatDateTime, formatDay, formatMoney, formatNumber, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { BarList, TrendChart } from '../ui/charts';
import { Badge, Card, DataTable, EmptyNotice, PageHeader, QueryBoundary, Stat } from '../ui/kit';

type Row = Record<string, any>;

type Overview = {
  totals: Record<string, number>;
  retention: { eligible: number; retained: number };
  volume_30d: { currency: string; sales: number; total: number }[];
  roles: { role: string; count: number }[];
  signups: { day: string; count: number }[];
  plans: { plan: string; count: number }[];
};

export function PlatformOverview() {
  const query = useQuery({ queryKey: ['platform-overview'], queryFn: async () => (await platformApi.get<Overview>('/overview')).data, refetchInterval: 60000 });
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Across all businesses on MIA." />
      <QueryBoundary query={query}>
        {(data) => {
          const retention = data.retention.eligible ? `${Math.round((data.retention.retained / data.retention.eligible) * 100)}%` : '—';
          return (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Businesses" value={formatNumber(data.totals.businesses)} hint={`${formatNumber(data.totals.new_businesses_30d)} new in 30 days`} />
                <Stat label="Active in 7 days" value={formatNumber(data.totals.active_7d)} hint={`${formatNumber(data.totals.active_30d)} active in 30 days`} />
                <Stat label="30-day retention" value={retention} hint={`${data.retention.retained} of ${data.retention.eligible} businesses older than 30 days`} />
                <Stat label="Suspended" value={formatNumber(data.totals.suspended)} />
                <Stat label="Users" value={formatNumber(data.totals.users)} hint={`${formatNumber(data.totals.active_users)} active`} />
                {data.volume_30d.length === 0 ? <Stat label="Sales volume (30 days)" value={formatNumber(0)} /> : data.volume_30d.map((row) => (
                  <Stat key={row.currency} label="Sales volume (30 days)" value={formatMoney(row.total, row.currency)} hint={`${formatNumber(row.sales)} sales`} />
                ))}
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                <Card title="New businesses by day" className="lg:col-span-2">
                  <div className="p-5"><TrendChart name="New businesses" format={formatNumber} points={data.signups.map((row) => ({ label: formatDay(row.day), value: row.count }))} /></div>
                </Card>
                <div className="space-y-6">
                  <Card title="Users by role"><div className="p-5"><BarList format={formatNumber} empty="No users yet." items={data.roles.map((row) => ({ label: humanize(row.role), value: row.count }))} /></div></Card>
                  <Card title="Businesses by plan"><div className="p-5"><BarList format={formatNumber} empty="No businesses yet." items={data.plans.map((row) => ({ label: humanize(row.plan), value: row.count }))} /></div></Card>
                </div>
              </div>
            </div>
          );
        }}
      </QueryBoundary>
    </>
  );
}

export function SyncHealth() {
  const query = useQuery({
    queryKey: ['sync-health'],
    queryFn: async () => (await platformApi.get<{ api: Row; businesses: Row[] }>('/sync-health')).data,
    refetchInterval: 30000,
  });
  return (
    <>
      <PageHeader title="Sync health" subtitle="What the server has received. Data still waiting on a phone cannot be seen from here." />
      <QueryBoundary query={query}>
        {(data) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="API uptime" value={`${Math.floor(data.api.uptime_seconds / 3600)}h ${Math.floor((data.api.uptime_seconds % 3600) / 60)}m`} hint={humanize(data.api.node_env)} />
              <Stat label="Database response" value={`${data.api.db_latency_ms} ms`} />
              <Stat label="Email delivery" value={data.api.email_configured ? <Badge tone="good">Configured</Badge> : <Badge tone="bad">Not configured</Badge>} hint="PIN reset codes need this" />
              <Stat label="Businesses listed" value={data.businesses.length} />
            </div>
            <Card>
              <DataTable
                rows={data.businesses}
                rowKey={(row) => row.id}
                empty="No businesses yet."
                columns={[
                  { header: 'Business', cell: (row) => <Link to={`/platform/businesses/${row.id}`} className="font-semibold text-slate-900 hover:underline">{row.name}</Link> },
                  { header: 'Last data received', cell: (row) => formatDateTime(row.last_data_received) },
                  { header: 'Devices (30 days)', align: 'right', cell: (row) => row.devices_30d },
                  { header: 'Sales (24 hours)', align: 'right', cell: (row) => row.sales_24h },
                ]}
              />
            </Card>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}

function BusinessLink({ row }: { row: Row }) {
  return row.business_id ? <Link to={`/platform/businesses/${row.business_id}`} className="font-medium text-slate-900 hover:underline">{row.business_name}</Link> : <span>{row.business_name ?? '—'}</span>;
}

export function Alerts() {
  const query = useQuery({ queryKey: ['alerts'], queryFn: async () => (await platformApi.get<Record<string, Row[]>>('/alerts')).data, refetchInterval: 60000 });
  return (
    <>
      <PageHeader title="Alerts" subtitle="Patterns worth checking. These are signals, not proof of a problem." />
      <QueryBoundary query={query}>
        {(data) => {
          const total = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
          if (total === 0) return <Card><EmptyNotice>No alerts right now.</EmptyNotice></Card>;
          return (
            <div className="space-y-6">
              {data.locked_users.length > 0 ? (
                <Card title="Locked accounts">
                  <DataTable rows={data.locked_users} rowKey={(row) => row.id} columns={[
                    { header: 'User', cell: (row) => row.email },
                    { header: 'Business', cell: (row) => row.business_name ?? '—' },
                    { header: 'Locked until', cell: (row) => formatDateTime(row.locked_until) },
                  ]} />
                </Card>
              ) : null}
              {data.repeated_failed_logins.length > 0 ? (
                <Card title="Repeated failed sign-ins">
                  <DataTable rows={data.repeated_failed_logins} rowKey={(row) => row.id} columns={[
                    { header: 'User', cell: (row) => row.email },
                    { header: 'Business', cell: (row) => row.business_name ?? '—' },
                    { header: 'Failed attempts', align: 'right', cell: (row) => row.failed_login_attempts },
                  ]} />
                </Card>
              ) : null}
              {data.high_void_rates.length > 0 ? (
                <Card title="High void rate (7 days)">
                  <DataTable rows={data.high_void_rates} rowKey={(row) => row.business_id} columns={[
                    { header: 'Business', cell: (row) => <BusinessLink row={row} /> },
                    { header: 'Voided', align: 'right', cell: (row) => `${row.voided} of ${row.sales}` },
                  ]} />
                </Card>
              ) : null}
              {data.large_cash_variances.length > 0 ? (
                <Card title="Large cash differences (7 days)">
                  <DataTable rows={data.large_cash_variances} rowKey={(row) => `${row.business_id}${row.business_date}`} columns={[
                    { header: 'Business', cell: (row) => <BusinessLink row={row} /> },
                    { header: 'Date', cell: (row) => formatDate(row.business_date) },
                    { header: 'Difference', align: 'right', cell: (row) => formatMoney(row.cash_variance, row.currency) },
                  ]} />
                </Card>
              ) : null}
              {data.gone_quiet.length > 0 ? (
                <Card title="No new sales for 14 days">
                  <DataTable rows={data.gone_quiet} rowKey={(row) => row.business_id} columns={[
                    { header: 'Business', cell: (row) => <BusinessLink row={row} /> },
                    { header: 'Last sale received', cell: (row) => formatDateTime(row.last_sale) },
                  ]} />
                </Card>
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </>
  );
}
