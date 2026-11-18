import type { ReportPdfInput } from '../lib/pdf';
import { formatDate, formatDay, formatNumber, humanize } from '../lib/format';
import { CHART_COLORS } from '../ui/chartUtils';
import type { PeriodValue } from '../ui/PeriodFilter';

export type ReportSummary = {
  range: { from: string; to: string; days: number; timezone: string };
  kpis: {
    sales_total: number; sales_count: number; cogs: number; gross_profit: number; expenses: number;
    net_profit: number; cash_collected: number; outstanding_debt: number;
  };
  daily: { day: string; sales: number; expenses: number }[];
  payment_methods: { method: string; count: number; total: number }[];
  products: { product: string; quantity: number; total: number }[];
  categories: { category: string; total: number }[];
  closings: {
    id: string; business_date: string; session_number: number; status: string; total_sales: number; gross_profit: number;
    expenses: number; net_profit: number; expected_cash: number; actual_cash: number; cash_variance: number;
  }[];
};

export const METHOD_LABELS: Record<string, string> = { cash: 'Cash', mobile_money: 'Mobile money', bank: 'Bank', credit: 'Credit' };
export const methodLabel = (method: string) => METHOD_LABELS[method] ?? humanize(method);
export const SALES_COLOR = CHART_COLORS[0];
export const EXPENSES_COLOR = CHART_COLORS[2];

export function summaryPdfInput(data: ReportSummary, businessName: string, currency: string, period: PeriodValue): ReportPdfInput {
  const { kpis } = data;
  return {
    businessName,
    currency,
    period,
    title: 'Business report',
    stats: [
      { label: 'Sales', value: kpis.sales_total },
      { label: 'Gross profit', value: kpis.gross_profit },
      { label: 'Expenses', value: kpis.expenses },
      { label: 'Net profit', value: kpis.net_profit },
      { label: 'Cash collected', value: kpis.cash_collected },
      { label: 'Outstanding debt', value: kpis.outstanding_debt },
    ],
    trend: {
      title: 'Sales vs expenses',
      labels: data.daily.map((row) => formatDay(row.day)),
      series: [
        { name: 'Sales', color: SALES_COLOR, values: data.daily.map((row) => row.sales) },
        { name: 'Expenses', color: EXPENSES_COLOR, values: data.daily.map((row) => row.expenses) },
      ],
    },
    tables: [
      { title: 'Payment methods', head: ['Method', 'Payments', 'Amount'], rightColumns: [1], moneyColumns: [2], rows: data.payment_methods.map((row) => [methodLabel(row.method), formatNumber(row.count), row.total]) },
      { title: 'Top products', head: ['Product', 'Quantity', 'Sales'], rightColumns: [1], moneyColumns: [2], rows: data.products.map((row) => [row.product, formatNumber(row.quantity), row.total]) },
      { title: 'Sales by category', head: ['Category', 'Sales'], moneyColumns: [1], rows: data.categories.map((row) => [row.category, row.total]) },
      {
        title: 'Daily closings',
        head: ['Date', 'Status', 'Sales', 'Gross profit', 'Expenses', 'Net profit', 'Cash variance'],
        moneyColumns: [2, 3, 4, 5, 6],
        rows: data.closings.map((row) => [`${formatDate(row.business_date)} #${row.session_number}`, humanize(row.status), row.total_sales, row.gross_profit, row.expenses, row.net_profit, row.cash_variance]),
      },
    ],
  };
}

