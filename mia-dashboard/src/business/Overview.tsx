import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, ArrowRight, Boxes, ClipboardList, HandCoins, LayoutDashboard, PackageOpen, PieChart, ReceiptText, ShoppingCart, TrendingUp, Wallet, Warehouse, type LucideIcon } from 'lucide-react';
import { api } from '../lib/auth';
import { formatDateTime, formatDay, formatMoney, formatNumber, humanize } from '../lib/format';
import { BarList, ChartCard, TrendChart } from '../ui/charts';
import { Badge, Card, DataTable, ErrorNotice, PageHeader, type Column } from '../ui/kit';
import { MetricCard, MetricGrid, percentChange } from '../ui/metrics';
import { ChartCardSkeleton, TableSectionSkeleton } from '../ui/skeleton';
import { PeriodFilter, type PeriodValue } from '../ui/PeriodFilter';
import { useDashboard } from './BusinessApp';
import type { ReportPdfInput } from '../lib/pdf';
import { ExportMenu } from '../ui/ExportMenu';

export type OverviewData = {
  kpis: {
    sales_total: number; sales_count: number; previous_sales_total: number; cogs: number; gross_profit: number; expenses: number;
    net_profit: number; payments_received: number; outstanding: number; low_stock_count: number; stock_value: number;
  };
  trend: { day: string; total: number }[];
  categories: { category: string; total: number }[];
  unpaid: { id: string; reference: string | null; customer: string | null; total: number; paid: number; status: string; at: string }[];
  transactions: { id: string; kind: string; description: string; amount: number; at: string }[];
  low_stock: { id: string; name: string; unit: string; stock: number; reorder_level: number }[];
  movements: { id: string; at: string; type: string; quantity: number; product: string | null; user: string | null }[];
};

type Kpis = OverviewData['kpis'];
type Money = (value: number) => string;

function OverviewKpis({ kpis, trend, money }: { kpis?: Kpis; trend?: OverviewData['trend']; money: Money }) {
  const loading = !kpis;
  const k = kpis ?? ({} as Kpis);
  const spark = trend?.map((point) => point.total);
  return (
    <div className="space-y-4">
      <MetricGrid>
        <MetricCard loading={loading} icon={ShoppingCart} tone="green" label="Sales" value={money(k.sales_total)} spark={spark}
          growth={kpis ? percentChange(k.sales_total, k.previous_sales_total) : null}
          hint={kpis ? `${formatNumber(k.sales_count)} sales${k.previous_sales_total === 0 ? ' · none in the previous period' : ''}` : undefined} />
        <MetricCard loading={loading} icon={TrendingUp} tone="blue" label="Net profit" value={money(k.net_profit)} valueTone={k.net_profit < 0 ? 'bad' : 'default'}
          hint={kpis ? `Gross ${money(k.gross_profit)} less expenses` : undefined} />
        <MetricCard loading={loading} icon={Wallet} tone="violet" label="Payments received" value={money(k.payments_received)} hint="Sale and customer payments in this period" />
        <MetricCard loading={loading} icon={HandCoins} tone="amber" label="Outstanding balance" value={money(k.outstanding)} hint="All unpaid sales, any date" />
      </MetricGrid>
      <MetricGrid>
        <MetricCard loading={loading} icon={ReceiptText} tone="red" label="Expenses" value={money(k.expenses)} hint="Recorded in this period" />
        <MetricCard loading={loading} icon={PackageOpen} tone="slate" label="Cost of goods sold" value={money(k.cogs)} hint="At average cost when sold" />
        <MetricCard loading={loading} icon={Warehouse} tone="blue" label="Stock value" value={money(k.stock_value)} hint="Current stock at average cost" />
        <MetricCard loading={loading} icon={AlertTriangle} tone={k.low_stock_count > 0 ? 'amber' : 'green'} label="Low-stock items" value={formatNumber(k.low_stock_count)} hint="At or below reorder level" />
      </MetricGrid>
    </div>
  );
}

function ViewAll({ to, show = true }: { to: string; show?: boolean }) {
  if (!show) return null;
  return <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark">View all <ArrowRight size={13} aria-hidden /></Link>;
}

const dateCell = (value: string) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(value)}</span>;

