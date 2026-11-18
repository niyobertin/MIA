import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatDateTime, formatDay, formatMoney, humanize } from '../lib/format';
import { BarList, TrendChart } from '../ui/charts';
import { Badge, Card, DataTable, PageHeader, QueryBoundary, Skeleton, Stat } from '../ui/kit';
import { PeriodFilter, type PeriodValue } from '../ui/PeriodFilter';
import { useDashboard } from './BusinessApp';
import { exportReportPdf } from '../lib/pdf';
import { ExportPdfButton } from './reports';

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

function salesChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 'No change from the previous period' : 'No sales in the previous period';
  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  return `${change > 0 ? '+' : ''}${change}% from the previous period`;
}

export function OverviewContent({ data, currency }: { data: OverviewData; currency: string }) {
  const money = (value: number) => formatMoney(value, currency);
  const { kpis } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales" value={money(kpis.sales_total)} hint={`${kpis.sales_count} sales · ${salesChange(kpis.sales_total, kpis.previous_sales_total)}`} />
        <Stat label="Net profit" value={money(kpis.net_profit)} hint={`Gross ${money(kpis.gross_profit)} less expenses ${money(kpis.expenses)}`} />
        <Stat label="Payments received" value={money(kpis.payments_received)} hint="Sale and customer payments in this period" />
        <Stat label="Outstanding balance" value={money(kpis.outstanding)} hint="All unpaid sales, any date" />
        <Stat label="Expenses" value={money(kpis.expenses)} />
        <Stat label="Cost of goods sold" value={money(kpis.cogs)} />
        <Stat label="Stock value" value={money(kpis.stock_value)} hint="At average cost" />
        <Stat label="Low-stock items" value={kpis.low_stock_count} hint="At or below reorder level" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Sales by day" className="lg:col-span-2">
          <div className="p-5"><TrendChart name="Sales" format={money} points={data.trend.map((point) => ({ label: formatDay(point.day), value: point.total }))} /></div>
        </Card>
        <Card title="Sales by category">
          <div className="p-5"><BarList format={money} empty="No sales in this period." items={data.categories.map((row) => ({ label: row.category, value: row.total }))} /></div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Unpaid sales">
          <DataTable
            empty="No unpaid sales."
            rows={data.unpaid}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Sale', cell: (row) => <div><div className="font-semibold text-slate-900">{row.reference ?? 'Sale'}</div><div className="text-xs text-slate-500">{row.customer ?? 'Walk-in'}</div></div> },
              { header: 'Balance', align: 'right', cell: (row) => <span className="font-semibold text-slate-900">{money(row.total - row.paid)}</span> },
              { header: 'Date', cell: (row) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(row.at)}</span> },
            ]}
          />
        </Card>
        <Card title="Recent transactions">
          <DataTable
            empty="No transactions yet."
            rows={data.transactions}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Transaction', cell: (row) => <div><div className="font-medium text-slate-900">{humanize(row.description)}</div><div className="text-xs text-slate-500">{row.kind}</div></div> },
              { header: 'Amount', align: 'right', cell: (row) => money(row.amount) },
              { header: 'Date', cell: (row) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(row.at)}</span> },
            ]}
          />
        </Card>
        <Card title="Low-stock items">
          <DataTable
            empty="Nothing is low on stock."
            rows={data.low_stock}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Product', cell: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
              { header: 'In stock', align: 'right', cell: (row) => <Badge tone={row.stock <= 0 ? 'bad' : 'warn'}>{row.stock} {row.unit}</Badge> },
              { header: 'Reorder at', align: 'right', cell: (row) => row.reorder_level },
            ]}
          />
        </Card>
        <Card title="Recent stock movements">
          <DataTable
            empty="No stock movements yet."
            rows={data.movements}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Product', cell: (row) => <div><div className="font-medium text-slate-900">{row.product ?? '—'}</div><div className="text-xs text-slate-500">{row.user ?? '—'}</div></div> },
              { header: 'Type', cell: (row) => humanize(row.type) },
              { header: 'Qty', align: 'right', cell: (row) => row.quantity },
              { header: 'Date', cell: (row) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(row.at)}</span> },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function exportOverviewPdf(data: OverviewData, businessName: string, currency: string, period: PeriodValue) {
  const { kpis } = data;
  return exportReportPdf({
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
  const [period, setPeriod] = useState<PeriodValue>({ period: '7d' });
  const query = useQuery({
    queryKey: ['overview', me.user.id, period],
    queryFn: async () => (await api.get<OverviewData>('/dashboard/overview', { params: period })).data,
    refetchInterval: 60000,
  });
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${me.business.name} · ${me.business.currency}`}
        action={(
          <div className="flex flex-wrap items-start gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <ExportPdfButton disabled={!query.data} onExport={() => exportOverviewPdf(query.data!, me.business.name, me.business.currency, period)} />
          </div>
        )}
      />
      <QueryBoundary query={query} skeleton={<Skeleton className="h-96" />}>
        {(data) => <OverviewContent data={data} currency={me.business.currency} />}
      </QueryBoundary>
    </>
  );
}
