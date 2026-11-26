import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, CreditCard, FileText, HandCoins, LineChart, PieChart, ReceiptText, Scale, ShoppingCart, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { api } from '../lib/auth';
import { formatDate, formatDay, formatMoney, formatNumber, humanize } from '../lib/format';
import { ExportMenu } from '../ui/ExportMenu';
import { EXPENSES_COLOR, methodLabel, SALES_COLOR, summaryPdfInput, type ReportSummary } from './reportPdf';
import { BarList, ChartCard, CurveChart, DonutChart } from '../ui/charts';
import { Amount, Badge, Card, DataTable, ErrorNotice, PageHeader, sumBy, type Column } from '../ui/kit';
import { MetricCard, MetricGrid } from '../ui/metrics';
import { ChartCardSkeleton, TableSectionSkeleton } from '../ui/skeleton';
import { PeriodFilter, type PeriodValue } from '../ui/PeriodFilter';
import { useDashboard } from './BusinessApp';

type Money = (value: number) => string;
type Closing = ReportSummary['closings'][number];

const share = (value: number, total: number) => (total > 0 ? `${Math.round((value / total) * 100)}%` : '0%');

function closingColumns(money: Money): Column<Closing>[] {
  return [
    { header: 'Date', sortValue: (row) => `${row.business_date}#${String(row.session_number).padStart(4, '0')}`, cell: (row) => <div className="whitespace-nowrap"><div className="font-semibold text-slate-900">{formatDate(row.business_date)}</div><div className="text-xs text-slate-500">Day #{row.session_number}</div></div> },
    { header: 'Status', sortValue: (row) => row.status, cell: (row) => <Badge tone={row.status === 'closed' ? 'good' : 'info'}>{humanize(row.status)}</Badge> },
    { header: 'Sales', align: 'right', sortValue: (row) => row.total_sales, cell: (row) => <Amount value={row.total_sales} format={money} strong />, total: (rows) => <Amount value={sumBy(rows, (row) => row.total_sales)} format={money} strong /> },
    { header: 'Gross profit', align: 'right', sortValue: (row) => row.gross_profit, cell: (row) => <Amount value={row.gross_profit} format={money} signed />, total: (rows) => <Amount value={sumBy(rows, (row) => row.gross_profit)} format={money} signed /> },
    { header: 'Expenses', align: 'right', sortValue: (row) => row.expenses, cell: (row) => <Amount value={row.expenses} format={money} />, total: (rows) => <Amount value={sumBy(rows, (row) => row.expenses)} format={money} /> },
    { header: 'Net profit', align: 'right', sortValue: (row) => row.net_profit, cell: (row) => <Amount value={row.net_profit} format={money} signed />, total: (rows) => <Amount value={sumBy(rows, (row) => row.net_profit)} format={money} signed /> },
    { header: 'Cash variance', align: 'right', sortValue: (row) => row.cash_variance, cell: (row) => <Amount value={row.cash_variance} format={money} signed />, total: (rows) => <Amount value={sumBy(rows, (row) => row.cash_variance)} format={money} signed /> },
  ];
}

function ReportKpis({ kpis, money }: { kpis?: ReportSummary['kpis']; money: Money }) {
  const loading = !kpis;
  const k = kpis ?? ({} as ReportSummary['kpis']);
  const margin = kpis && k.sales_total > 0 ? Math.round((k.gross_profit / k.sales_total) * 1000) / 10 : 0;
  return (
    <MetricGrid columns={3}>
      <MetricCard loading={loading} icon={ShoppingCart} tone="green" label="Total sales" value={money(k.sales_total)} hint={kpis ? `${formatNumber(k.sales_count)} sales in this period` : undefined} />
      <MetricCard loading={loading} icon={TrendingUp} tone="blue" label="Gross profit" value={money(k.gross_profit)} valueTone={k.gross_profit < 0 ? 'bad' : 'default'} hint={kpis ? `${margin}% margin · cost of goods ${money(k.cogs)}` : undefined} />
      <MetricCard loading={loading} icon={ReceiptText} tone="red" label="Expenses" value={money(k.expenses)} hint="Business costs recorded in this period" />
      <MetricCard loading={loading} icon={Scale} tone={k.net_profit < 0 ? 'red' : 'green'} label="Net profit" value={money(k.net_profit)} valueTone={k.net_profit < 0 ? 'bad' : k.net_profit > 0 ? 'good' : 'default'} hint="Gross profit less expenses" />
      <MetricCard loading={loading} icon={Wallet} tone="violet" label="Cash collected" value={money(k.cash_collected)} hint="Sale and customer payments, all methods" />
      <MetricCard loading={loading} icon={HandCoins} tone="amber" label="Outstanding debt" value={money(k.outstanding_debt)} hint="All unpaid sales, any date" />
    </MetricGrid>
  );
}

function ReportCharts({ data, money }: { data?: ReportSummary; money: Money }) {
  if (!data) {
    return (
      <>
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCardSkeleton className="lg:col-span-2" label="Loading sales and expenses" />
          <ChartCardSkeleton variant="donut" label="Loading payment methods" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCardSkeleton variant="list" label="Loading top products" />
          <ChartCardSkeleton variant="list" label="Loading sales by category" />
        </div>
      </>
    );
  }
  const collected = data.payment_methods.reduce((sum, row) => sum + row.total, 0);
  const categoryTotal = data.categories.reduce((sum, row) => sum + row.total, 0);
  const totals = data.daily.reduce((acc, row) => ({ sales: acc.sales + row.sales, expenses: acc.expenses + row.expenses }), { sales: 0, expenses: 0 });
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Sales vs expenses"
          icon={LineChart}
          subtitle={`Sales ${money(totals.sales)} · Expenses ${money(totals.expenses)}`}
          className="lg:col-span-2"
          chart={(
            <CurveChart
              name="Sales and expenses"
              format={money}
              tableToggle={false}
              labels={data.daily.map((row) => formatDay(row.day))}
              series={[
                { name: 'Sales', color: SALES_COLOR, values: data.daily.map((row) => row.sales) },
                { name: 'Expenses', color: EXPENSES_COLOR, values: data.daily.map((row) => row.expenses) },
              ]}
            />
          )}
          table={(
            <DataTable pageSize={0} rows={data.daily} rowKey={(row) => row.day} empty="No activity in this period." defaultSort={{ column: 'Day', direction: 'desc' }}
              columns={[
                { header: 'Day', sortValue: (row) => row.day, cell: (row) => formatDay(row.day) },
                { header: 'Sales', align: 'right', sortValue: (row) => row.sales, cell: (row) => money(row.sales), total: (rows) => money(sumBy(rows, (row) => row.sales)) },
                { header: 'Expenses', align: 'right', sortValue: (row) => row.expenses, cell: (row) => money(row.expenses), total: (rows) => money(sumBy(rows, (row) => row.expenses)) },
                { header: 'Difference', align: 'right', sortValue: (row) => row.sales - row.expenses, cell: (row) => <Amount value={row.sales - row.expenses} format={money} signed />, total: (rows) => <Amount value={sumBy(rows, (row) => row.sales - row.expenses)} format={money} signed /> },
              ]} />
          )}
        />
        <ChartCard
          title="Payment methods"
          icon={CreditCard}
          chart={<DonutChart format={money} centerLabel="Collected" empty="No payments in this period." items={data.payment_methods.map((row) => ({ label: methodLabel(row.method), value: row.total }))} />}
          table={(
            <DataTable pageSize={0} rows={data.payment_methods} rowKey={(row) => row.method} empty="No payments in this period."
              columns={[
                { header: 'Method', cell: (row) => <span className="font-medium text-slate-900">{methodLabel(row.method)}</span> },
                { header: 'Payments', align: 'right', sortValue: (row) => row.count, cell: (row) => formatNumber(row.count), total: (rows) => formatNumber(sumBy(rows, (row) => row.count)) },
                { header: 'Amount', align: 'right', sortValue: (row) => row.total, cell: (row) => money(row.total), total: (rows) => money(sumBy(rows, (row) => row.total)) },
                { header: 'Share', align: 'right', cell: (row) => share(row.total, collected), total: (rows) => share(sumBy(rows, (row) => row.total), collected) },
              ]} />
          )}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Top products"
          icon={Trophy}
          chart={<BarList format={money} empty="No sales in this period." items={data.products.map((row) => ({ label: row.product, value: row.total, hint: `× ${formatNumber(row.quantity)}` }))} />}
          table={(
            <DataTable pageSize={0} rows={data.products} rowKey={(row) => row.product} empty="No sales in this period."
              columns={[
                { header: 'Product', sortValue: (row) => row.product, cell: (row) => <span className="font-medium text-slate-900">{row.product}</span> },
                { header: 'Quantity', align: 'right', sortValue: (row) => row.quantity, cell: (row) => formatNumber(row.quantity), total: (rows) => formatNumber(sumBy(rows, (row) => row.quantity)) },
                { header: 'Sales', align: 'right', sortValue: (row) => row.total, cell: (row) => money(row.total), total: (rows) => money(sumBy(rows, (row) => row.total)) },
              ]} />
          )}
        />
        <ChartCard
          title="Sales by category"
          icon={PieChart}
          chart={<BarList format={money} empty="No sales in this period." items={data.categories.map((row) => ({ label: row.category, value: row.total, hint: share(row.total, categoryTotal) }))} />}
          table={(
            <DataTable pageSize={0} rows={data.categories} rowKey={(row) => row.category} empty="No sales in this period."
              columns={[
                { header: 'Category', sortValue: (row) => row.category, cell: (row) => <span className="font-medium text-slate-900">{row.category}</span> },
                { header: 'Sales', align: 'right', sortValue: (row) => row.total, cell: (row) => money(row.total), total: (rows) => money(sumBy(rows, (row) => row.total)) },
                { header: 'Share', align: 'right', cell: (row) => share(row.total, categoryTotal), total: (rows) => share(sumBy(rows, (row) => row.total), categoryTotal) },
              ]} />
          )}
        />
      </div>
    </>
  );
}

