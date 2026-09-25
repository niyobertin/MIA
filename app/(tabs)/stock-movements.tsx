import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/Input';
import { FilterChip } from '@/components/FilterChip';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { STOCK_MOVEMENT_TYPES } from '@/constants';
import { useUIStore } from '@/stores/uiStore';
import {
  useBusinessUsers,
  useProducts,
  useStockMovementHistory,
} from '@/hooks/useData';
import { getTodayDateString } from '@/utils/formatters';

export default function StockMovementsScreen() {
  const { t } = useTranslation();
  const { language } = useUIStore();
  const today = getTodayDateString();
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState(today);
  const [productId, setProductId] = React.useState('');
  const [type, setType] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [quantityText, setQuantityText] = React.useState('');

  const quantity = quantityText.trim() === '' ? undefined : Number(quantityText);
  const history = useStockMovementHistory({
    startDate: startDate.slice(0, 10),
    endDate: endDate.slice(0, 10),
    productId: productId || undefined,
    type: type || undefined,
    userId: userId || undefined,
    quantity: quantity != null && Number.isInteger(quantity) ? quantity : undefined,
  });
  const products = useProducts({ active: true });
  const users = useBusinessUsers();
  const [refreshing, setRefreshing] = React.useState(false);

  const labelFor = (value: string) => {
    const found = STOCK_MOVEMENT_TYPES.find((item) => item.value === value);
    if (!found) return value;
    return language === 'rw' ? found.labelRw : found.label;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await history.refetch();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('stock.movementHistory')} subtitle={t('stock.movementHistoryHint')} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Input label={t('stock.fromDate')} value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
        <Input label={t('stock.toDate')} value={endDate} onChangeText={setEndDate} autoCapitalize="none" />
        <Input
          label={t('stock.quantityFilter')}
          value={quantityText}
          onChangeText={setQuantityText}
          keyboardType="number-pad"
        />

        <Text style={styles.filterLabel}>{t('stock.products')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          <FilterChip label={t('common.all')} selected={!productId} onPress={() => setProductId('')} />
          {(products.data ?? []).map((product) => (
            <FilterChip
              key={product.id}
              label={product.name}
              selected={productId === product.id}
              onPress={() => setProductId(product.id)}
            />
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>{t('stock.movementType')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          <FilterChip label={t('common.all')} selected={!type} onPress={() => setType('')} />
          {STOCK_MOVEMENT_TYPES.map((item) => (
            <FilterChip
              key={item.value}
              label={language === 'rw' ? item.labelRw : item.label}
              selected={type === item.value}
              onPress={() => setType(item.value)}
            />
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>{t('stock.user')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          <FilterChip label={t('common.all')} selected={!userId} onPress={() => setUserId('')} />
          {(users.data ?? []).map((user) => (
            <FilterChip
              key={user.id}
              label={user.name}
              selected={userId === user.id}
              onPress={() => setUserId(user.id)}
            />
          ))}
        </ScrollView>

        {history.isLoading ? <Skeleton height={160} /> : null}
        {!history.isLoading && (history.data ?? []).length === 0 ? (
          <EmptyState icon="swap-horizontal" title={t('stock.noMovementsFiltered')} />
        ) : null}
        {(history.data ?? []).map((row) => (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.name}>{row.product_name}</Text>
              <Text style={styles.qty}>{row.quantity.toLocaleString()}</Text>
            </View>
            <Text style={styles.meta}>{labelFor(row.type)} · {row.user_name ?? '—'}</Text>
            <Text style={styles.meta}>{row.occurred_at.slice(0, 16).replace('T', ' ')}</Text>
            <Text style={styles.meta}>
              {t('stock.previousQty')}: {row.previous_quantity.toLocaleString()} → {t('stock.newQty')}: {row.new_quantity.toLocaleString()}
            </Text>
            {row.reason ? <Text style={styles.reason}>{row.reason}</Text> : null}
            {row.reversal_of ? <Text style={styles.reason}>{t('stock.reversal')}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  filterLabel: { fontSize: 13, fontWeight: '700', color: colors.body, marginBottom: spacing.sm, marginTop: spacing.sm },
  chips: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  qty: { fontSize: 16, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  reason: { fontSize: 13, color: colors.body, marginTop: 6 },
});
