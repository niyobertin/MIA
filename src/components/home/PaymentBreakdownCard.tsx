import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { homeCard } from './styles';

export function PaymentBreakdownCard({
  periodLabel,
  salesTotal,
  itemsSold,
  breakdown,
}: {
  periodLabel: string;
  salesTotal: number;
  itemsSold: number;
  breakdown: {
    cashSales: number;
    momoSales: number;
    bankSales: number;
    creditSales: number;
    totalCollected: number;
    debtCollected: number;
  };
}) {
  const { t } = useTranslation();
  const { cashSales, momoSales, bankSales, creditSales, totalCollected, debtCollected } = breakdown;
  return (
    <View style={homeCard.card}>
      <Text style={homeCard.title}>{t('reports.paymentBreakdown')}</Text>
      <Text style={homeCard.hint}>
        {periodLabel} · {itemsSold} {t('dashboard.itemsSold').toLowerCase()}
      </Text>

      <View style={styles.boxes}>
        <View style={[styles.box, styles.boxPaid]}>
          <Text style={[styles.boxTitle, { color: colors.successText }]}>{t('dashboard.totalCollected')}</Text>
          <MoneyText amount={totalCollected} size={17} weight="800" color={colors.successText} />
        </View>
        <View style={[styles.box, styles.boxCredit]}>
          <Text style={[styles.boxTitle, { color: colors.warningText }]}>{t('dashboard.creditUnpaid')}</Text>
          <MoneyText amount={creditSales} size={17} weight="800" color={colors.warningText} />
        </View>
      </View>

      <View style={styles.rows}>
        <MethodRow icon="cash-outline" label={t('common.cash')} amount={cashSales} total={salesTotal} color={colors.success} />
        <MethodRow
          icon="phone-portrait-outline"
          label={t('common.mobileMoney')}
          amount={momoSales}
          total={salesTotal}
          color={colors.info}
        />
        {bankSales > 0 ? (
          <MethodRow icon="business-outline" label={t('common.bank')} amount={bankSales} total={salesTotal} color={colors.primary} />
        ) : null}
        <MethodRow
          icon="document-text-outline"
          label={t('reports.newCreditSales')}
          amount={creditSales}
          total={salesTotal}
          color={colors.warning}
        />
        {debtCollected > 0 ? (
          <MethodRow
            icon="wallet-outline"
            label={t('reports.oldDebtCollected')}
            amount={debtCollected}
            total={Math.max(salesTotal, debtCollected)}
            color="#7c3aed"
          />
        ) : null}
      </View>
    </View>
  );
}

function MethodRow({
  icon,
  label,
  amount,
  total,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  amount: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <View style={styles.method}>
      <View style={styles.methodHead}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={styles.methodName}>{label}</Text>
        <MoneyText amount={amount} size={15} weight="700" color={colors.ink} />
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(amount > 0 ? 3 : 0, pct)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  box: { flex: 1, borderRadius: radius.md, padding: spacing.md, gap: 4, borderWidth: 1 },
  boxPaid: { backgroundColor: colors.successSoft, borderColor: '#bbf7d0' },
  boxCredit: { backgroundColor: colors.warningSoft, borderColor: '#fde68a' },
  boxTitle: { fontSize: 13, fontWeight: '700' },
  rows: { gap: spacing.md },
  method: { gap: 6 },
  methodHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  methodName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.body },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.borderSoft, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
