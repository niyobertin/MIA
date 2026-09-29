import { resolvePeriodBounds } from '@/utils/periodBounds';
import {
  calculateAverageTransactionValue,
  calculateExpectedCash,
  calculateGrossMargin,
  calculateGrossProfit,
  calculateNetProfit,
  salesRevenue,
} from './calculations';

export interface MethodTotals {
  cash: number;
  mobileMoney: number;
  bank: number;
}

export interface TopProductLine {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  margin: number;
}

export interface PeriodBooksInput {
  totalSales: number;
  tax: number;
  cogs: number;
  expenses: number;
  damagedValue: number;
  adjustmentOutValue: number;
  adjustmentInValue: number;
  itemsSold: number;
  transactionCount: number;
  checkout: MethodTotals;
  creditSales: number;
  collections: MethodTotals;
  otherIncome: MethodTotals;
  supplierPayments: MethodTotals;
  cashPurchases: number;
  cashExpenses: number;
  withdrawals: number;
  openingCash: number;
  topProducts: TopProductLine[];
  stockValueNow: number;
  stockValueAtEnd: number;
}

export interface PeriodBooks extends PeriodBooksInput {
  revenue: number;
  grossProfit: number;
  grossMargin: number;
  inventoryLoss: number;
  netProfit: number;
  averageSale: number;
  expectedCash: number;
  /** Stock value at the end of the selected period. Same figure as stockValueAtEnd. */
  stockValue: number;
}

export function emptyMethods(): MethodTotals {
  return { cash: 0, mobileMoney: 0, bank: 0 };
}

export function assembleBooks(input: PeriodBooksInput): PeriodBooks {
  const revenue = salesRevenue(input.totalSales, input.tax);
  const grossProfit = calculateGrossProfit(revenue, input.cogs);
  const inventoryLoss = input.damagedValue + input.adjustmentOutValue - input.adjustmentInValue;
  const netProfit = calculateNetProfit(grossProfit, input.expenses, inventoryLoss);
  return {
    ...input,
    revenue,
    grossProfit,
    grossMargin: calculateGrossMargin(grossProfit, revenue),
    inventoryLoss,
    netProfit,
    averageSale: calculateAverageTransactionValue(input.totalSales, input.transactionCount),
    expectedCash: calculateExpectedCash(
      input.openingCash,
      input.checkout.cash,
      input.collections.cash,
      input.otherIncome.cash,
      input.cashPurchases,
      input.cashExpenses,
      input.supplierPayments.cash,
      input.withdrawals
    ),
    stockValue: input.stockValueAtEnd,
  };
}

export interface SeriesSale {
  sale_date: string;
  created_at?: string;
  total_amount: number;
  voided?: boolean;
}

export interface DayBar {
  date: string;
  label: string;
  total: number;
  isToday: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function datesInclusive(start: string, end: string, max = 400): string[] {
  const [ys, ms, ds] = start.slice(0, 10).split('-').map(Number);
  const [ye, me, de] = end.slice(0, 10).split('-').map(Number);
  if (!ys || !ms || !ds || !ye || !me || !de) return [];
  const cur = new Date(ys, ms - 1, ds);
  const last = new Date(ye, me - 1, de);
  const out: string[] = [];
  while (cur <= last && out.length < max) {
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Bars for exactly the selected period. Voided sales are left out, so the bars add up to period sales. */
export function seriesForPeriod(sales: SeriesSale[], start: string, end: string, today = ''): DayBar[] {
  const bounds = resolvePeriodBounds(start, end);
  const useCreated = bounds.mode === 'datetime';
  const days = datesInclusive(bounds.start, bounds.end);
  const byDate = new Map<string, number>();
  for (const sale of sales) {
    if (sale.voided) continue;
    const raw = useCreated ? (sale.created_at ?? sale.sale_date) : sale.sale_date;
    if (!raw) continue;
    const day = String(raw).slice(0, 10);
    byDate.set(day, (byDate.get(day) ?? 0) + (sale.total_amount ?? 0));
  }
  return days.map((date) => ({
    date,
    label: days.length > 14 ? date.slice(8) : date.slice(5),
    total: byDate.get(date) ?? 0,
    isToday: date === today,
  }));
}
