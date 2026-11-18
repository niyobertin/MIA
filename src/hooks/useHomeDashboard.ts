import React from 'react';
import { getTodayDateString, getWeekStartDateString } from '@/utils/formatters';
import { combineDateAndTime, toLocalDateString } from '@/utils/periodBounds';
import { seriesForPeriod } from '@/services/financial/books';
import { formatSessionDuration, sessionElapsedMs } from '@/services/books/session';
import {
  useDashboardStats,
  useLowStockProducts,
  useSales,
  useCustomersWithBalances,
  usePeriodStats,
  useOpenDailyClosing,
  useBusinessUsers,
  PeriodRange,
} from '@/hooks/useData';

export type DashPeriod = 'today' | 'openDay' | 'week' | 'month' | 'year' | 'custom';

export type ChartBar = {
  date: string;
  label: string;
  displayLabel: string;
  total: number;
  isToday: boolean;
};

function yearStartIso(): string {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), 0, 1));
}

function monthStartIso(): string {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

function rangeForPeriod(
  period: DashPeriod,
  openDayStart: string | null,
  custom: PeriodRange | null,
  sessionId?: string | null
): PeriodRange | null {
  const today = getTodayDateString();
  switch (period) {
    case 'openDay':
      return openDayStart ? { start: openDayStart, end: today, sessionId: sessionId ?? null } : null;
    case 'today':
      return { start: today, end: today };
    case 'week':
      return { start: getWeekStartDateString(), end: today };
    case 'month':
      return { start: monthStartIso(), end: today };
    case 'year':
      return { start: yearStartIso(), end: today };
    case 'custom':
      return custom ?? { start: today, end: today };
  }
}

function compressChartBars(
  bars: { date: string; label: string; total: number; isToday: boolean }[]
): ChartBar[] {
  if (bars.length <= 45) return bars.map((b) => ({ ...b, displayLabel: b.label }));
  const byMonth = new Map<string, number>();
  for (const bar of bars) {
    const key = bar.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + bar.total);
  }
  const todayMonth = getTodayDateString().slice(0, 7);
  return [...byMonth.entries()].map(([month, total]) => ({
    date: month,
    label: month.slice(5),
    displayLabel: month.slice(5),
    total,
    isToday: month === todayMonth,
  }));
}

export function useHomeDashboard() {
  const today = getTodayDateString();
  const [period, setPeriod] = React.useState<DashPeriod>('openDay');
  const [customApplied, setCustomApplied] = React.useState<PeriodRange | null>(null);

  const openClosingQuery = useOpenDailyClosing();
  const openSession = openClosingQuery.data?.status === 'open' ? openClosingQuery.data : null;
  const openDayStart = openSession?.business_date?.slice(0, 10) ?? null;
  const openSessionId = openSession?.id ?? null;

  React.useEffect(() => {
    if (period === 'openDay' && !openDayStart && openClosingQuery.isFetched) {
      setPeriod('today');
    }
  }, [period, openDayStart, openClosingQuery.isFetched]);

  const range = React.useMemo(
    () =>
      rangeForPeriod(
        period,
        openDayStart,
        period === 'custom' ? customApplied : null,
        openSessionId
      ),
    [period, openDayStart, openSessionId, customApplied]
  );

  const statsQuery = useDashboardStats();
  const periodStatsQuery = usePeriodStats(range);
  const lowStockQuery = useLowStockProducts();
  const salesQuery = useSales(range);
  const debtQuery = useCustomersWithBalances();
  const usersQuery = useBusinessUsers();

  const dashStats = statsQuery.data;
  const periodStats = periodStatsQuery.data;
  const loading =
    period === 'openDay' ? statsQuery.isLoading && !dashStats : periodStatsQuery.isLoading && !periodStats;

  const userMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersQuery.data ?? []) map.set(u.id, u.name);
    return map;
  }, [usersQuery.data]);

  const salesTotal =
    period === 'openDay'
      ? (dashStats?.sessionSales ?? dashStats?.todaySales ?? 0)
      : period === 'today'
        ? (dashStats?.calendarTodaySales ?? periodStats?.totalSales ?? 0)
        : (periodStats?.totalSales ?? 0);
  const netProfit = period === 'openDay' ? (dashStats?.todayNetProfit ?? 0) : (periodStats?.netProfit ?? 0);
  const expectedCash =
    period === 'openDay'
      ? (dashStats?.cashBalance ?? 0)
      : (periodStats?.expectedCash ?? dashStats?.cashBalance ?? 0);
  const itemsSold = period === 'openDay' ? (dashStats?.itemsSold ?? 0) : (periodStats?.itemsSold ?? 0);
  const hasOpenDay = !!openDayStart || !!dashStats?.hasOpenDay;
  const sessionOpenedAt = openSession?.opened_at ?? dashStats?.sessionOpenedAt ?? null;
  const sessionDuration = sessionOpenedAt ? formatSessionDuration(sessionElapsedMs(sessionOpenedAt)) : null;
  const sessionNumber = openSession?.session_number ?? dashStats?.sessionNumber ?? null;
  const totalDebt = debtQuery.data?.totalOutstanding ?? 0;

  const cashSales = periodStats?.checkout?.cash ?? (period === 'openDay' ? (dashStats?.cashSales ?? 0) : 0);
  const momoSales = periodStats?.checkout?.mobileMoney ?? 0;
  const bankSales = periodStats?.checkout?.bank ?? 0;
  const creditSales = periodStats?.creditSales ?? 0;
  const totalCollected = cashSales + momoSales + bankSales;
  const debtCollected =
    (periodStats?.collections?.cash ?? 0) +
    (periodStats?.collections?.mobileMoney ?? 0) +
    (periodStats?.collections?.bank ?? 0);

  const chartBars = React.useMemo(() => {
    if (!range) return [];
    return compressChartBars(
      seriesForPeriod(
        (salesQuery.data ?? []).map((s) => ({
          sale_date: s.sale_date,
          created_at: s.created_at,
          total_amount: s.total_amount,
          voided: s.voided,
        })),
        range.start,
        range.end,
        today
      )
    );
  }, [salesQuery.data, range, today]);

  const delta = period === 'openDay' || period === 'today' ? (dashStats?.salesDelta ?? null) : null;

  const applyCustomRange = (startDate: string, endDate: string) => {
    setCustomApplied({
      start: combineDateAndTime(startDate, '00:00', '00:00'),
      end: combineDateAndTime(endDate, '23:59', '23:59'),
    });
    setPeriod('custom');
  };

  const refresh = async () => {
    await Promise.all([
      statsQuery.refetch(),
      periodStatsQuery.refetch(),
      openClosingQuery.refetch(),
      lowStockQuery.refetch(),
      salesQuery.refetch(),
      debtQuery.refetch(),
      usersQuery.refetch(),
    ]);
  };

  return {
    period,
    setPeriod,
    range,
    openDayStart,
    applyCustomRange,
    refresh,
    loading,
    hasOpenDay,
    sessionNumber,
    sessionDuration,
    salesTotal,
    netProfit,
    expectedCash,
    itemsSold,
    totalDebt,
    delta,
    breakdown: { cashSales, momoSales, bankSales, creditSales, totalCollected, debtCollected },
    chartBars,
    chartLoading: salesQuery.isLoading,
    sales: salesQuery.data ?? [],
    salesLoading: salesQuery.isLoading,
    lowStock: lowStockQuery.data ?? [],
    debtors: (debtQuery.data?.rows ?? []).filter((row) => row.outstanding > 0).slice(0, 5),
    userMap,
  };
}