function unpaidColumns(money: Money): Column<OverviewData['unpaid'][number]>[] {
  return [
    { header: 'Sale', cell: (row) => <div><div className="font-semibold text-slate-900">{row.reference ?? 'Sale'}</div><div className="text-xs text-slate-500">{row.customer ?? 'Walk-in'}</div></div> },
    { header: 'Status', cell: (row) => <Badge tone={row.status === 'partial' ? 'info' : 'warn'}>{humanize(row.status)}</Badge> },
    { header: 'Balance', align: 'right', cell: (row) => <span className="font-semibold text-slate-900">{money(row.total - row.paid)}</span> },
    { header: 'Date', cell: (row) => dateCell(row.at) },
  ];
}

const KIND_TONE: Record<string, 'good' | 'info' | 'bad' | 'neutral'> = { Sale: 'good', Payment: 'info', Expense: 'bad', Purchase: 'neutral' };
const OUTFLOW_KINDS = new Set(['Expense', 'Purchase']);

function transactionColumns(money: Money): Column<OverviewData['transactions'][number]>[] {
  return [
    { header: 'Transaction', cell: (row) => <div className="flex items-center gap-2.5"><Badge tone={KIND_TONE[row.kind] ?? 'neutral'}>{row.kind}</Badge><span className="font-medium text-slate-900">{humanize(row.description)}</span></div> },
    { header: 'Amount', align: 'right', cell: (row) => <span className={`font-semibold ${OUTFLOW_KINDS.has(row.kind) ? 'text-rose-700' : 'text-slate-900'}`}>{OUTFLOW_KINDS.has(row.kind) ? '−' : ''}{money(row.amount)}</span> },
    { header: 'Date', cell: (row) => dateCell(row.at) },
  ];
}

const lowStockColumns: Column<OverviewData['low_stock'][number]>[] = [
  { header: 'Product', cell: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  { header: 'In stock', align: 'right', cell: (row) => <Badge tone={row.stock <= 0 ? 'bad' : 'warn'}>{row.stock} {row.unit}</Badge> },
  { header: 'Reorder at', align: 'right', cell: (row) => formatNumber(row.reorder_level) },
];

const movementColumns: Column<OverviewData['movements'][number]>[] = [
  { header: 'Product', cell: (row) => <div><div className="font-medium text-slate-900">{row.product ?? '—'}</div><div className="text-xs text-slate-500">{row.user ?? '—'}</div></div> },
  { header: 'Type', cell: (row) => humanize(row.type) },
  { header: 'Qty', align: 'right', cell: (row) => formatNumber(row.quantity) },
  { header: 'Date', cell: (row) => dateCell(row.at) },
];

function TableSection<T>({ title, icon, data, columns, rowKey, empty, action }: { title: string; icon: LucideIcon; data: T[] | undefined; columns: Column<T>[]; rowKey: (row: T) => string; empty: string; action?: ReactNode }) {
  if (!data) return <TableSectionSkeleton columns={columns} rows={5} />;
  return (
    <Card title={title} icon={icon} action={action}>
      <DataTable empty={empty} rows={data} rowKey={rowKey} columns={columns} />
    </Card>
  );
}

function SalesCharts({ data, money }: { data?: OverviewData; money: Money }) {
  if (!data) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCardSkeleton className="lg:col-span-2" label="Loading sales by day" />
        <ChartCardSkeleton variant="list" label="Loading sales by category" />
      </div>
    );
  }
  const categoryTotal = data.categories.reduce((sum, row) => sum + row.total, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ChartCard
        title="Sales by day"
        icon={TrendingUp}
        subtitle={`${money(data.trend.reduce((sum, point) => sum + point.total, 0))} in this period`}
        className="lg:col-span-2"
        chart={<TrendChart name="Sales" format={money} tableToggle={false} points={data.trend.map((point) => ({ label: formatDay(point.day), value: point.total }))} />}
        table={(
          <DataTable pageSize={0} empty="No sales in this period." rows={data.trend} rowKey={(row) => row.day} defaultSort={{ column: 'Day', direction: 'desc' }}
            columns={[
              { header: 'Day', sortValue: (row) => row.day, cell: (row) => formatDay(row.day) },
              { header: 'Sales', align: 'right', sortValue: (row) => row.total, cell: (row) => money(row.total) },
            ]} />
        )}
      />
      <ChartCard
        title="Sales by category"
        icon={PieChart}
        chart={<BarList format={money} empty="No sales in this period." items={data.categories.map((row) => ({ label: row.category, value: row.total, hint: categoryTotal > 0 ? `${Math.round((row.total / categoryTotal) * 100)}%` : undefined }))} />}
        table={(
          <DataTable pageSize={0} empty="No sales in this period." rows={data.categories} rowKey={(row) => row.category}
            columns={[
              { header: 'Category', sortValue: (row) => row.category, cell: (row) => <span className="font-medium text-slate-900">{row.category}</span> },
              { header: 'Sales', align: 'right', sortValue: (row) => row.total, cell: (row) => money(row.total) },
              { header: 'Share', align: 'right', cell: (row) => `${categoryTotal > 0 ? Math.round((row.total / categoryTotal) * 100) : 0}%` },
            ]} />
        )}
      />
    </div>
  );
}

