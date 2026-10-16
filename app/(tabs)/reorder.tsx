import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { useReorderSuggestions } from '@/hooks/useReorderSuggestions';

export default function ReorderScreen() {
  const { t } = useTranslation();
  const { rows, totalCost, outCount, isLoading, isRefetching, refetch } = useReorderSuggestions();

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('stock.buySuggestions')} subtitle={t('stock.reorderHint')} />
      {isLoading ? (
        <View style={styles.content}>
          <Skeleton height={90} style={styles.skel} />
          <Skeleton height={90} style={styles.skel} />
          <Skeleton height={90} style={styles.skel} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={() => refetch()} />}
          ListHeaderComponent={
            rows.length > 0 ? (
              <View style={styles.summary}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>{t('stock.productsToBuy')}</Text>
                  <Text style={styles.summaryValue}>{rows.length.toLocaleString()}</Text>
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>{t('stock.outOfStock')}</Text>
                  <Text style={[styles.summaryValue, outCount > 0 && styles.summaryDanger]}>
                    {outCount.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>{t('stock.estimatedCost')}</Text>
                  <MoneyText amount={totalCost} size={15} weight="800" color={colors.ink} />
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState icon="checkmark-circle-outline" title={t('stock.noBuySuggestions')} />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.out ? `⚠ ${item.name}` : item.name}
                </Text>
                <Text style={styles.sub}>
                  {t('stock.reorderOnHand', {
                    qty: item.onHand.toLocaleString(),
                    level: item.reorderLevel.toLocaleString(),
                  })}
                </Text>
                <Text style={styles.suggest}>
                  {t('stock.reorderSuggest', { qty: item.suggested.toLocaleString(), unit: item.unit })}
                </Text>
                <Text style={styles.sub}>
                  {item.supplierName ?? t('stock.noSupplier')}
                  {' · '}
                  <MoneyText amount={item.estCost} size={12} weight="700" color={colors.ink} />
                </Text>
              </View>
              <Button variant="secondary" size="sm" onPress={() => router.push('/stock-in' as any)}>
                {t('stock.buyStock')}
              </Button>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },
  skel: { borderRadius: radius.lg, marginBottom: spacing.md },
  summary: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  summaryCol: { flex: 1 },
  summaryLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: colors.ink },
  summaryDanger: { color: colors.dangerText },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.card,
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  suggest: { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 2 },
});
