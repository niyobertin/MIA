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
import { canSeeProfit } from '@/utils/permissions';
import {
  usePeriodStats,
  useTopProducts,
  usePaymentBreakdown,
  useWeeklySales,
  useMonthlySales,
  PeriodRange,
} from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { combineDateAndTime } from '@/utils/periodBounds';
import { shareReportPdf } from '@/utils/reportExport';
import { showToast } from '@/stores/toastStore';

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

function isoDaysAgo(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
}

function todayIso(): string {
  return isoDaysAgo(0);
}

function rangeFor(period: Period, custom: PeriodRange | null): PeriodRange {
  const today = todayIso();
  switch (period) {
    case 'yesterday':
      return { start: isoDaysAgo(1), end: isoDaysAgo(1) };
    case 'week':
      return { start: isoDaysAgo(6), end: today };
    case 'month': {
      const d = new Date();
      const first = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      return { start: first, end: today };
    }
    case 'custom':
      return custom ?? { start: today, end: today };
    default:
      return { start: today, end: today };
  }
}

function formatPeriodLabel(range: PeriodRange): string {
  const start = range.start.replace('T', ' ').slice(0, 16);
  const end = range.end.replace('T', ' ').slice(0, 16);
  return `${start} → ${end}`;
}

export default function ReportsScreen() {
  const { t } = useTranslation();
  const { user, business } = useAuthStore();
  const [period, setPeriod] = React.useState<Period>('week');
  const [refreshing, setRefreshing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

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
  const topQuery = useTopProducts(range, 5);
  const payQuery = usePaymentBreakdown(range);
  const weeklyQuery = useWeeklySales();
  const monthlyQuery = useMonthlySales();

  const stats = statsQuery.data;
  const top = topQuery.data ?? [];
  const pay = payQuery.data;
  const chartData = period === 'month' ? (monthlyQuery.data ?? []) : (weeklyQuery.data ?? []);
  const chartLoading = period === 'month' ? monthlyQuery.isLoading : weeklyQuery.isLoading;
  const maxDay = Math.max(1, ...chartData.map((d) => d.total));
  const showProfit = canSeeProfit(user?.role);
  const loading = statsQuery.isLoading && !statsQuery.data;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      statsQuery.refetch(),
      topQuery.refetch(),
      payQuery.refetch(),
      weeklyQuery.refetch(),
      monthlyQuery.refetch(),
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
    if (!stats) return;
    setExporting(true);
    try {
      const payRows = [
        { label: t('sales.cash'), amount: pay?.cash ?? 0 },
        { label: t('sales.mobileMoney'), amount: pay?.mobileMoney ?? 0 },
        { label: t('sales.bank'), amount: pay?.bank ?? 0 },
        { label: t('sales.credit'), amount: pay?.credit ?? 0 },
      ];
      await shareReportPdf({
        businessName: business?.name ?? 'MIA',
        businessCode: business?.business_code,
        currency: business?.currency ?? 'RWF',
        periodLabel: formatPeriodLabel(range),
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
    { value: 'custom', label: t('reports.customRange') },
  ];

  const payRows = [
    { label: t('sales.cash'), value: pay?.cash ?? 0, icon: 'cash' },
    { label: t('sales.mobileMoney'), value: pay?.mobileMoney ?? 0, icon: 'phone-portrait' },
    { label: t('sales.bank'), value: pay?.bank ?? 0, icon: 'card' },
    { label: t('sales.credit'), value: pay?.credit ?? 0, icon: 'person' },
  ];
  const payTotal = payRows.reduce((sum, row) => sum + row.value, 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('reports.reports')}
        subtitle={formatPeriodLabel(range)}
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

            {period !== 'custom' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('reports.salesTrend')}</Text>
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
                          {period === 'month' ? d.dayLabel : d.weekday}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : null}

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
              <Text style={styles.cardTitle}>{t('reports.topProducts')}</Text>
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
                      </Text>
                    </View>
                    <MoneyText amount={p.totalSales} size={14} weight="700" color={colors.ink} />
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t('reports.paymentBreakdown')}</Text>
                <MoneyText amount={payTotal} size={14} weight="700" color={colors.ink} />
              </View>
              {payQuery.isLoading ? (
                <Skeleton height={120} />
              ) : payTotal === 0 ? (
                <Text style={styles.muted}>{t('reports.noPaymentsInPeriod')}</Text>
              ) : (
                payRows.map((row) => {
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
                })
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
    marginBottom: spacing.sm,
  },
  muted: {
    fontSize: 14,
    color: colors.muted,
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
