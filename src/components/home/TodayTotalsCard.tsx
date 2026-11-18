import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';

export function TodayTotalsCard({
  periodLabel,
  salesTotal,
  expectedCash,
  netProfit,
  totalDebt,
  showProfit,
  delta,
}: {
  periodLabel: string;
  salesTotal: number;
  expectedCash: number;
  netProfit: number;
  totalDebt: number;
  showProfit: boolean;
  delta: number | null;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Text style={styles.label}>
        {t('dashboard.sales')} · {periodLabel}
      </Text>
      <MoneyText amount={salesTotal} size={32} weight="800" color={colors.white} />
      {delta !== null ? (
        <View style={styles.deltaRow}>
          <Ionicons
            name={delta >= 0 ? 'trending-up' : 'trending-down'}
            size={16}
            color={delta >= 0 ? '#bbf7d0' : '#fecaca'}
          />
          <Text style={styles.deltaText}>
            {delta >= 0 ? '+' : '−'}
            {Math.abs(Math.round(delta * 100))}% {t('dashboard.vsPreviousDay')}
          </Text>
        </View>
      ) : salesTotal === 0 ? (
        <Text style={styles.deltaText}>{t('dashboard.noSalesYet')}</Text>
      ) : null}

      <View style={styles.metrics}>
        <Metric label={t('dashboard.cashLeft')} amount={expectedCash} />
        {showProfit ? (
          <Metric
            label={t('dashboard.netProfit')}
            amount={netProfit}
            color={netProfit < 0 ? '#fecaca' : netProfit > 0 ? '#bbf7d0' : undefined}
          />
        ) : null}
        <Metric
          label={t('dashboard.debtTotal')}
          amount={totalDebt}
          color={totalDebt > 0 ? '#fecaca' : undefined}
        />
      </View>
    </View>
  );
}

function Metric({ label, amount, color }: { label: string; amount: number; color?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.metricValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {amount.toLocaleString()}
      </Text>
      <Text style={styles.metricUnit}>RWF</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    gap: 4,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deltaText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  metrics: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  metric: { flex: 1, alignItems: 'center', minWidth: 0 },
  metricLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  metricValue: { fontSize: 17, fontWeight: '800', color: colors.white, marginTop: 2 },
  metricUnit: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
});
