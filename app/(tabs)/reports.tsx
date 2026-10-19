import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { StatCard } from '@/components/StatCard';
import { MoneyText } from '@/components/MoneyText';
import { FilterChip } from '@/components/FilterChip';
import { Skeleton } from '@/components/Skeleton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { canSeeProfit } from '@/utils/permissions';
import {
  usePeriodStats,
  usePeriodBooks,
  useTopProducts,
  usePaymentBreakdown,
  useBusinessHealth,
  useSales,
  useCustomers,
  useSuppliers,
  usePurchases,
  useExpenses,
  usePayments,
  PeriodRange,
} from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { combineDateAndTime, toLocalDateString } from '@/utils/periodBounds';
import { formatTime, getTodayDateString, getYesterdayDateString } from '@/utils/formatters';
import { shareReportPdf } from '@/utils/reportExport';
import { showToast } from '@/stores/toastStore';
import { seriesForPeriod } from '@/services/financial/books';

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';
type TxKind = 'all' | 'sale' | 'purchase' | 'expense' | 'payment';

type TxRow = {
  id: string;
  kind: Exclude<TxKind, 'all'>;
  title: string;
  party: string;
  amount: number;
  outflow: boolean;
  at: string;
  status: string;
  voided?: boolean;
  searchText: string;
};

function isoDaysAgo(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return toLocalDateString(d);
}

function todayIso(): string {
  return getTodayDateString();
}

function rangeFor(period: Period, custom: PeriodRange | null): PeriodRange {
  const today = todayIso();
  switch (period) {
    case 'yesterday':
      return { start: getYesterdayDateString(), end: getYesterdayDateString() };
    case 'week':
      return { start: isoDaysAgo(6), end: today };
    case 'month': {
      const d = new Date();
      const first = toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
      return { start: first, end: today };
    }
    case 'year': {
      const d = new Date();
      return { start: toLocalDateString(new Date(d.getFullYear(), 0, 1)), end: today };
    }
    case 'all':
      return { start: '2000-01-01', end: today };
    case 'custom':
      return custom ?? { start: today, end: today };
    default:
      return { start: today, end: today };
  }
}

function formatPeriodLabel(range: PeriodRange, period: Period, allLabel: string): string {
  if (period === 'all') return allLabel;
  const start = range.start.replace('T', ' ').slice(0, 16);
  const end = range.end.replace('T', ' ').slice(0, 16);
  return `${start} → ${end}`;
}

