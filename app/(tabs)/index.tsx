import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { FirstTimeGuide } from '@/components/FirstTimeGuide';
import { DayStatusCard } from '@/components/home/DayStatusCard';
import { TodayTotalsCard } from '@/components/home/TodayTotalsCard';
import { QuickActions } from '@/components/home/QuickActions';
import { HomeAlerts } from '@/components/home/HomeAlerts';
import { PeriodSummary } from '@/components/home/PeriodSummary';
import { DashPeriod, useHomeDashboard } from '@/hooks/useHomeDashboard';
import { canSeeProfit } from '@/utils/permissions';
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
  const dash = useHomeDashboard();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  const firstName = user?.name?.split(' ')[0] ?? '';
  const go = (path: string) => router.push(path as never);

  const periodOptions: { value: DashPeriod; label: string; hidden?: boolean }[] = [
    { value: 'openDay', label: t('sales.openDayFilter'), hidden: !dash.openDayStart && dash.period !== 'openDay' },
    { value: 'today', label: t('reports.today') },
    { value: 'week', label: t('dashboard.thisWeek') },
    { value: 'month', label: t('dashboard.thisMonth') },
    { value: 'year', label: t('dashboard.thisYear') },
    { value: 'custom', label: t('reports.customRange') },
  ];
  const periodLabel = periodOptions.find((o) => o.value === dash.period)?.label ?? t('dashboard.periodFilter');
  const range = dash.range;
  const periodSubtitle = range
    ? dash.period === 'custom' || range.start.slice(0, 10) !== range.end.slice(0, 10)
      ? t('common.dateRange', { start: range.start.slice(0, 10), end: range.end.slice(0, 10) })
      : range.start.slice(0, 10)
    : '';

  const onRefresh = async () => {
    setRefreshing(true);
    await dash.refresh();
    setRefreshing(false);
  };

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
        {dash.loading ? (
          <>
            <Skeleton height={72} style={styles.skeleton} />
            <Skeleton height={180} style={styles.skeleton} />
          </>
        ) : (
          <>
            <DayStatusCard
              hasOpenDay={dash.hasOpenDay}
              sessionNumber={dash.sessionNumber}
              sessionDuration={dash.sessionDuration}
              onPress={() => go('/closing')}
            />
            <TodayTotalsCard
              periodLabel={periodLabel}
              salesTotal={dash.salesTotal}
              expectedCash={dash.expectedCash}
              netProfit={dash.netProfit}
              totalDebt={dash.totalDebt}
              showProfit={canSeeProfit(user?.role)}
              delta={dash.delta}
            />
            <QuickActions
              hasOpenDay={dash.hasOpenDay}
              onSale={() => go('/sale')}
              onStockIn={() => go('/stock-in')}
              onExpense={() => go('/expense')}
              onDay={() => go('/closing')}
              onPayment={() => go('/payment/customer-payment')}
            />
            <HomeAlerts
              lowStockNames={dash.lowStock.map((p) => p.name)}
              debtorNames={dash.debtors.map((r) => r.customer.name)}
              onLowStock={() => go('/stock')}
              onDebtors={() => go('/customers')}
            />

            <TouchableOpacity
              style={styles.detailsToggle}
              onPress={() => setShowDetails((v) => !v)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.detailsToggleText}>
                {showDetails ? t('dashboard.hideDetails') : t('dashboard.showDetails')}
              </Text>
              <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
            </TouchableOpacity>

            {showDetails ? (
              <PeriodSummary
                dash={dash}
                periodLabel={periodLabel}
                periodSubtitle={periodSubtitle}
                periodOptions={periodOptions.filter((o) => !o.hidden)}
                onOpenSales={() => go('/sale')}
              />
            ) : null}
          </>
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
  },
  skeleton: { borderRadius: radius.lg, marginBottom: spacing.lg },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    marginBottom: spacing.md,
  },
  detailsToggleText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
