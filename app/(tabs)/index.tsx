import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { AppHeader } from '@/components/AppHeader';
import { StatCard } from '@/components/StatCard';
import { MoneyText } from '@/components/MoneyText';
import { StatusBadge } from '@/components/StatusBadge';
import { SkeletonCard, Skeleton } from '@/components/Skeleton';
import { BottomSheet } from '@/components/SegmentedControl';
import { getInitials, formatTime } from '@/utils/formatters';
import { canSeeProfit } from '@/utils/permissions';
import {
  useDashboardStats,
  useLowStockProducts,
  useWeeklySales,
  useMonthlySales,
  useBusinessHealth,
  useTopProducts,
  usePaymentBreakdown,
  useSales,
  useCustomersWithBalances,
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
  const { width } = useWindowDimensions();
  const { business, user } = useAuthStore();
  const statsQuery = useDashboardStats();
  const sessionRange = React.useMemo(() => {
    const start = statsQuery.data?.sessionStart;
    const end = statsQuery.data?.sessionEnd;
    if (!start || !end) return null;
    return { start, end };
  }, [statsQuery.data?.sessionStart, statsQuery.data?.sessionEnd]);

  const lowStockQuery = useLowStockProducts();
  const weeklyQuery = useWeeklySales();
  const monthlyQuery = useMonthlySales();
  const healthQuery = useBusinessHealth();
  const topQuery = useTopProducts(sessionRange, 5);
  const paymentsQuery = usePaymentBreakdown(sessionRange);
  const salesQuery = useSales(sessionRange);
  const debtQuery = useCustomersWithBalances();

  const [refreshing, setRefreshing] = React.useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = React.useState(false);
  const [chartMode, setChartMode] = React.useState<'week' | 'month'>('week');

  const stats = statsQuery.data;
  const health = healthQuery.data;
  const lowStock = lowStockQuery.data ?? [];
  const week = weeklyQuery.data ?? [];
  const month = monthlyQuery.data ?? [];
  const loading = statsQuery.isLoading && !statsQuery.data;
  const payments = paymentsQuery.data;
  const topProducts = topQuery.data ?? [];
  const recentSales = (salesQuery.data ?? []).filter((sale) => !sale.voided).slice(0, 6);
  const debtors = (debtQuery.data?.rows ?? []).filter((row) => row.outstanding > 0).slice(0, 5);

  const showProfit = canSeeProfit(user?.role);
  const firstName = user?.name?.split(' ')[0] ?? '';
  const wide = width >= 980;
  const split = width >= 760;
  const statColumns = width >= 1100 ? 4 : width >= 720 ? 3 : 2;
  const statWidth = statColumns === 4 ? '23.5%' : statColumns === 3 ? '31%' : '47.5%';

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      statsQuery.refetch(),
      lowStockQuery.refetch(),
      weeklyQuery.refetch(),
      monthlyQuery.refetch(),
      healthQuery.refetch(),
      topQuery.refetch(),
      salesQuery.refetch(),
      paymentsQuery.refetch(),
      debtQuery.refetch(),
    ]);
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
  const collections =
    (payments?.collections?.cash ?? 0) +
    (payments?.collections?.mobileMoney ?? 0) +
    (payments?.collections?.bank ?? 0);
  const payMax = Math.max(
    1,
    payments?.cash ?? 0,
    payments?.mobileMoney ?? 0,
    payments?.bank ?? 0,
    payments?.credit ?? 0,
    collections
  );

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
        <View style={styles.page}>
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
              {health && !health.openDay ? (
                <TouchableOpacity style={styles.dayBanner} onPress={() => go('/closing')} activeOpacity={0.85}>
                  <Ionicons name="alert-circle" size={20} color={colors.warningText} />
                  <Text style={styles.dayBannerText}>{t('reports.noOpenDay')}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.warningText} />
                </TouchableOpacity>
              ) : null}

              <View style={styles.hero}>
                <View style={styles.heroTop}>
                  <View style={styles.heroCopy}>
                    <Text style={styles.heroLabel}>{t('dashboard.openDaySales')}</Text>
                    <MoneyText amount={stats?.todaySales ?? 0} size={wide ? 36 : 32} weight="800" color="#fff" />
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
                  {delta !== null && stats?.hasOpenDay ? (
                    <View style={styles.deltaRow}>
                      <Ionicons
                        name={delta >= 0 ? 'trending-up' : 'trending-down'}
                        size={14}
                        color={delta >= 0 ? '#bbf7d0' : '#fecaca'}
                      />
                      <Text style={styles.deltaText}>
                        {delta >= 0 ? '↑' : '↓'} {Math.abs(Math.round(delta * 100))}% {t('dashboard.vsPreviousDay')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {!stats?.hasOpenDay ? (
                  <Text style={styles.heroEmpty}>{t('dashboard.openDayRequired')}</Text>
                ) : (stats?.todaySales ?? 0) === 0 ? (
                  <Text style={styles.heroEmpty}>{t('dashboard.noSalesMessage')}</Text>
                ) : null}
                <TouchableOpacity style={styles.heroButton} onPress={() => go('/sale')} activeOpacity={0.85}>
                  <Ionicons name="add" size={20} color={colors.primary} />
                  <Text style={styles.heroButtonText}>{t('dashboard.recordSale')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.grid}>
                {showProfit ? (
                  <View style={[styles.statWrap, { width: statWidth }]}>
                    <StatCard title={t('dashboard.netProfit')} value={stats?.todayNetProfit ?? 0} color={colors.success} icon="trending-up" onPress={() => go('/reports')} />
                  </View>
                ) : null}
                <View style={[styles.statWrap, { width: statWidth }]}>
                  <StatCard title={t('dashboard.expenses')} value={stats?.todayExpenses ?? 0} color={colors.danger} icon="wallet" onPress={() => go('/expense')} />
                </View>
                <View style={[styles.statWrap, { width: statWidth }]}>
                  <StatCard title={t('dashboard.itemsSold')} value={stats?.itemsSold ?? 0} currency="" color={colors.warning} icon="bag" />
                </View>
                <View style={[styles.statWrap, { width: statWidth }]}>
                  <StatCard title={t('dashboard.stockValue')} value={stats?.stockValue ?? 0} color={colors.primary} icon="cube" onPress={() => go('/stock')} />
                </View>
                <View style={[styles.statWrap, { width: statWidth }]}>
                  <StatCard title={t('dashboard.cashBalance')} value={stats?.cashBalance ?? 0} color={colors.info} icon="cash" onPress={() => go('/closing')} />
                </View>
                {showProfit ? (
                  <View style={[styles.statWrap, { width: statWidth }]}>
                    <StatCard title={t('reports.customerDebt')} value={health?.customerDebt ?? 0} color={colors.warning} icon="people" onPress={() => go('/customers')} />
                  </View>
                ) : null}
                {showProfit ? (
                  <View style={[styles.statWrap, { width: statWidth }]}>
                    <StatCard title={t('reports.supplierDebt')} value={health?.supplierDebt ?? 0} color={colors.danger} icon="business" onPress={() => go('/suppliers')} />
                  </View>
                ) : null}
                <View style={[styles.statWrap, { width: statWidth }]}>
                  <StatCard title={t('reports.lowStockCount')} value={health?.lowStockCount ?? lowStock.length} currency="" color={colors.warning} icon="alert" onPress={() => go('/stock')} />
                </View>
              </View>

              <Text style={styles.sectionTitle}>{t('dashboard.quickActions')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickRow}
              >
                <QuickAction icon="cart" label={t('navigation.newSale')} bg={colors.primary} onPress={() => go('/sale')} />
                <QuickAction icon="cube" label={t('navigation.stockIn')} bg={colors.success} onPress={() => go('/stock-in')} />
                <QuickAction icon="cash" label={t('navigation.expense')} bg={colors.warning} onPress={() => go('/expense')} />
                <QuickAction icon="person" label={t('payments.payments')} bg={colors.info} onPress={() => setShowPaymentSheet(true)} />
                <QuickAction icon="bar-chart" label={t('navigation.reports')} bg={colors.primaryDark} onPress={() => go('/reports')} />
                <QuickAction icon="lock-closed" label={t('cash.openDay')} bg="#0f766e" onPress={() => go('/closing')} />
                <QuickAction icon="people" label={t('customers.customers')} bg="#7c3aed" onPress={() => go('/customers')} />
                <QuickAction icon="storefront" label={t('navigation.stock')} bg="#b45309" onPress={() => go('/stock')} />
              </ScrollView>

              <View style={split ? styles.columns : undefined}>
                <View style={split ? styles.columnMain : undefined}>
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{chartMode === 'week' ? t('dashboard.thisWeek') : t('dashboard.last30Days')}</Text>
                      <MoneyText amount={chartTotal} size={15} weight="700" color={colors.ink} />
                    </View>
                    <View style={styles.chartModes}>
                      <TouchableOpacity style={[styles.modeChip, chartMode === 'week' && styles.modeChipActive]} onPress={() => setChartMode('week')}>
                        <Text style={[styles.modeText, chartMode === 'week' && styles.modeTextActive]}>{t('dashboard.days7')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modeChip, chartMode === 'month' && styles.modeChipActive]} onPress={() => setChartMode('month')}>
                        <Text style={[styles.modeText, chartMode === 'month' && styles.modeTextActive]}>{t('dashboard.days30')}</Text>
                      </TouchableOpacity>
                    </View>
                    {chartLoading ? (
                      <Skeleton height={110} />
                    ) : chartMode === 'week' || width >= 1100 ? (
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
                            <Text style={[styles.barLabel, d.isToday && styles.barLabelToday]} numberOfLines={1}>
                              {chartMode === 'week' ? d.weekday : d.dayLabel}
                            </Text>
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
                      recentSales.map((sale) => (
                        <TouchableOpacity key={sale.id} style={styles.listRow} onPress={() => go('/sale')} activeOpacity={0.7}>
                          <View style={styles.saleAvatar}>
                            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.listInfo}>
                            <Text style={styles.listName} numberOfLines={1}>
                              {sale.reference_number || t('sales.saleDetails')}
                            </Text>
                            <Text style={styles.listDetail}>{saleClock(sale.created_at)}</Text>
                          </View>
                          <View style={styles.listRight}>
                            <MoneyText amount={sale.total_amount} size={14} weight="700" />
                            <StatusBadge
                              label={t(`sales.${sale.payment_status}` as 'sales.paid')}
                              tone={sale.payment_status === 'paid' ? 'success' : sale.payment_status === 'credit' ? 'warning' : 'neutral'}
                            />
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>

                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t('reports.topProducts')}</Text>
                      <TouchableOpacity onPress={() => go('/reports')} hitSlop={8}>
                        <Text style={styles.viewAll}>{t('navigation.reports')}</Text>
                      </TouchableOpacity>
                    </View>
                    {topQuery.isLoading ? (
                      <Skeleton height={52} />
                    ) : topProducts.length === 0 ? (
                      <Text style={styles.muted}>{t('reports.noSalesInPeriod')}</Text>
                    ) : (
                      topProducts.map((product) => (
                        <View key={product.productId} style={styles.listRow}>
                          <View style={styles.stockAvatar}>
                            <Text style={styles.stockAvatarText}>{getInitials(product.productName)}</Text>
                          </View>
                          <View style={styles.listInfo}>
                            <Text style={styles.listName} numberOfLines={1}>{product.productName}</Text>
                            <Text style={styles.listDetail}>
                              {product.quantitySold} {t('sales.items')}
                              {showProfit ? ` · ${t('reports.profit')} ${(product.totalProfit ?? 0).toLocaleString()}` : ''}
                            </Text>
                          </View>
                          <MoneyText amount={product.totalSales} size={14} weight="700" />
                        </View>
                      ))
                    )}
                  </View>
                </View>

                <View style={split ? styles.columnSide : undefined}>
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t('reports.businessHealth')}</Text>
                    </View>
                    <HealthRow
                      icon="sunny"
                      label={t('cash.openDay')}
                      value={health?.openDay ? t('common.yes') : t('common.no')}
                      tone={health?.openDay ? 'ok' : 'warn'}
                      onPress={() => go('/closing')}
                    />
                    <HealthRow
                      icon="cloud-upload"
                      label={t('reports.syncState')}
                      value={
                        (health?.failedSync ?? 0) > 0
                          ? `${health?.failedSync} ${t('common.failed')}`
                          : (health?.pendingSync ?? 0) > 0
                            ? t('settings.pendingSync', { count: health?.pendingSync ?? 0 })
                            : t('common.synced')
                      }
                      tone={(health?.failedSync ?? 0) > 0 ? 'bad' : (health?.pendingSync ?? 0) > 0 ? 'warn' : 'ok'}
                      onPress={() => go('/more/sync')}
                    />
                    <HealthRow
                      icon="alert"
                      label={t('reports.outOfStock')}
                      value={String(health?.outOfStockCount ?? 0)}
                      tone={(health?.outOfStockCount ?? 0) > 0 ? 'bad' : 'ok'}
                      onPress={() => go('/stock')}
                    />
                  </View>

                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t('reports.paymentBreakdown')}</Text>
                    </View>
                    {paymentsQuery.isLoading ? (
                      <Skeleton height={80} />
                    ) : (
                      <>
                        <PayBar label={t('sales.cash')} amount={payments?.cash ?? 0} max={payMax} color={colors.success} />
                        <PayBar label={t('sales.mobileMoney')} amount={payments?.mobileMoney ?? 0} max={payMax} color={colors.info} />
                        <PayBar label={t('sales.bank')} amount={payments?.bank ?? 0} max={payMax} color={colors.primary} />
                        <PayBar label={t('reports.newCreditSales')} amount={payments?.credit ?? 0} max={payMax} color={colors.warning} />
                        <PayBar label={t('reports.oldDebtCollected')} amount={collections} max={payMax} color="#7c3aed" />
                      </>
                    )}
                  </View>

                  {showProfit ? (
                    <View style={styles.card}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{t('dashboard.whoOwes')}</Text>
                        <TouchableOpacity onPress={() => go('/customers')} hitSlop={8}>
                          <Text style={styles.viewAll}>{t('dashboard.viewAll')}</Text>
                        </TouchableOpacity>
                      </View>
                      {debtQuery.isLoading ? (
                        <Skeleton height={52} />
                      ) : debtors.length === 0 ? (
                        <Text style={styles.muted}>{t('dashboard.noDebt')}</Text>
                      ) : (
                        debtors.map((row) => (
                          <TouchableOpacity key={row.customer.id} style={styles.listRow} onPress={() => go('/customers')} activeOpacity={0.7}>
                            <View style={styles.debtAvatar}>
                              <Text style={styles.debtAvatarText}>{getInitials(row.customer.name)}</Text>
                            </View>
                            <View style={styles.listInfo}>
                              <Text style={styles.listName} numberOfLines={1}>{row.customer.name}</Text>
                              {row.customer.phone ? <Text style={styles.listDetail}>{row.customer.phone}</Text> : null}
                            </View>
                            <MoneyText amount={row.outstanding} size={14} weight="700" color={colors.warningText} />
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  ) : null}

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
                      lowStock.slice(0, 5).map((p) => (
                        <TouchableOpacity key={p.id} style={styles.listRow} onPress={() => go('/stock')} activeOpacity={0.7}>
                          <View style={styles.stockAvatar}>
                            <Text style={styles.stockAvatarText}>{getInitials(p.name)}</Text>
                          </View>
                          <View style={styles.listInfo}>
                            <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
                            <Text style={styles.stockDetail}>
                              {(p.current_stock ?? 0)} {t('common.left')}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
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
        <Ionicons name={icon as any} size={22} color="#fff" />
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

function HealthRow({
  icon,
  label,
  value,
  tone,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'bad';
  onPress: () => void;
}) {
  const color = tone === 'ok' ? colors.success : tone === 'warn' ? colors.warning : colors.danger;
  return (
    <TouchableOpacity style={styles.healthRow} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={styles.healthLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.healthValue, { color }]} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

function saleClock(value: string): string {
  const match = value.match(/(\d{2}:\d{2})/);
  if (match) return match[1];
  return formatTime(value);
}

function PayBar({ label, amount, max, color }: { label: string; amount: number; max: number; color: string }) {
  const ratio = Math.max(amount > 0 ? 4 : 0, Math.round((amount / max) * 100));
  return (
    <View style={styles.payBar}>
      <View style={styles.payBarTop}>
        <Text style={styles.payBarLabel} numberOfLines={1}>{label}</Text>
        <MoneyText amount={amount} size={13} weight="700" />
      </View>
      <View style={styles.payTrack}>
        <View style={[styles.payFill, { width: `${ratio}%`, backgroundColor: color }]} />
      </View>
    </View>
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
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
  },
  page: {
    width: '100%',
  },
  heroSkeleton: {
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  dayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  dayBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.warningText,
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
  heroCopy: {
    flex: 1,
    marginRight: spacing.md,
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
  statWrap: {
    flexGrow: 1,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  columnMain: {
    flex: 1.45,
    minWidth: 0,
  },
  columnSide: {
    flex: 1,
    minWidth: 0,
  },
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
  viewAll: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
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
    minWidth: 0,
  },
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
    fontSize: 10,
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
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },
  listInfo: {
    flex: 1,
    minWidth: 0,
  },
  listName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  listDetail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  listRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  saleAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.dangerText,
  },
  debtAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.warningText,
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
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
    marginBottom: spacing.lg,
  },
  quickAction: {
    width: 88,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
    minHeight: 96,
    justifyContent: 'center',
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.body,
    textAlign: 'center',
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  healthLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.body,
    fontWeight: '600',
  },
  healthValue: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '48%',
    textAlign: 'right',
  },
  payBar: {
    marginBottom: spacing.sm,
  },
  payBarTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  payBarLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.body,
    fontWeight: '600',
  },
  payTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderSoft,
    overflow: 'hidden',
  },
  payFill: {
    height: 8,
    borderRadius: 4,
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