function DailyClosings({ closings, money }: { closings?: Closing[]; money: Money }) {
  const columns = closingColumns(money);
  if (!closings) return <TableSectionSkeleton columns={columns} rows={6} />;
  const variance = closings.reduce((sum, row) => sum + row.cash_variance, 0);
  return (
    <Card
      title="Daily closings"
      icon={CalendarCheck}
      subtitle={closings.length > 0 ? `${formatNumber(closings.length)} closings · total cash variance ${variance > 0 ? '+' : ''}${money(variance)}` : undefined}
    >
      <DataTable rows={closings} rowKey={(row) => row.id} empty="No days were closed in this period." columns={columns} defaultSort={{ column: 'Date', direction: 'desc' }} />
    </Card>
  );
}

function ReportContent({ data, currency }: { data?: ReportSummary; currency: string }) {
  const money = (value: number) => formatMoney(value, currency);
  return (
    <div className="space-y-6">
      <ReportKpis kpis={data?.kpis} money={money} />
      <ReportCharts data={data} money={money} />
      <DailyClosings closings={data?.closings} money={money} />
    </div>
  );
}

export function Reports() {
  const me = useDashboard();
  const [period, setPeriod] = useState<PeriodValue>({ period: 'month' });
  const query = useQuery({
    queryKey: ['report-summary', me.user.id, period],
    queryFn: async () => (await api.get<ReportSummary>('/dashboard/reports/summary', { params: period })).data,
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        icon={FileText}
        title="Business reports"
        subtitle={`${me.business.name} · sales, profit and daily closings in ${me.business.currency}`}
        refreshing={query.isFetching && !query.isLoading}
        action={(
          <>
            <PeriodFilter value={period} onChange={setPeriod} className="w-full sm:w-56" />
            <ExportMenu disabled={!query.data || query.isPlaceholderData} build={() => summaryPdfInput(query.data!, me.business.name, me.business.currency, period)} />
          </>
        )}
      />
      {query.isError ? <div className="mb-6"><ErrorNotice error={query.error} onRetry={() => query.refetch()} /></div> : null}
      {query.isError && !query.data ? null : <ReportContent data={query.data} currency={me.business.currency} />}
    </>
  );
}
