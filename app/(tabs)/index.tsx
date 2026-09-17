import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { AppHeader } from '@/components/AppHeader';
import { StatCard } from '@/components/StatCard';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonCard, Skeleton } from '@/components/Skeleton';
import { BottomSheet } from '@/components/SegmentedControl';
import { getInitials } from '@/utils/formatters';
import { canSeeProfit } from '@/utils/permissions';
import {
  useDashboardStats,
  useLowStockProducts,
  useWeeklySales,
  useMonthlySales,
} from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';

function greetingKey(): 'dashboard.greetingMorning' | 'dashboard.greetingAfternoon' | 'dashboard.greetingEvening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.greetingMorning';
  if (hour < 18) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { business, user } = useAuthStore();
  const statsQuery = useDashboardStats();
  const lowStockQuery = useLowStockProducts();
  const weeklyQuery = useWeeklySales();
  const monthlyQuery = useMonthlySales();

  const [refreshing, setRefreshing] = React.useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = React.useState(false);
  const [chartMode, setChartMode] = React.useState<'week' | 'month'>('week');

  const stats = statsQuery.data;
  const lowStock = lowStockQuery.data ?? [];
  const week = weeklyQuery.data ?? [];
  const month = monthlyQuery.data ?? [];
  const loading = statsQuery.isLoading && !statsQuery.data;

  const showProfit = canSeeProfit(user?.role);
  const firstName = user?.name?.split(' ')[0] ?? '';

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([statsQuery.refetch(), lowStockQuery.refetch(), weeklyQuery.refetch(), monthlyQuery.refetch()]);
    setRefreshing(false);
  };

  const go = (path: string) => router.push(path as any);

  const weekTotal = week.reduce((sum, d) => sum + d.total, 0);
  const monthTotal = month.reduce((sum, d) => sum + d.total, 0);
  const chartData = chartMode === 'week' ? week : month;
  const chartTotal = chartMode === 'week' ? weekTotal : monthTotal;
  const chartLoading = chartMode === 'week' ? weeklyQuery.isLoading : monthlyQuery.isLoading;
  const maxDay = Math.max(1, ...chartData.map((d) => d.total));
  const delta = stats?.salesDelta ?? null;

  return (
    <View style={styles.screen}>
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
        {loading ? (
          <>
            <Skeleton height={150} style={styles.heroSkeleton} />
            <View style={styles.grid}>
              <SkeletonCard />
              <SkeletonCard />
            </View>
          </>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.heroLabel}>{t('dashboard.today')} · {t('dashboard.sales')}</Text>
                  <MoneyText amount={stats?.todaySales ?? 0} size={32} weight="800" color="#fff" />
                </View>
                <View style={styles.heroBadge}>
                  <Ionicons name="cart" size={22} color={colors.primary} />
                </View>
              </View>
              <View style={styles.heroMeta}>
                {showProfit ? (
                  <Text style={styles.heroMetaText}>
                    {t('dashboard.grossProfit')}: <Text style={styles.heroMetaStrong}>{(stats?.todayGrossProfit ?? 0).toLocaleString()} RWF</Text>
                    {'  ·  '}{stats?.itemsSold ?? 0} {t('dashboard.itemsSold').toLowerCase()}
                  </Text>
                ) : (
                  <Text style={styles.heroMetaText}>
                    {stats?.itemsSold ?? 0} {t('dashboard.itemsSold').toLowerCase()}
                  </Text>
                )}
                {delta !== null ? (
                  <View style={styles.deltaRow}>
                    <Ionicons
                      name={delta >= 0 ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={delta >= 0 ? '#bbf7d0' : '#fecaca'}
                    />
                    <Text style={styles.deltaText}>
                      {delta >= 0 ? '↑' : '↓'} {Math.abs(Math.round(delta * 100))}% {t('dashboard.vsYesterday')}
                    </Text>
                  </View>
                ) : null}
              </View>
              {(stats?.todaySales ?? 0) === 0 ? (
                <Text style={styles.heroEmpty}>{t('dashboard.noSalesMessage')}</Text>
              ) : null}
              <TouchableOpacity style={styles.heroButton} onPress={() => go('/sale')} activeOpacity={0.85}>
                <Ionicons name="add" size={20} color={colors.primary} />
                <Text style={styles.heroButtonText}>{t('dashboard.recordSale')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {showProfit ? (
                <StatCard
                  title={t('dashboard.netProfit')}
                  value={stats?.todayNetProfit ?? 0}
                  color={colors.success}
                  icon="trending-up"
                />
              ) : null}
              <StatCard
                title={t('dashboard.expenses')}
                value={stats?.todayExpenses ?? 0}
                color={colors.danger}
                icon="wallet"
              />
              <StatCard
                title={t('dashboard.itemsSold')}
                value={stats?.itemsSold ?? 0}
                currency=""
                color={colors.warning}
                icon="bag"
              />
              <StatCard
                title={t('dashboard.stockValue')}
                value={stats?.stockValue ?? 0}
                color={colors.primary}
                icon="cube"
              />
              <StatCard
                title={t('dashboard.cashBalance')}
                value={stats?.cashBalance ?? 0}
                color={colors.info}
                icon="cash"
              />
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t('dashboard.thisWeek')}</Text>
                <MoneyText amount={chartTotal} size={15} weight="700" color={colors.ink} />
              </View>
              <View style={styles.chartModes}>
                <TouchableOpacity
                  style={[styles.modeChip, chartMode === 'week' && styles.modeChipActive]}
                  onPress={() => setChartMode('week')}
                >
                  <Text style={[styles.modeText, chartMode === 'week' && styles.modeTextActive]}>{t('dashboard.days7')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeChip, chartMode === 'month' && styles.modeChipActive]}
                  onPress={() => setChartMode('month')}
                >
                  <Text style={[styles.modeText, chartMode === 'month' && styles.modeTextActive]}>{t('dashboard.days30')}</Text>
                </TouchableOpacity>
              </View>
              {chartLoading ? (
                <Skeleton height={110} />
              ) : chartMode === 'week' ? (
                <View style={styles.chart}>
                  {chartData.map((d) => (
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
                      <Text style={[styles.barLabel, d.isToday && styles.barLabelToday]}>{d.weekday}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chartWide}>
                    {chartData.map((d, i) => (
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
                          {i % 5 === 0 || d.isToday ? d.dayLabel : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t('dashboard.lowStockAlerts')}</Text>
                {lowStock.length > 0 ? (
                  <TouchableOpacity onPress={() => go('/stock')} hitSlop={8}>
                    <Text style={styles.viewAll}>{t('dashboard.viewAll')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {lowStockQuery.isLoading ? (
                <Skeleton height={52} />
              ) : lowStock.length === 0 ? (
                <View style={styles.allGood}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.allGoodText}>{t('dashboard.allStocked')}</Text>
                </View>
              ) : (
                lowStock.slice(0, 3).map((p) => (
                  <TouchableOpacity key={p.id} style={styles.stockRow} onPress={() => go('/stock')} activeOpacity={0.7}>
                    <View style={styles.stockAvatar}>
                      <Text style={styles.stockAvatarText}>{getInitials(p.name)}</Text>
                    </View>
                    <View style={styles.stockInfo}>
                      <Text style={styles.stockName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.stockDetail}>
                        {(p.current_stock ?? 0)} {t('common.left')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                  </TouchableOpacity>
                ))
              )}
            </View>

            <Text style={styles.sectionTitle}>{t('dashboard.quickActions')}</Text>
            <View style={styles.quickGrid}>
              <QuickAction icon="cart" label={t('navigation.newSale')} bg={colors.primary} onPress={() => go('/sale')} />
              <QuickAction icon="cube" label={t('navigation.stockIn')} bg={colors.success} onPress={() => go('/stock-in')} />
              <QuickAction icon="cash" label={t('navigation.expense')} bg={colors.warning} onPress={() => go('/expense')} />
              <QuickAction icon="person" label={t('payments.payments')} bg={colors.info} onPress={() => setShowPaymentSheet(true)} />
            </View>
          </>
        )}
      </ScrollView>

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
    </View>
  );
}

function QuickAction({ icon, label, bg, onPress }: { icon: string; label: string; bg: string; onPress: () => void }) {
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  heroSkeleton: {
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primarySoft,
    marginBottom: 4,
  },
  heroBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMeta: {
    marginTop: spacing.sm,
  },
  heroMetaText: {
    fontSize: 13,
    color: colors.primarySoft,
  },
  heroMetaStrong: {
    fontWeight: '700',
    color: colors.white,
  },
  heroEmpty: {
    fontSize: 13,
    color: colors.primarySoft,
    marginTop: spacing.sm,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: spacing.lg,
    gap: 6,
    minHeight: 48,
  },
  heroButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
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
    paddingHorizontal: 6,
  },
  barFill: {
    width: '100%',
    maxWidth: 28,
    borderRadius: 6,
    minHeight: 4,
  },
  chartModes: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.borderSoft,
    minHeight: 32,
    justifyContent: 'center',
  },
  modeChipActive: {
    backgroundColor: colors.primary,
  },
  modeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  modeTextActive: {
    color: '#fff',
  },
  chartWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 132,
  },
  barColNarrow: {
    width: 22,
    alignItems: 'center',
  },
  barFillNarrow: {
    width: 12,
    borderRadius: 6,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 6,
    fontWeight: '600',
  },
  barLabelToday: {
    color: colors.primary,
    fontWeight: '800',
  },
  allGood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  allGoodText: {
    fontSize: 14,
    color: colors.muted,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  stockAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stockAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.dangerText,
  },
  stockInfo: {
    flex: 1,
  },
  stockName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  stockDetail: {
    fontSize: 12,
    color: colors.dangerText,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  quickAction: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    minHeight: 110,
    justifyContent: 'center',
  },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.body,
    textAlign: 'center',
  },
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
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  payInfo: {
    flex: 1,
  },
  payLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  payHint: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  sheetSpacer: {
    height: spacing.lg,
  },
});
