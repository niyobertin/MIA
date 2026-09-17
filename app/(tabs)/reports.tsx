import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
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

type Period = 'today' | 'yesterday' | 'week' | 'month';

function isoDaysAgo(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
}

function rangeFor(period: Period): PeriodRange {
  const today = isoDaysAgo(0);
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
    default:
      return { start: today, end: today };
  }
}

export default function ReportsScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [period, setPeriod] = React.useState<Period>('week');
  const [refreshing, setRefreshing] = React.useState(false);

  const range = React.useMemo(() => rangeFor(period), [period]);
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

  const periods: Array<{ value: Period; label: string }> = [
    { value: 'today', label: t('reports.today') },
    { value: 'yesterday', label: t('reports.yesterday') },
    { value: 'week', label: t('reports.thisWeek') },
    { value: 'month', label: t('reports.thisMonth') },
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
        subtitle={`${range.start} → ${range.end}`}
        showBack={false}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
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
              onPress={() => setPeriod(item.value)}
            />
          ))}
        </ScrollView>

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
  periods: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
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
});