function minutesFromClock(value: string): number | null {
  const match = value.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function minutesFromTimestamp(value: string): number {
  const match = value.replace('T', ' ').match(/(\d{2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function paymentTypeLabel(
  type: string,
  t: (key: string) => string
): string {
  switch (type) {
    case 'customer_payment':
      return t('navigation.customerPayment');
    case 'supplier_payment':
      return t('navigation.supplierPayment');
    case 'withdrawal':
      return t('cash.withdrawals');
    case 'other_income':
      return t('reports.otherIncome');
    case 'sale_payment':
      return t('sales.completeSale');
    case 'purchase_payment':
      return t('purchases.newPurchase');
    case 'expense_payment':
      return t('navigation.expense');
    default:
      return type;
  }
}

export default function ReportsScreen() {
  const { t } = useTranslation();
  const { user, business } = useAuthStore();
  const [period, setPeriod] = React.useState<Period>('week');
  const [refreshing, setRefreshing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [txType, setTxType] = React.useState<TxKind>('all');
  const [txSearch, setTxSearch] = React.useState('');
  const [historyStartTime, setHistoryStartTime] = React.useState('00:00');
  const [historyEndTime, setHistoryEndTime] = React.useState('23:59');

  const [startDate, setStartDate] = React.useState(todayIso());
  const [endDate, setEndDate] = React.useState(todayIso());
  const [startTime, setStartTime] = React.useState('00:00');
  const [endTime, setEndTime] = React.useState('23:59');
  const [customApplied, setCustomApplied] = React.useState<PeriodRange | null>(null);

  const customRange = React.useMemo(
    () => ({
      start: combineDateAndTime(startDate, startTime, '00:00'),
      end: combineDateAndTime(endDate, endTime, '23:59'),
    }),
    [startDate, endDate, startTime, endTime]
  );

  const range = React.useMemo(
    () => rangeFor(period, period === 'custom' ? (customApplied ?? customRange) : null),
    [period, customApplied, customRange]
  );

  const statsQuery = usePeriodStats(range);
  const booksQuery = usePeriodBooks(range);
  const topQuery = useTopProducts(range, 5);
  const payQuery = usePaymentBreakdown(range);
  const healthQuery = useBusinessHealth();
  const salesInRangeQuery = useSales(range);
  const purchasesQuery = usePurchases(range);
  const expensesQuery = useExpenses(range);
  const paymentsQuery = usePayments(range);
  const customersQuery = useCustomers();
  const suppliersQuery = useSuppliers();

  const stats = statsQuery.data;
  const books = booksQuery.data;
  const top = topQuery.data ?? [];
  const pay = payQuery.data;
  const health = healthQuery.data;
  const customerNameOf = React.useCallback(
    (id: string | null) => {
      if (!id) return t('sales.walkInCustomer');
      return customersQuery.data?.find((c) => c.id === id)?.name ?? t('sales.walkInCustomer');
    },
    [customersQuery.data, t]
  );
  const supplierNameOf = React.useCallback(
    (id: string | null) => {
      if (!id) return t('suppliers.suppliers');
      return suppliersQuery.data?.find((s) => s.id === id)?.name ?? t('suppliers.suppliers');
    },
    [suppliersQuery.data, t]
  );

  const allTransactions = React.useMemo(() => {
    const rows: TxRow[] = [];

    for (const sale of salesInRangeQuery.data ?? []) {
      const ref = sale.reference_number ?? sale.id.slice(0, 8).toUpperCase();
      const party = customerNameOf(sale.customer_id);
      const status = sale.voided
        ? t('sales.voided')
        : sale.payment_status === 'paid'
          ? t('sales.paid')
          : sale.payment_status === 'partial'
            ? t('sales.partial')
            : sale.payment_status === 'unpaid'
              ? t('sales.unpaid')
              : t('sales.credit');
      rows.push({
        id: `sale-${sale.id}`,
        kind: 'sale',
        title: ref,
        party,
        amount: sale.total_amount,
        outflow: false,
        at: sale.created_at || sale.sale_date,
        status,
        voided: sale.voided === true,
        searchText: `${ref} ${party} ${status}`.toLowerCase(),
      });
    }

    for (const purchase of purchasesQuery.data ?? []) {
      const ref = purchase.reference_number ?? purchase.id.slice(0, 8).toUpperCase();
      const party = supplierNameOf(purchase.supplier_id);
      rows.push({
        id: `purchase-${purchase.id}`,
        kind: 'purchase',
        title: ref,
        party,
        amount: purchase.total_amount,
        outflow: true,
        at: purchase.created_at || purchase.purchase_date,
        status: purchase.status,
        searchText: `${ref} ${party} ${purchase.status}`.toLowerCase(),
      });
    }

    for (const expense of expensesQuery.data ?? []) {
      const ref = expense.reference_number ?? expense.description ?? expense.category;
      rows.push({
        id: `expense-${expense.id}`,
        kind: 'expense',
        title: ref || t('navigation.expense'),
        party: expense.category,
        amount: expense.amount,
        outflow: true,
        at: expense.created_at || expense.expense_date,
        status: expense.payment_method,
        searchText: `${ref} ${expense.category} ${expense.description ?? ''}`.toLowerCase(),
      });
    }

    for (const payment of paymentsQuery.data ?? []) {
      if (payment.type === 'sale_payment' || payment.type === 'purchase_payment' || payment.type === 'expense_payment') {
        continue;
      }
      const title = paymentTypeLabel(payment.type, t);
      const party =
        payment.type === 'supplier_payment'
          ? supplierNameOf(payment.party_id)
          : payment.type === 'customer_payment'
            ? customerNameOf(payment.party_id)
            : payment.notes?.trim() || payment.payment_method;
      const outflow =
        payment.type === 'supplier_payment' || payment.type === 'withdrawal';
      rows.push({
        id: `payment-${payment.id}`,
        kind: 'payment',
        title,
        party,
        amount: payment.amount,
        outflow,
        at: payment.created_at || payment.payment_date,
        status: payment.payment_method,
        searchText: `${title} ${party} ${payment.notes ?? ''} ${payment.payment_method}`.toLowerCase(),
      });
    }

    return rows.sort((a, b) => (b.at > a.at ? 1 : -1));
  }, [
    salesInRangeQuery.data,
    purchasesQuery.data,
    expensesQuery.data,
    paymentsQuery.data,
    customerNameOf,
    supplierNameOf,
    t,
  ]);

  const filteredTransactions = React.useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    const fromMin = minutesFromClock(historyStartTime) ?? 0;
    const toMin = minutesFromClock(historyEndTime) ?? 23 * 60 + 59;
    return allTransactions.filter((row) => {
      if (txType !== 'all' && row.kind !== txType) return false;
      if (q && !row.searchText.includes(q)) return false;
      const mins = minutesFromTimestamp(row.at);
      if (fromMin <= toMin) {
        if (mins < fromMin || mins > toMin) return false;
      } else if (mins < fromMin && mins > toMin) {
        return false;
      }
      return true;
    });
  }, [allTransactions, txType, txSearch, historyStartTime, historyEndTime]);

  const chartData = React.useMemo(() => {
    const series = seriesForPeriod(
      (salesInRangeQuery.data ?? []).map((s) => ({
        sale_date: s.sale_date,
        created_at: s.created_at,
        total_amount: s.total_amount,
        voided: s.voided,
      })),
      range.start,
      range.end,
      todayIso()
    );
    if (series.length <= 45) return series;
    const byMonth = new Map<string, { total: number; isToday: boolean }>();
    const todayMonth = todayIso().slice(0, 7);
    for (const bar of series) {
      const key = bar.date.slice(0, 7);
      const prev = byMonth.get(key);
      byMonth.set(key, {
        total: (prev?.total ?? 0) + bar.total,
        isToday: key === todayMonth,
      });
    }
    return [...byMonth.entries()].map(([month, value]) => ({
      date: month,
      label: month.slice(2),
      total: value.total,
      isToday: value.isToday,
    }));
  }, [salesInRangeQuery.data, range.start, range.end]);
  const chartLoading = salesInRangeQuery.isLoading;
  const maxDay = Math.max(1, ...chartData.map((d) => d.total));
  const showProfit = canSeeProfit(user?.role);
  const loading = statsQuery.isLoading && !statsQuery.data;
  const historyLoading =
    salesInRangeQuery.isLoading ||
    purchasesQuery.isLoading ||
    expensesQuery.isLoading ||
    paymentsQuery.isLoading;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      statsQuery.refetch(),
      booksQuery.refetch(),
      topQuery.refetch(),
      payQuery.refetch(),
      healthQuery.refetch(),
      salesInRangeQuery.refetch(),
      purchasesQuery.refetch(),
      expensesQuery.refetch(),
      paymentsQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const applyCustomRange = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      showToast(t('reports.invalidDate'), 'error');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      showToast(t('reports.invalidTime'), 'error');
      return;
    }
    if (customRange.start > customRange.end) {
      showToast(t('reports.invalidRange'), 'error');
      return;
    }
    setCustomApplied(customRange);
    setPeriod('custom');
  };

  const exportReport = async () => {
    if (!stats || !books) return;
    setExporting(true);
    try {
      const collected =
        (pay?.collections.cash ?? 0) + (pay?.collections.mobileMoney ?? 0) + (pay?.collections.bank ?? 0);
      const otherIn =
        (pay?.otherIncome.cash ?? 0) + (pay?.otherIncome.mobileMoney ?? 0) + (pay?.otherIncome.bank ?? 0);
      const payRows = [
        { label: `${t('sales.cash')} (${t('reports.atCheckout')})`, amount: pay?.cash ?? 0 },
        { label: `${t('sales.mobileMoney')} (${t('reports.atCheckout')})`, amount: pay?.mobileMoney ?? 0 },
        { label: `${t('sales.bank')} (${t('reports.atCheckout')})`, amount: pay?.bank ?? 0 },
        { label: t('reports.newCreditSales'), amount: pay?.credit ?? 0 },
        { label: t('reports.oldDebtCollected'), amount: collected },
        { label: t('reports.otherIncome'), amount: otherIn },
      ];
      await shareReportPdf({
        businessName: business?.name ?? 'MIA',
        businessCode: business?.business_code,
        currency: business?.currency ?? 'RWF',
        periodLabel: formatPeriodLabel(range, period, t('sales.allTime')),
        generatedAt: new Date().toLocaleString(),
        totalSales: stats.totalSales,
        itemsSold: stats.itemsSold,
        grossProfit: showProfit ? stats.grossProfit : null,
        netProfit: showProfit ? stats.netProfit : null,
        expenses: stats.expenses,
        stockValue: stats.stockValue,
        topProducts: top.map((p) => ({
          productName: p.productName,
          quantitySold: p.quantitySold,
          totalSales: p.totalSales,
        })),
        payments: payRows,
        includeProfit: showProfit,
      });
      showToast(t('reports.exportSuccess'), 'success');
    } catch {
      showToast(t('reports.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const periods: Array<{ value: Period; label: string }> = [
    { value: 'today', label: t('reports.today') },
    { value: 'yesterday', label: t('reports.yesterday') },
    { value: 'week', label: t('reports.thisWeek') },
    { value: 'month', label: t('reports.thisMonth') },
    { value: 'year', label: t('dashboard.thisYear') },
    { value: 'all', label: t('sales.allTime') },
    { value: 'custom', label: t('reports.customRange') },
  ];

  const txTypes: Array<{ value: TxKind; label: string }> = [
    { value: 'all', label: t('reports.typeAll') },
    { value: 'sale', label: t('reports.typeSales') },
    { value: 'purchase', label: t('reports.typePurchases') },
    { value: 'expense', label: t('reports.typeExpenses') },
    { value: 'payment', label: t('reports.typePayments') },
  ];

  const periodLabel = formatPeriodLabel(range, period, t('sales.allTime'));

  const collectedTotal =
    (pay?.collections.cash ?? 0) + (pay?.collections.mobileMoney ?? 0) + (pay?.collections.bank ?? 0);
  const otherIncomeTotal =
    (pay?.otherIncome.cash ?? 0) + (pay?.otherIncome.mobileMoney ?? 0) + (pay?.otherIncome.bank ?? 0);
  const checkoutRows = [
    { label: t('sales.cash'), value: pay?.cash ?? 0, icon: 'cash' },
    { label: t('sales.mobileMoney'), value: pay?.mobileMoney ?? 0, icon: 'phone-portrait' },
    { label: t('sales.bank'), value: pay?.bank ?? 0, icon: 'card' },
    { label: t('sales.credit'), value: pay?.credit ?? 0, icon: 'person' },
  ];
  const checkoutTotal = checkoutRows.reduce((sum, row) => sum + row.value, 0);
  const payTotal = checkoutTotal;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('reports.reports')}
        subtitle={periodLabel}
        showBack={false}
        right={
          <TouchableOpacity
            onPress={exportReport}
            disabled={!stats || exporting}
            hitSlop={10}
            style={styles.exportBtn}
            accessibilityLabel={t('reports.exportReport')}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="share-outline" size={22} color={colors.primary} />
            )}
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periods}
        >
          {periods.map((item) => (
            <FilterChip
              key={item.value}
              label={item.label}
              selected={period === item.value}
              onPress={() => {
                setPeriod(item.value);
                if (item.value === 'custom' && !customApplied) {
                  setCustomApplied(customRange);
                }
              }}
            />
          ))}
        </ScrollView>

        {period === 'custom' ? (
          <View style={styles.customCard}>
            <Text style={styles.customTitle}>{t('reports.customRange')}</Text>
            <Text style={styles.customHint}>{t('reports.dateTimeHint')}</Text>
            <View style={styles.customRow}>
              <View style={styles.customField}>
                <Text style={styles.fieldLabel}>{t('reports.startDate')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.customField}>
                <Text style={styles.fieldLabel}>{t('reports.startTime')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="HH:mm"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            <View style={styles.customRow}>
              <View style={styles.customField}>
                <Text style={styles.fieldLabel}>{t('reports.endDate')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.customField}>
                <Text style={styles.fieldLabel}>{t('reports.endTime')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="HH:mm"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            <TouchableOpacity style={styles.applyBtn} onPress={applyCustomRange} activeOpacity={0.85}>
              <Text style={styles.applyText}>{t('reports.applyRange')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <>
            <Skeleton height={120} style={styles.skel} />
            <Skeleton height={120} style={styles.skel} />
          </>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>{t('reports.totalSales')}</Text>
              <MoneyText amount={stats?.totalSales ?? 0} size={32} weight="800" color={colors.ink} />
              <Text style={styles.heroSub}>
                {stats?.itemsSold ?? 0} {t('dashboard.itemsSold').toLowerCase()}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('reports.salesTrend')}</Text>
              <Text style={styles.cardHint}>{periodLabel}</Text>
              {chartLoading ? (
                <Skeleton height={120} />
              ) : chartData.length === 0 || chartData.every((d) => d.total === 0) ? (
                <Text style={styles.muted}>{t('reports.noSalesInPeriod')}</Text>
              ) : (
                <View style={styles.chart}>
                  {chartData.map((d) => (
                    <View key={d.date} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={StyleSheet.flatten([
                            styles.barFill,
                            {
                              height: `${Math.max(4, Math.round((d.total / maxDay) * 100))}%`,
                              backgroundColor: d.isToday ? colors.primary : colors.primarySoft,
                            },
                          ])}
                        />
                      </View>
                      <Text style={StyleSheet.flatten([styles.barLabel, d.isToday ? styles.barLabelToday : null])}>
                        {d.label}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.grid}>
              {showProfit ? (
                <>
                  <StatCard title={t('reports.grossProfit')} value={stats?.grossProfit ?? 0} color={colors.success} icon="trending-up" />
                  <StatCard title={t('reports.netProfit')} value={stats?.netProfit ?? 0} color={colors.primary} icon="stats-chart" />
                </>
              ) : null}
              <StatCard title={t('reports.totalExpenses')} value={stats?.expenses ?? 0} color={colors.danger} icon="wallet" />
              <StatCard title={t('reports.stockValue')} value={stats?.stockValue ?? 0} color={colors.warning} icon="cube" />
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t('reports.transactionHistory')}</Text>
                <Text style={styles.historyCount}>
                  {t('reports.showingCount', { count: filteredTransactions.length })}
                </Text>
              </View>
              <Text style={styles.cardHint}>{periodLabel}</Text>

              <TextInput
                style={styles.searchInput}
                value={txSearch}
                onChangeText={setTxSearch}
                placeholder={t('reports.searchTransactions')}
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.filterLabel}>{t('reports.filterByType')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.typeFilters}
              >
                {txTypes.map((item) => (
                  <FilterChip
                    key={item.value}
                    label={item.label}
                    selected={txType === item.value}
                    onPress={() => setTxType(item.value)}
                  />
                ))}
              </ScrollView>

              <Text style={styles.filterLabel}>{t('reports.filterByTime')}</Text>
              <View style={styles.customRow}>
                <View style={styles.customField}>
                  <Text style={styles.fieldLabel}>{t('reports.startTime')}</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={historyStartTime}
                    onChangeText={setHistoryStartTime}
                    placeholder="HH:mm"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.customField}>
                  <Text style={styles.fieldLabel}>{t('reports.endTime')}</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={historyEndTime}
                    onChangeText={setHistoryEndTime}
                    placeholder="HH:mm"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {historyLoading ? (
                <Skeleton height={120} />
              ) : filteredTransactions.length === 0 ? (
                <Text style={styles.muted}>{t('reports.noTransactionsInFilter')}</Text>
              ) : (
                filteredTransactions.map((row) => {
                  const icon =
                    row.kind === 'sale'
                      ? 'cart-outline'
                      : row.kind === 'purchase'
                        ? 'cube-outline'
                        : row.kind === 'expense'
                          ? 'wallet-outline'
                          : 'cash-outline';
                  const tone = row.voided
                    ? 'neutral'
                    : row.outflow
                      ? 'danger'
                      : 'success';
                  const day = row.at.slice(0, 10);
                  const clock = formatTime(row.at);
                  return (
                    <View
                      key={row.id}
                      style={[styles.historyRow, row.voided && styles.historyRowVoided]}
                    >
                      <View style={[styles.historyIcon, row.voided && styles.historyIconVoided]}>
                        <Ionicons
                          name={icon as any}
                          size={18}
                          color={row.voided ? colors.muted : colors.primary}
                        />
                      </View>
                      <View style={styles.historyInfo}>
                        <Text
                          style={[styles.historyRef, row.voided && styles.historyRefVoided]}
                          numberOfLines={1}
                        >
                          {row.title}
                        </Text>
                        <Text style={styles.historySub} numberOfLines={1}>
                          {row.party}
                        </Text>
                        <Text style={styles.historyTime}>
                          {day} · {clock}
                        </Text>
                      </View>
                      <View style={styles.historyRight}>
                        <MoneyText
                          amount={row.outflow ? -Math.abs(row.amount) : row.amount}
                          size={14}
                          weight="800"
                          color={row.voided ? colors.muted : row.outflow ? colors.danger : colors.successText}
                        />
                        <StatusBadge label={row.status} tone={tone} />
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('reports.topProducts')}</Text>
              <Text style={styles.cardHint}>{t('reports.topProductsHint')}</Text>
              {topQuery.isLoading ? (
                <Skeleton height={120} />
              ) : top.length === 0 ? (
                <Text style={styles.muted}>{t('reports.noSalesInPeriod')}</Text>
              ) : (
                top.map((p, index) => (
                  <View key={p.productId} style={styles.topRow}>
                    <View style={styles.rank}>
                      <Text style={styles.rankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.topInfo}>
                      <Text style={styles.topName} numberOfLines={1}>{p.productName}</Text>
                      <Text style={styles.topSub}>
                        {p.quantitySold} {t('dashboard.itemsSold').toLowerCase()}
                        {showProfit ? ` · ${t('reports.profit')} ` : ''}
                      </Text>
                      {showProfit ? (
                        <Text style={styles.topProfit}>
                          <MoneyText amount={p.totalProfit} size={12} weight="700" color={colors.success} />
                          <Text style={styles.topMargin}> · {p.margin}%</Text>
                        </Text>
                      ) : null}
                    </View>
                    <MoneyText amount={p.totalSales} size={14} weight="700" color={colors.ink} />
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t('reports.moneyInOut')}</Text>
              </View>
              <Text style={styles.cardHint}>{t('reports.atCheckoutHint')}</Text>
              {payQuery.isLoading ? (
                <Skeleton height={120} />
              ) : (
                <>
                  {checkoutRows.map((row) => {
                    const pct = payTotal > 0 ? Math.round((row.value / payTotal) * 100) : 0;
                    return (
                      <View key={row.label} style={styles.payRow}>
                        <View style={styles.payLeft}>
                          <Ionicons name={row.icon as any} size={18} color={colors.muted} />
                          <Text style={styles.payLabel}>{row.label}</Text>
                        </View>
                        <View style={styles.payRight}>
                          <Text style={styles.payPct}>{pct}%</Text>
                          <MoneyText amount={row.value} size={14} weight="700" color={colors.ink} />
                        </View>
                      </View>
                    );
                  })}
                  <View style={styles.divider} />
                  <View style={styles.payRow}>
                    <Text style={styles.payLabel}>{t('reports.oldDebtCollected')}</Text>
                    <MoneyText amount={collectedTotal} size={14} weight="700" color={colors.ink} />
                  </View>
                  <View style={styles.payRow}>
                    <Text style={styles.payLabel}>{t('reports.otherIncome')}</Text>
                    <MoneyText amount={otherIncomeTotal} size={14} weight="700" color={colors.ink} />
                  </View>
                </>
              )}
            </View>

            {showProfit && books ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('reports.howCalculated')}</Text>
                <View style={styles.payRow}>
                  <Text style={styles.payLabel}>{t('reports.totalSales')}</Text>
                  <MoneyText amount={books.totalSales} size={14} weight="600" />
                </View>
                <View style={styles.payRow}>
                  <Text style={styles.payLabel}>{t('reports.cogs')}</Text>
                  <MoneyText amount={-books.cogs} size={14} weight="600" />
                </View>
                <View style={styles.payRow}>
                  <Text style={styles.payLabel}>{t('reports.grossProfit')}</Text>
                  <MoneyText amount={books.grossProfit} size={14} weight="700" />
                </View>
                <View style={styles.payRow}>
                  <Text style={styles.payLabel}>{t('reports.totalExpenses')}</Text>
                  <MoneyText amount={-books.expenses} size={14} weight="600" />
                </View>
                <View style={styles.payRow}>
                  <Text style={styles.payLabel}>{t('reports.inventoryLoss')}</Text>
                  <MoneyText amount={-books.inventoryLoss} size={14} weight="600" />
                </View>
                <View style={styles.divider} />
                <View style={styles.payRow}>
                  <Text style={styles.payLabelBold}>{t('reports.netProfit')}</Text>
                  <MoneyText amount={books.netProfit} size={16} weight="800" />
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('reports.businessHealth')}</Text>
              {healthQuery.isLoading ? (
                <Skeleton height={72} />
              ) : (
                <>
                  <HealthRow
                    ok={(health?.customerDebt ?? 0) === 0}
                    label={t('reports.customerDebt')}
                    value={health?.customerDebt ?? 0}
                  />
                  <HealthRow
                    ok={(health?.supplierDebt ?? 0) === 0}
                    label={t('reports.supplierDebt')}
                    value={health?.supplierDebt ?? 0}
                  />
                  <View style={styles.payRow}>
                    <Text style={styles.payLabel}>{t('reports.lowStockCount')}</Text>
                    <Text style={styles.healthValue}>
                      {health?.lowStockCount ?? 0} ({t('reports.outOfStock')}: {health?.outOfStockCount ?? 0})
                    </Text>
                  </View>
                  <View style={styles.payRow}>
                    <Text style={styles.payLabel}>{t('reports.syncState')}</Text>
                    <Text style={styles.healthValue}>
                      {(health?.pendingSync ?? 0) === 0 && (health?.failedSync ?? 0) === 0
                        ? t('common.synced')
                        : `${health?.pendingSync ?? 0} ${t('common.waitingToSync')}${
                            (health?.failedSync ?? 0) > 0 ? ` · ${health?.failedSync} ${t('common.failed')}` : ''
                          }`}
                    </Text>
                  </View>
                  {!health?.openDay ? (
                    <Text style={styles.warnText}>{t('reports.noOpenDay')}</Text>
                  ) : null}
                </>
              )}
            </View>

            <TouchableOpacity
              style={styles.exportCard}
              onPress={exportReport}
              disabled={!stats || exporting}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              <View style={styles.exportInfo}>
                <Text style={styles.exportTitle}>{t('reports.exportReport')}</Text>
                <Text style={styles.exportSub}>{t('reports.exportHint')}</Text>
              </View>
              {exporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="share-outline" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function HealthRow({ ok, label, value }: { ok: boolean; label: string; value: number }) {
  return (
    <View style={styles.payRow}>
      <View style={styles.payLeft}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'warning'}
          size={18}
          color={ok ? colors.success : colors.warning}
        />
        <Text style={styles.payLabel}>{label}</Text>
      </View>
      <MoneyText amount={value} size={14} weight="700" color={colors.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 110,
  },
  exportBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  periods: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  customCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  customTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  customHint: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  customField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 4,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  applyBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  applyText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  skel: {
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  cardHint: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: spacing.sm,
  },
  payLabelBold: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  topProfit: {
    marginTop: 2,
  },
  topMargin: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  healthValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  warnText: {
    fontSize: 13,
    color: colors.warning,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  muted: {
    fontSize: 14,
    color: colors.muted,
  },
  historyCount: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  typeFilters: {
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  historyRowVoided: {
    opacity: 0.7,
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconVoided: {
    backgroundColor: colors.borderSoft,
  },
  historyInfo: {
    flex: 1,
    minWidth: 0,
  },
  historyRef: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  historyRefVoided: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  historySub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  historyTime: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryText,
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 132,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
  },
  barFill: {
    width: '100%',
    maxWidth: 22,
    borderRadius: 6,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 6,
    fontWeight: '600',
  },
  barLabelToday: {
    color: colors.primary,
    fontWeight: '800',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.md,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  topInfo: {
    flex: 1,
  },
  topName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  topSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  payLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  payLabel: {
    fontSize: 14,
    color: colors.body,
  },
  payRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  payPct: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  exportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  exportInfo: {
    flex: 1,
  },
  exportTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },
  exportSub: {
    fontSize: 12,
    color: colors.primaryText,
    marginTop: 2,
    opacity: 0.85,
  },
});
