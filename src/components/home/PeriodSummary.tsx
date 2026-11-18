import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme/tokens';
import { FilterChip } from '@/components/FilterChip';
import { DashPeriod, useHomeDashboard } from '@/hooks/useHomeDashboard';
import { PaymentBreakdownCard } from './PaymentBreakdownCard';
import { SalesChartCard } from './SalesChartCard';
import { RecentSalesCard } from './RecentSalesCard';
import { CustomPeriodSheet } from './CustomPeriodSheet';

type Dashboard = ReturnType<typeof useHomeDashboard>;

export function PeriodSummary({
  dash,
  periodLabel,
  periodSubtitle,
  periodOptions,
  onOpenSales,
}: {
  dash: Dashboard;
  periodLabel: string;
  periodSubtitle: string;
  periodOptions: { value: DashPeriod; label: string }[];
  onOpenSales: () => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [showCustom, setShowCustom] = React.useState(false);
  const split = width >= 760;

  return (
    <View>
      <Text style={styles.title}>{t('dashboard.summaryTitle')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {periodOptions.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            selected={dash.period === option.value}
            onPress={() => (option.value === 'custom' ? setShowCustom(true) : dash.setPeriod(option.value))}
          />
        ))}
      </ScrollView>

      <View style={split ? styles.columns : undefined}>
        <View style={split ? styles.main : undefined}>
          <PaymentBreakdownCard
            periodLabel={periodLabel}
            salesTotal={dash.salesTotal}
            itemsSold={dash.itemsSold}
            breakdown={dash.breakdown}
          />
          <SalesChartCard
            title={periodLabel}
            subtitle={periodSubtitle}
            bars={dash.chartBars}
            loading={dash.chartLoading}
          />
        </View>
        <View style={split ? styles.side : undefined}>
          <RecentSalesCard
            sales={dash.sales}
            loading={dash.salesLoading}
            userMap={dash.userMap}
            onOpen={onOpenSales}
          />
        </View>
      </View>

      <CustomPeriodSheet
        visible={showCustom}
        onClose={() => setShowCustom(false)}
        onApply={(start, end) => {
          dash.applyCustomRange(start, end);
          setShowCustom(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  chips: { gap: spacing.xs, paddingBottom: spacing.md },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  main: { flex: 1.45, minWidth: 0 },
  side: { flex: 1, minWidth: 0 },
});
