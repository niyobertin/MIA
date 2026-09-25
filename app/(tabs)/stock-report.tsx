import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/Input';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { useDailyClosing, useDayStockLines, useTrackedStock } from '@/hooks/useData';
import { getTodayDateString } from '@/utils/formatters';

export default function StockReportScreen() {
  const { t } = useTranslation();
  const [date, setDate] = React.useState(getTodayDateString());
  const day = date.length >= 10 ? date.slice(0, 10) : '';
  const linesQuery = useDayStockLines(day || null);
  const closingQuery = useDailyClosing(day);
  const liveQuery = useTrackedStock();
  const [refreshing, setRefreshing] = React.useState(false);

  const lines = linesQuery.data ?? [];
  const isToday = day === getTodayDateString();
  const closed = closingQuery.data?.status === 'closed';
  const rows = lines.length
    ? lines.map((line) => ({
        id: line.product_id,
        name: line.product_name ?? line.product_id,
        unit: line.unit ?? '',
        qty: closed ? (line.closing_qty ?? line.opening_qty) : isToday
          ? (liveQuery.data?.find((row) => row.product_id === line.product_id)?.balance ?? line.opening_qty)
          : line.opening_qty,
      }))
    : isToday
      ? (liveQuery.data ?? []).map((row) => ({
          id: row.product_id,
          name: row.name,
          unit: row.unit,
          qty: row.balance,
        }))
      : [];

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([linesQuery.refetch(), closingQuery.refetch(), liveQuery.refetch()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('stock.stockReport')} subtitle={t('stock.stockReportHint')} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Input
          label={t('cash.businessDate')}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        {linesQuery.isLoading || liveQuery.isLoading ? <Skeleton height={180} /> : null}
        {!linesQuery.isLoading && rows.length === 0 ? (
          <EmptyState icon="cube-outline" title={t('stock.noStockForDate')} />
        ) : null}
        {rows.map((row) => (
          <View key={row.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name}>{row.name}</Text>
              <Text style={styles.unit}>{row.unit}</Text>
            </View>
            <Text style={styles.qty}>{row.qty.toLocaleString()}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  unit: { fontSize: 12, color: colors.muted, marginTop: 2 },
  qty: { fontSize: 18, fontWeight: '800', color: colors.ink },
});
