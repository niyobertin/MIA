import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { api } from '../lib/auth';
import { formatDate, formatDay, formatMoney, formatNumber, humanize } from '../lib/format';
import { exportReportPdf } from '../lib/pdf';
import { EXPENSES_COLOR, methodLabel, SALES_COLOR, summaryPdfInput, type ReportSummary } from './reportPdf';
import { BarList, CurveChart, DonutChart } from '../ui/charts';
import { Badge, Button, Card, DataTable, ErrorNotice, PageHeader, QueryBoundary, Skeleton, Stat } from '../ui/kit';
import { PeriodFilter, type PeriodValue } from '../ui/PeriodFilter';
import { useDashboard } from './BusinessApp';

export function ExportPdfButton({ onExport, disabled }: { onExport: () => Promise<unknown>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        disabled={disabled || busy}
        className="inline-flex items-center gap-2"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onExport();
          } catch (caught) {
            setError(caught);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileDown size={16} aria-hidden />
        {busy ? 'Preparing…' : 'Export PDF'}
      </Button>
      {error ? <ErrorNotice error={error} /> : null}
    </div>
  );
}

function ReportContent({ data, currency }: { data: ReportSummary; currency: string }) {
  const money = (value: number) => formatMoney(value, currency);
  const { kpis } = data;
  const margin = kpis.sales_total > 0 ? Math.round((kpis.gross_profit / kpis.sales_total) * 1000) / 10 : 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Sales" value={money(kpis.sales_total)} hint={`${formatNumber(kpis.sales_count)} sales`} />
        <Stat label="Gross profit" value={money(kpis.gross_profit)} hint={`${margin}% margin · cost of goods ${money(kpis.cogs)}`} />
        <Stat label="Expenses" value={money(kpis.expenses)} />
        <Stat label="Net profit" value={<span className={kpis.net_profit < 0 ? 'text-rose-700' : ''}>{money(kpis.net_profit)}</span>} hint="Gross profit less expenses" />
        <Stat label="Cash collected" value={money(kpis.cash_collected)} hint="Sale and customer payments, all methods" />
        <Stat label="Outstanding debt" value={money(kpis.outstanding_debt)} hint="All unpaid sales, any date" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Sales vs expenses" className="lg:col-span-2 min-w-0">
          <div className="p-5">
            <CurveChart
              name="Sales and expenses"
              format={money}
              labels={data.daily.map((row) => formatDay(row.day))}
              series={[
                { name: 'Sales', color: SALES_COLOR, values: data.daily.map((row) => row.sales) },
                { name: 'Expenses', color: EXPENSES_COLOR, values: data.daily.map((row) => row.expenses) },
              ]}
            />
          </div>
        </Card>
        <Card title="Payment methods" className="min-w-0">
          <div className="p-5">
            <DonutChart format={money} centerLabel="Collected" empty="No payments in this period." items={data.payment_methods.map((row) => ({ label: methodLabel(row.method), value: row.total }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top products" className="min-w-0">
          <div className="p-5">
            <BarList format={money} empty="No sales in this period." items={data.products.map((row) => ({ label: row.product, value: row.total, hint: `× ${formatNumber(row.quantity)}` }))} />
          </div>
        </Card>
        <Card title="Sales by category" className="min-w-0">
          <div className="p-5">
            <BarList format={money} empty="No sales in this period." items={data.categories.map((row) => ({ label: row.category, value: row.total }))} />
          </div>
        </Card>
      </div>

      <Card title="Daily closings" className="min-w-0">
        <DataTable
          rows={data.closings}
          rowKey={(row) => row.id}
          empty="No days were closed in this period."
          columns={[
            { header: 'Date', cell: (row) => <span className="font-medium text-slate-900 whitespace-nowrap">{formatDate(row.business_date)} #{row.session_number}</span> },
            { header: 'Status', cell: (row) => <Badge tone={row.status === 'closed' ? 'good' : 'info'}>{humanize(row.status)}</Badge> },
            { header: 'Sales', align: 'right', cell: (row) => money(row.total_sales) },
            { header: 'Gross profit', align: 'right', cell: (row) => money(row.gross_profit) },
            { header: 'Expenses', align: 'right', cell: (row) => money(row.expenses) },
            { header: 'Net profit', align: 'right', cell: (row) => money(row.net_profit) },
            { header: 'Cash variance', align: 'right', cell: (row) => row.cash_variance === 0 ? money(0) : <span className="font-semibold text-rose-700">{money(row.cash_variance)}</span> },
          ]}
        />
      </Card>
    </div>
  );
}

export function Reports() {
  const me = useDashboard();
  const [period, setPeriod] = useState<PeriodValue>({ period: '30d' });
  const query = useQuery({
    queryKey: ['report-summary', me.user.id, period],
    queryFn: async () => (await api.get<ReportSummary>('/dashboard/reports/summary', { params: period })).data,
  });
  return (
    <>
      <PageHeader
        title="Business reports"
        subtitle={`${me.business.name} · sales, profit and daily closings`}
        action={(
          <div className="flex flex-wrap items-start gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <ExportPdfButton disabled={!query.data} onExport={() => exportReportPdf(summaryPdfInput(query.data!, me.business.name, me.business.currency, period))} />
          </div>
        )}
      />
      <QueryBoundary query={query} skeleton={<Skeleton className="h-96" />}>
        {(data) => <ReportContent data={data} currency={me.business.currency} />}
      </QueryBoundary>
    </>
  );
}