export function OverviewContent({ data, currency }: { data?: OverviewData; currency: string }) {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, currency);
  const can = (permission: string) => me.permissions.includes(permission);
  return (
    <div className="space-y-6">
      <OverviewKpis kpis={data?.kpis} trend={data?.trend} money={money} />
      <SalesCharts data={data} money={money} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TableSection title="Unpaid sales" icon={ClipboardList} data={data?.unpaid} columns={unpaidColumns(money)} rowKey={(row) => row.id} empty="No unpaid sales." action={<ViewAll to="/unpaid" show={can('sales')} />} />
        <TableSection title="Recent transactions" icon={ArrowLeftRight} data={data?.transactions} columns={transactionColumns(money)} rowKey={(row) => row.id} empty="No transactions yet." />
        <TableSection title="Low-stock items" icon={AlertTriangle} data={data?.low_stock} columns={lowStockColumns} rowKey={(row) => row.id} empty="Nothing is low on stock." action={<ViewAll to="/products" show={can('products')} />} />
        <TableSection title="Recent stock movements" icon={Boxes} data={data?.movements} columns={movementColumns} rowKey={(row) => row.id} empty="No stock movements yet." action={<ViewAll to="/movements" show={can('movements')} />} />
      </div>
    </div>
  );
}

function overviewReportInput(data: OverviewData, businessName: string, currency: string, period: PeriodValue): ReportPdfInput {
  const { kpis } = data;
  return ({
    businessName,
    currency,
    period,
    title: 'Dashboard summary',
    stats: [
      { label: 'Sales', value: kpis.sales_total },
      { label: 'Net profit', value: kpis.net_profit },
      { label: 'Payments received', value: kpis.payments_received },
      { label: 'Outstanding balance', value: kpis.outstanding },
      { label: 'Expenses', value: kpis.expenses },
      { label: 'Cost of goods sold', value: kpis.cogs },
      { label: 'Stock value', value: kpis.stock_value },
      { label: 'Sales count', value: kpis.sales_count, kind: 'count' },
      { label: 'Low-stock items', value: kpis.low_stock_count, kind: 'count' },
    ],
    trend: { title: 'Sales by day', labels: data.trend.map((point) => formatDay(point.day)), series: [{ name: 'Sales', color: '#059669', values: data.trend.map((point) => point.total) }] },
    tables: [
      { title: 'Sales by category', head: ['Category', 'Sales'], moneyColumns: [1], rows: data.categories.map((row) => [row.category, row.total]) },
      { title: 'Unpaid sales', head: ['Sale', 'Customer', 'Balance', 'Date'], moneyColumns: [2], rows: data.unpaid.map((row) => [row.reference ?? 'Sale', row.customer ?? 'Walk-in', row.total - row.paid, formatDateTime(row.at)]) },
      { title: 'Low-stock items', head: ['Product', 'In stock', 'Reorder at'], rightColumns: [1, 2], rows: data.low_stock.map((row) => [row.name, `${row.stock} ${row.unit}`, row.reorder_level]) },
    ],
  });
}

export function Overview() {
  const me = useDashboard();
  const [period, setPeriod] = useState<PeriodValue>({ period: 'week' });
  const query = useQuery({
    queryKey: ['overview', me.user.id, period],
    queryFn: async () => (await api.get<OverviewData>('/dashboard/overview', { params: period })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 60000,
  });
  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle={`${me.business.name} · ${me.business.currency}`}
        refreshing={query.isFetching && !query.isLoading}
        action={(
          <>
            <PeriodFilter value={period} onChange={setPeriod} className="w-full sm:w-56" />
            <ExportMenu disabled={!query.data || query.isPlaceholderData} build={() => overviewReportInput(query.data!, me.business.name, me.business.currency, period)} />
          </>
        )}
      />
      {query.isError ? <div className="mb-6"><ErrorNotice error={query.error} onRetry={() => query.refetch()} /></div> : null}
      {query.isError && !query.data ? null : <OverviewContent data={query.data} currency={me.business.currency} />}
    </>
  );
}
