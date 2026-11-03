import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  useWindowDimensions,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { AppHeader } from '@/components/AppHeader';
import { MoneyText } from '@/components/MoneyText';
import { StatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/Skeleton';
import { BottomSheet } from '@/components/SegmentedControl';
import { FirstTimeGuide } from '@/components/FirstTimeGuide';
import { formatTime, formatRecordDateTime, getTodayDateString, getWeekStartDateString } from '@/utils/formatters';
import { combineDateAndTime, toLocalDateString } from '@/utils/periodBounds';
import { canSeeProfit } from '@/utils/permissions';
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
import { useAuthStore } from '@/stores/authStore';
import { showToast } from '@/stores/toastStore';

type DashPeriod = 'today' | 'openDay' | 'week' | 'month' | 'year' | 'custom';

function greetingKey(): 'dashboard.greetingMorning' | 'dashboard.greetingAfternoon' | 'dashboard.greetingEvening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.greetingMorning';
  if (hour < 18) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

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
      return openDayStart
        ? { start: openDayStart, end: today, sessionId: sessionId ?? null }
        : null;
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
  bars: Array<{ date: string; label: string; total: number; isToday: boolean }>
) {
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

export default function HomeScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { business, user } = useAuthStore();
  const today = getTodayDateString();

  const [period, setPeriod] = React.useState<DashPeriod>('openDay');
  const [showPeriodSheet, setShowPeriodSheet] = React.useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState(today);
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

  const customDraft = React.useMemo(
    () => ({
      start: combineDateAndTime(startDate, '00:00', '00:00'),
      end: combineDateAndTime(endDate, '23:59', '23:59'),
    }),
    [startDate, endDate]
  );

  const range = React.useMemo(
    () =>
      rangeForPeriod(
        period,
        openDayStart,
        period === 'custom' ? (customApplied ?? customDraft) : null,
        openSessionId
      ),
    [period, openDayStart, openSessionId, customApplied, customDraft]
  );

  const statsQuery = useDashboardStats();
  const periodStatsQuery = usePeriodStats(range);
  const lowStockQuery = useLowStockProducts();
  const salesQuery = useSales(range);
  const debtQuery = useCustomersWithBalances();
  const usersQuery = useBusinessUsers();

  const dashStats = statsQuery.data;
  const periodStats = periodStatsQuery.data;
  const lowStock = lowStockQuery.data ?? [];
  const loading =
    period === 'openDay' ? statsQuery.isLoading && !dashStats : periodStatsQuery.isLoading && !periodStats;
  const recentSales = (salesQuery.data ?? []).filter((sale) => !sale.voided).slice(0, 8);
  const debtors = (debtQuery.data?.rows ?? []).filter((row) => row.outstanding > 0).slice(0, 5);

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

  const showProfit = canSeeProfit(user?.role);
  const firstName = user?.name?.split(' ')[0] ?? '';
  const wide = width >= 980;
  const split = width >= 760;

  const periodOptions: Array<{ value: DashPeriod; label: string; hidden?: boolean }> = [
    { value: 'openDay', label: t('sales.openDayFilter'), hidden: !openDayStart && period !== 'openDay' },
    { value: 'today', label: t('reports.today') },
    { value: 'week', label: t('dashboard.thisWeek') },
    { value: 'month', label: t('dashboard.thisMonth') },
    { value: 'year', label: t('dashboard.thisYear') },
    { value: 'custom', label: t('reports.customRange') },
  ];
  const visiblePeriods = periodOptions.filter((o) => !o.hidden);
  const periodLabel =
    periodOptions.find((o) => o.value === period)?.label ?? t('dashboard.periodFilter');
  const periodSubtitle = range
    ? period === 'custom' || range.start.slice(0, 10) !== range.end.slice(0, 10)
      ? `${range.start.slice(0, 10)} → ${range.end.slice(0, 10)}`
      : range.start.slice(0, 10)
    : '';

  const selectPeriod = (value: DashPeriod) => {
    if (value === 'custom') {
      setPeriod('custom');
      setShowPeriodSheet(true);
      return;
    }
    setPeriod(value);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      statsQuery.refetch(),
      periodStatsQuery.refetch(),
      openClosingQuery.refetch(),
      lowStockQuery.refetch(),
      salesQuery.refetch(),
      debtQuery.refetch(),
      usersQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const go = (path: string) => router.push(path as any);

  const applyCustom = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      showToast(t('reports.invalidDate'), 'error');
      return;
    }
    if (startDate > endDate) {
      showToast(t('reports.invalidRange'), 'error');
      return;
    }
    setCustomApplied(customDraft);
    setPeriod('custom');
    setShowPeriodSheet(false);
  };

  const chartSource = React.useMemo(() => {
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
  const chartTotal = chartSource.reduce((sum, d) => sum + d.total, 0);
  const chartLoading = salesQuery.isLoading;
  const maxDay = Math.max(1, ...chartSource.map((d) => d.total));
  const delta = period === 'openDay' || period === 'today' ? (dashStats?.salesDelta ?? null) : null;

  return (
    <View style={styles.screen}>
      <FirstTimeGuide />

      <AppHeader
        greeting={t(greetingKey())}
        userName={user?.name ?? firstName}
        businessName={business?.name ?? 'MIA'}
        showActions
        avatarLabel={firstName ? firstName.charAt(0).toUpperCase() : undefined}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          {loading ? (
            <>
              <Skeleton height={220} style={styles.heroSkeleton} />
              <Skeleton height={100} style={{ borderRadius: radius.lg, marginBottom: spacing.lg }} />
            </>
          ) : (
            <>
              {/* ── Hero Sales Card ── */}
              <View style={styles.hero}>
                {/* Session status bar */}
                {hasOpenDay ? (
                  <TouchableOpacity style={styles.heroSession} onPress={() => go('/closing')} activeOpacity={0.85}>
                    <View style={styles.heroSessionDot} />
                    <Text style={styles.heroSessionText} numberOfLines={1}>
                      {t('dashboard.openSessionLabel')}
                      {sessionNumber != null ? ` #${sessionNumber}` : ''}
                      {sessionDuration ? ` · ${sessionDuration}` : ''}
                    </Text>
                    <Text style={styles.heroSessionAction}>{t('cash.closeSessionShort')} →</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.heroAlert} onPress={() => go('/closing')} activeOpacity={0.85}>
                    <Ionicons name="alert-circle" size={18} color="#fde68a" />
                    <Text style={styles.heroAlertText}>{t('dashboard.openDayBanner')}</Text>
                    <View style={styles.heroAlertBtn}>
                      <Text style={styles.heroAlertBtnText}>{t('dashboard.openDayBtn')}</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Period chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.heroFilters}
                >
                  {visiblePeriods.map((option) => {
                    const active = period === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.heroChip, active && styles.heroChipActive]}
                        onPress={() => selectPeriod(option.value)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.heroChipText, active && styles.heroChipTextActive]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Main numbers: Sales & Expected Cash in Drawer */}
                <View style={styles.heroMainNumbers}>
                  <View style={styles.heroSales}>
                    <Text style={styles.heroLabel}>{t('dashboard.sales').toUpperCase()}</Text>
                    <MoneyText amount={salesTotal} size={wide ? 38 : 30} weight="800" color="#fff" />
                    {periodSubtitle ? <Text style={styles.heroRange}>{periodSubtitle}</Text> : null}
                    {delta !== null && (period === 'openDay' || period === 'today') ? (
                      <View style={styles.deltaRow}>
                        <Ionicons
                          name={delta >= 0 ? 'trending-up' : 'trending-down'}
                          size={14}
                          color={delta >= 0 ? '#bbf7d0' : '#fecaca'}
                        />
                        <Text style={styles.deltaText}>
                          {delta >= 0 ? '+' : '−'}
                          {Math.abs(Math.round(delta * 100))}% {t('dashboard.vsPreviousDay')}
                        </Text>
                      </View>
                    ) : null}
                    {salesTotal === 0 && !loading ? (
                      <Text style={styles.heroEmpty}>{t('dashboard.noSalesYet')}</Text>
                    ) : null}
                  </View>

                  {/* Expected Cash in Drawer */}
                  <TouchableOpacity
                    style={styles.heroCashBox}
                    onPress={() => go('/closing')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.heroCashTop}>
                      <Ionicons name="wallet" size={15} color="#4ade80" />
                      <Text style={styles.heroCashLabel}>{t('dashboard.expectedCash')}</Text>
                    </View>
                    <MoneyText amount={expectedCash} size={wide ? 24 : 20} weight="800" color="#fff" />
                    <View style={styles.heroCashBottom}>
                      <Text style={styles.heroCashHint}>{t('dashboard.cashLeft')}</Text>
                      <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.7)" />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Key metrics row */}
                <View style={styles.heroMetrics}>
                  {showProfit && (
                    <HeroMetric
                      icon="trending-up-outline"
                      label={t('dashboard.netProfit')}
                      value={netProfit}
                      money
                      highlight={netProfit > 0}
                      danger={netProfit < 0}
                    />
                  )}
                  <HeroMetric
                    icon="receipt-outline"
                    label={t('dashboard.itemsSold')}
                    value={itemsSold}
                    money={false}
                  />
                  <HeroMetric
                    icon="people-outline"
                    label={t('dashboard.debtTotal')}
                    value={totalDebt}
                    money
                    danger={totalDebt > 0}
                  />
                </View>

                <TouchableOpacity style={styles.heroButton} onPress={() => go('/sale')} activeOpacity={0.85}>
                  <Ionicons name="add" size={22} color={colors.primary} />
                  <Text style={styles.heroButtonText}>{t('dashboard.actionSale')}</Text>
                </TouchableOpacity>
              </View>

              {/* ── Quick Actions ── */}
              <Text style={styles.sectionTitle}>{t('dashboard.quickActions')}</Text>
              <View style={styles.quickGrid}>
                <QuickAction
                  icon="cart"
                  label={t('dashboard.actionSale')}
                  bg={colors.primary}
                  onPress={() => go('/sale')}
                />
                <QuickAction
                  icon="cube"
                  label={t('dashboard.actionStockIn')}
                  bg={colors.success}
                  onPress={() => go('/stock-in')}
                />
                <QuickAction
                  icon="wallet"
                  label={t('dashboard.actionExpense')}
                  bg={colors.warning}
                  onPress={() => go('/expense')}
                />
                <QuickAction
                  icon="person"
                  label={t('dashboard.actionPayment')}
                  bg={colors.info}
                  onPress={() => setShowPaymentSheet(true)}
                />
                {hasOpenDay ? (
                  <QuickAction
                    icon="moon"
                    label={t('dashboard.actionCloseDay')}
                    bg="#7c3aed"
                    onPress={() => go('/closing')}
                  />
                ) : (
                  <QuickAction
                    icon="sunny"
                    label={t('dashboard.actionOpenDay')}
                    bg="#0284c7"
                    onPress={() => go('/closing')}
                  />
                )}
                <QuickAction
                  icon="analytics"
                  label={t('navigation.reports')}
                  bg="#475569"
                  onPress={() => go('/reports')}
                />
              </View>

              {/* ── Alerts: Low stock + Debtors ── */}
              {(lowStock.length > 0 || debtors.length > 0) && (
                <View style={styles.alertsRow}>
                  {lowStock.length > 0 && (
                    <TouchableOpacity
                      style={[styles.alertCard, styles.alertCardWarn]}
                      onPress={() => go('/stock')}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="alert-circle" size={20} color={colors.warningText} />
                      <View style={styles.alertInfo}>
                        <Text style={[styles.alertTitle, { color: colors.warningText }]}>
                          {t('dashboard.lowStockAlerts')}
                        </Text>
                        <Text style={styles.alertSub}>
                          {lowStock.slice(0, 3).map((p) => p.name).join(', ')}
                          {lowStock.length > 3 ? ` +${lowStock.length - 3}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.warningText} />
                    </TouchableOpacity>
                  )}
                  {debtors.length > 0 && (
                    <TouchableOpacity
                      style={[styles.alertCard, styles.alertCardDanger]}
                      onPress={() => go('/customers')}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="people" size={20} color={colors.dangerText} />
                      <View style={styles.alertInfo}>
                        <Text style={[styles.alertTitle, { color: colors.dangerText }]}>
                          {t('dashboard.whoOwes')}
                        </Text>
                        <Text style={styles.alertSub}>
                          {debtors.slice(0, 2).map((r) => r.customer.name).join(', ')}
                          {debtors.length > 2 ? ` +${debtors.length - 2}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.dangerText} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={split ? styles.columns : undefined}>
                <View style={split ? styles.columnMain : undefined}>
                  {/* ── Money Breakdown & Collection Decision Card ── */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.cardTitle}>{t('reports.paymentBreakdown')}</Text>
                        <Text style={styles.cardHint}>{periodLabel} · {t('dashboard.moneyIn')}</Text>
                      </View>
                      <View
                        style={[
                          styles.pillBadge,
                          {
                            backgroundColor: totalCollected > 0 ? colors.successSoft : colors.borderSoft,
                          },
                        ]}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={13}
                          color={totalCollected > 0 ? colors.successText : colors.muted}
                        />
                        <Text
                          style={[
                            styles.pillBadgeText,
                            { color: totalCollected > 0 ? colors.successText : colors.muted },
                          ]}
                        >
                          {salesTotal > 0
                            ? `${Math.round((totalCollected / salesTotal) * 100)}% ${t('sales.paid')}`
                            : t('sales.paid')}
                        </Text>
                      </View>
                    </View>

                    {/* Collected vs Credit Decision Boxes */}
                    <View style={styles.decisionRow}>
                      <View style={styles.decisionBoxCollected}>
                        <View style={styles.decisionHeader}>
                          <Ionicons name="cash" size={14} color={colors.successText} />
                          <Text style={styles.decisionTitleCollected}>{t('dashboard.totalCollected')}</Text>
                        </View>
                        <MoneyText amount={totalCollected} size={wide ? 18 : 16} weight="800" color={colors.successText} />
                        <Text style={styles.decisionSub}>{t('dashboard.salesMinusCredit')}</Text>
                      </View>

                      <View style={styles.decisionBoxCredit}>
                        <View style={styles.decisionHeader}>
                          <Ionicons name="alert-circle" size={14} color={colors.warningText} />
                          <Text style={styles.decisionTitleCredit}>{t('dashboard.creditUnpaid')}</Text>
                        </View>
                        <MoneyText amount={creditSales} size={wide ? 18 : 16} weight="800" color={colors.warningText} />
                        <Text style={styles.decisionSub}>{t('customers.balanceOwed')}</Text>
                      </View>
                    </View>

                    {/* Method Breakdown with visual progress tracks */}
                    <View style={styles.payMethodsContainer}>
                      <PayMethodRow
                        icon="cash-outline"
                        label={t('common.cash')}
                        amount={cashSales}
                        total={salesTotal}
                        color={colors.success}
                      />
                      <PayMethodRow
                        icon="phone-portrait-outline"
                        label={t('common.mobileMoney')}
                        amount={momoSales}
                        total={salesTotal}
                        color={colors.info}
                      />
                      {bankSales > 0 && (
                        <PayMethodRow
                          icon="business-outline"
                          label={t('common.bank')}
                          amount={bankSales}
                          total={salesTotal}
                          color={colors.primary}
                        />
                      )}
                      <PayMethodRow
                        icon="document-text-outline"
                        label={t('reports.newCreditSales')}
                        amount={creditSales}
                        total={salesTotal}
                        color={colors.warning}
                      />
                      {debtCollected > 0 && (
                        <PayMethodRow
                          icon="wallet-outline"
                          label={t('reports.oldDebtCollected')}
                          amount={debtCollected}
                          total={Math.max(salesTotal, debtCollected)}
                          color="#7c3aed"
                        />
                      )}
                    </View>
                  </View>

                  {/* ── Sales Chart ── */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{periodLabel}</Text>
                      <MoneyText amount={chartTotal} size={15} weight="700" color={colors.ink} />
                    </View>
                    {periodSubtitle ? <Text style={styles.cardHint}>{periodSubtitle}</Text> : null}
                    {chartLoading ? (
                      <Skeleton height={110} />
                    ) : chartSource.length === 0 || chartSource.every((d) => d.total === 0) ? (
                      <Text style={styles.muted}>{t('dashboard.noSalesInPeriod')}</Text>
                    ) : chartSource.length <= 14 || width >= 1100 ? (
                      <View style={styles.chart}>
                        {chartSource.map((d) => (
                          <View key={d.date} style={styles.barCol}>
                            <View style={styles.barTrack}>
                              <View
                                style={[
                                  styles.barFill,
                                  {
                                    height: `${Math.max(4, Math.round((d.total / maxDay) * 100))}%`,
                                    backgroundColor: d.isToday ? colors.primary : colors.primarySoft,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={[styles.barLabel, d.isToday && styles.barLabelToday]} numberOfLines={1}>
                              {d.displayLabel}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.chartWide}>
                          {chartSource.map((d, i) => (
                            <View key={d.date} style={styles.barColNarrow}>
                              <View style={styles.barTrack}>
                                <View
                                  style={[
                                    styles.barFillNarrow,
                                    {
                                      height: `${Math.max(4, Math.round((d.total / maxDay) * 100))}%`,
                                      backgroundColor: d.isToday ? colors.primary : colors.primarySoft,
                                    },
                                  ]}
                                />
                              </View>
                              <Text style={[styles.barLabel, d.isToday && styles.barLabelToday]}>
                                {i % 5 === 0 || d.isToday ? d.displayLabel : ''}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                </View>

                <View style={split ? styles.columnSide : undefined}>
                  {/* ── Recent Sales ── */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t('dashboard.recentTransactions')}</Text>
                      <TouchableOpacity onPress={() => go('/sale')} hitSlop={8}>
                        <Text style={styles.viewAll}>{t('dashboard.viewAll')}</Text>
                      </TouchableOpacity>
                    </View>
                    {salesQuery.isLoading ? (
                      <Skeleton height={52} />
                    ) : recentSales.length === 0 ? (
                      <Text style={styles.muted}>{t('dashboard.noSalesYet')}</Text>
                    ) : (
                      recentSales.map((sale) => {
                        const sellerName = userMap.get(sale.created_by);
                        const itemCount = sale.items?.length ?? 0;
                        const itemNames = sale.items?.slice(0, 2).map((i: any) => i.product_name ?? i.name ?? '').filter(Boolean).join(', ');
                        return (
                          <TouchableOpacity key={sale.id} style={styles.listRow} onPress={() => go('/sale')} activeOpacity={0.7}>
                            <View style={styles.saleAvatar}>
                              <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                            </View>
                            <View style={styles.listInfo}>
                              <Text style={styles.listName} numberOfLines={1}>
                                {sale.reference_number
                                  ? `#${sale.reference_number}`
                                  : sellerName
                                    ? `${t('dashboard.by')} ${sellerName}`
                                    : t('sales.saleDetails')}
                              </Text>
                              <Text style={styles.listDetail} numberOfLines={1}>
                                {saleClock(sale.created_at)}
                                {itemCount > 0 ? ` · ${itemCount} ${t('sales.items')}` : ''}
                                {itemNames ? `: ${itemNames}` : ''}
                              </Text>
                              {sellerName && !sale.reference_number ? null : sellerName ? (
                                <Text style={styles.listSeller} numberOfLines={1}>
                                  👤 {sellerName}
                                </Text>
                              ) : null}
                            </View>
                            <View style={styles.listRight}>
                              <MoneyText amount={sale.total_amount} size={14} weight="700" />
                              <StatusBadge
                                label={t(`sales.${sale.payment_status}` as 'sales.paid')}
                                tone={sale.payment_status === 'paid' ? 'success' : sale.payment_status === 'credit' ? 'warning' : 'neutral'}
                              />
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Payment sheet */}
      <BottomSheet
        visible={showPaymentSheet}
        onClose={() => setShowPaymentSheet(false)}
        title={t('payments.payments')}
      >
        <PaymentOption
          icon="person"
          label={t('navigation.customerPayment')}
          hint={t('payments.receivePayment')}
          onPress={() => { setShowPaymentSheet(false); go('/payment/customer-payment'); }}
        />
        <PaymentOption
          icon="business"
          label={t('navigation.supplierPayment')}
          hint={t('payments.makePayment')}
          onPress={() => { setShowPaymentSheet(false); go('/payment/supplier-payment'); }}
        />
        <PaymentOption
          icon="people"
          label={t('customers.customers')}
          hint={t('customers.totalOutstanding')}
          onPress={() => { setShowPaymentSheet(false); go('/customers'); }}
        />
        <View style={styles.sheetSpacer} />
      </BottomSheet>

      {/* Custom period sheet */}
      <BottomSheet
        visible={showPeriodSheet}
        onClose={() => setShowPeriodSheet(false)}
        title={t('reports.customRange')}
      >
        <View style={styles.customPeriodBox}>
          <Text style={styles.customPeriodHint}>{t('reports.dateTimeHint')}</Text>
          <View style={styles.customPeriodRow}>
            <View style={styles.customPeriodField}>
              <Text style={styles.customPeriodLabel}>{t('reports.startDate')}</Text>
              <TextInput
                style={styles.customPeriodInput}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.customPeriodField}>
              <Text style={styles.customPeriodLabel}>{t('reports.endDate')}</Text>
              <TextInput
                style={styles.customPeriodInput}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.customPeriodApply} onPress={applyCustom} activeOpacity={0.85}>
            <Text style={styles.customPeriodApplyText}>{t('reports.applyRange')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.sheetSpacer} />
      </BottomSheet>
    </View>
  );
}

/* ─── Sub-components ──────────────────────────────────── */

function HeroMetric({
  icon,
  label,
  value,
  money = false,
  highlight = false,
  danger = false,
}: {
  icon: string;
  label: string;
  value: number;
  money?: boolean;
  highlight?: boolean;
  danger?: boolean;
}) {
  const color = danger ? '#fca5a5' : highlight ? '#bbf7d0' : 'rgba(255,255,255,0.9)';
  return (
    <View style={styles.heroMetric}>
      <Ionicons name={icon as any} size={14} color="rgba(255,255,255,0.6)" />
      <Text style={styles.heroMetricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.heroMetricValue, { color }]} numberOfLines={1}>
        {money ? `${value.toLocaleString()} RWF` : String(value)}
      </Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  bg,
  onPress,
}: {
  icon: string;
  label: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.quickIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={24} color="#fff" />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function PaymentOption({ icon, label, hint, onPress }: { icon: string; label: string; hint: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.payOption} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.payIcon}>
        <Ionicons name={icon as any} size={22} color={colors.primary} />
      </View>
      <View style={styles.payInfo}>
        <Text style={styles.payLabel}>{label}</Text>
        <Text style={styles.payHint}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.faint} />
    </TouchableOpacity>
  );
}

function PayMethodRow({
  icon,
  label,
  amount,
  total,
  color,
}: {
  icon: string;
  label: string;
  amount: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <View style={styles.payMethodRow}>
      <View style={styles.payMethodHeader}>
        <View style={styles.payMethodLeft}>
          <Ionicons name={icon as any} size={15} color={color} />
          <Text style={styles.payMethodName}>{label}</Text>
        </View>
        <View style={styles.payMethodRight}>
          <MoneyText amount={amount} size={13} weight="700" color={colors.ink} />
          <Text style={styles.payMethodPct}>{pct}%</Text>
        </View>
      </View>
      <View style={styles.payTrack}>
        <View
          style={[
            styles.payFill,
            { width: `${Math.max(amount > 0 ? 3 : 0, pct)}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

function saleClock(value: string): string {
  return formatRecordDateTime(value);
}

/* ─── Styles ──────────────────────────────────────────── */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
  },
  page: { width: '100%' },
  heroSkeleton: {
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
  },

  /* Hero */
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  heroAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(253, 230, 138, 0.15)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroAlertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#fde68a',
  },
  heroAlertBtn: {
    backgroundColor: '#fde68a',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroAlertBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#78350f',
  },
  heroSession: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroSessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  heroSessionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  heroSessionAction: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  heroFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  heroChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  heroChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  heroChipTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  heroMainNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  heroSales: { gap: 4, flexShrink: 1 },
  heroCashBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 140,
    gap: 3,
  },
  heroCashTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroCashLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#86efac',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroCashBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  heroCashHint: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
  },
  heroRange: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  heroEmpty: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  heroMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  heroMetricLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '600',
    textAlign: 'center',
  },
  heroMetricValue: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 14,
    gap: 6,
    minHeight: 50,
  },
  heroButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },

  /* Alerts */
  alertsRow: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
  },
  alertCardWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  alertCardDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  alertInfo: { flex: 1 },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  alertSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },

  /* Quick actions */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickAction: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
    minHeight: 88,
    justifyContent: 'center',
    ...shadows.card,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.body,
    textAlign: 'center',
  },

  /* Layout */
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  columnMain: { flex: 1.45, minWidth: 0 },
  columnSide: { flex: 1, minWidth: 0 },

  /* Cards */
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
  },
  cardHint: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  muted: {
    fontSize: 14,
    color: colors.muted,
  },

  /* Chart */
  chart: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 132,
  },
  barCol: { flex: 1, alignItems: 'center', minWidth: 0 },
  barTrack: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
  },
  barFill: {
    width: '70%',
    maxWidth: 28,
    borderRadius: 6,
    minHeight: 4,
  },
  chartWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 132,
  },
  barColNarrow: { width: 22, alignItems: 'center' },
  barFillNarrow: { width: 12, borderRadius: 6, minHeight: 4 },
  barLabel: { fontSize: 10, color: colors.muted, marginTop: 6, fontWeight: '600' },
  barLabelToday: { color: colors.primary, fontWeight: '800' },

  /* List rows */
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },
  listInfo: { flex: 1, minWidth: 0 },
  listName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  listDetail: { fontSize: 12, color: colors.muted, marginTop: 2 },
  listSeller: { fontSize: 11, color: colors.primary, marginTop: 1, fontWeight: '600' },
  listRight: { alignItems: 'flex-end', gap: 4 },
  saleAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  /* Decision boxes */
  decisionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  decisionBoxCollected: {
    flex: 1,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  decisionBoxCredit: {
    flex: 1,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  decisionTitleCollected: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.successText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  decisionTitleCredit: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warningText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  decisionSub: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '600',
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* Payment method rows */
  payMethodsContainer: {
    gap: spacing.sm + 2,
    marginTop: 2,
  },
  payMethodRow: {
    gap: 4,
  },
  payMethodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  payMethodName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.body,
  },
  payMethodRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  payMethodPct: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    minWidth: 28,
    textAlign: 'right',
  },
  payTrack: {
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.borderSoft,
    overflow: 'hidden',
  },
  payFill: {
    height: 7,
    borderRadius: 3.5,
  },

  /* Payment option */
  payOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 64,
  },
  payIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  payInfo: { flex: 1 },
  payLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  payHint: { fontSize: 13, color: colors.muted, marginTop: 2 },

  /* Custom period */
  customPeriodBox: { marginTop: spacing.md, gap: spacing.sm },
  customPeriodHint: { fontSize: 12, color: colors.muted },
  customPeriodRow: { flexDirection: 'row', gap: spacing.md },
  customPeriodField: { flex: 1, gap: 4 },
  customPeriodLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  customPeriodInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.inputBg,
  },
  customPeriodApply: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  customPeriodApplyText: {
    color: colors.white, fontWeight: '700', fontSize: 14,
  },
  sheetSpacer: { height: spacing.lg },
});
