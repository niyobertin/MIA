import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ConfirmModal } from '@/components/ConfirmModal';
import { BottomSheet } from '@/components/SegmentedControl';
import { AddProductSheet, AddProductData } from '@/components/AddProductSheet';
import { getInitials } from '@/utils/formatters';
import { STOCK_MOVEMENT_TYPES } from '@/constants';
import { useUIStore } from '@/stores/uiStore';
import { showToast } from '@/stores/toastStore';
import { canManageInventory } from '@/utils/permissions';
import { useAuthStore } from '@/stores/authStore';
import {
  useProduct,
  useStockBalance,
  useStockMovements,
  useCategories,
  useUpdateProduct,
  useDeleteProduct,
  useCreateCategory,
  useAdjustStock,
} from '@/hooks/useData';

const IN_TYPES = ['opening', 'purchase', 'return_in', 'adjustment_in'];

export default function ProductDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { language } = useUIStore();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();

  const productQuery = useProduct(id ?? '');
  const balanceQuery = useStockBalance(id ?? null);
  const movementsQuery = useStockMovements(id ?? null, 50);
  const { data: categories, refetch: refetchCategories } = useCategories();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createCategory = useCreateCategory();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showEdit, setShowEdit] = React.useState(false);
  const [showDelete, setShowDelete] = React.useState(false);
  const [showAdjust, setShowAdjust] = React.useState(false);
  const [adjustKind, setAdjustKind] = React.useState<'adjustment_in' | 'adjustment_out' | 'damaged'>('damaged');
  const [adjustQty, setAdjustQty] = React.useState('1');
  const adjustStock = useAdjustStock();

  const product = productQuery.data;
  const stock = balanceQuery.data ?? product?.current_stock ?? null;
  const movements = movementsQuery.data ?? [];
  const category = categories?.find((c) => c.id === product?.category_id);
  const loading = productQuery.isLoading;
  const canEdit = canManageInventory(user?.role);

  const stockValue = stock !== null && product ? stock * product.average_cost : null;
  const isLow = stock !== null && product ? stock <= product.reorder_level && stock > 0 : false;
  const isOut = stock !== null ? stock <= 0 : false;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([productQuery.refetch(), balanceQuery.refetch(), movementsQuery.refetch()]);
    setRefreshing(false);
  };

  const movementLabel = (type: string) => {
    const found = STOCK_MOVEMENT_TYPES.find((m) => m.value === type);
    if (!found) return type;
    return language === 'rw' ? found.labelRw : found.label;
  };

  const handleUpdate = async (data: AddProductData) => {
    if (!id) return;
    try {
      await updateProduct.mutateAsync({
        id,
        updates: {
          name: data.name,
          sku: data.sku || null,
          barcode: data.barcode || null,
          category_id: data.category_id || null,
          unit: data.unit,
          selling_price: data.selling_price,
          average_cost: data.average_cost,
          reorder_level: data.reorder_level,
          track_inventory: data.track_inventory,
        },
      });
      setShowEdit(false);
      showToast(t('stock.productUpdated'), 'success');
      await productQuery.refetch();
    } catch {
      showToast(t('stock.productFailed'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteProduct.mutateAsync(id);
      setShowDelete(false);
      showToast(t('stock.productDeleted'), 'success');
      router.back();
    } catch {
      showToast(t('stock.productFailed'), 'error');
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={StyleSheet.flatten([
          styles.content,
          { paddingTop: insets.top + spacing.sm },
        ])}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.back} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>

        {loading || !product ? (
          <>
            <Skeleton height={120} style={styles.skel} />
            <Skeleton height={160} style={styles.skel} />
          </>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(product.name)}</Text>
              </View>
              <View style={styles.heroInfo}>
                <Text style={styles.name}>{product.name}</Text>
                <Text style={styles.meta}>
                  {[product.sku, product.unit].filter(Boolean).join(' · ')}
                </Text>
                {category ? <Text style={styles.meta}>{category.name}</Text> : null}
              </View>
              {stock !== null && product.track_inventory ? (
                <StatusBadge
                  label={
                    isOut
                      ? t('stock.outOfStock')
                      : isLow
                        ? `${t('stock.lowStock')} · ${stock}`
                        : `${t('stock.inStock')} · ${stock}`
                  }
                  tone={isOut ? 'danger' : isLow ? 'warning' : 'success'}
                />
              ) : null}
            </View>

            {canEdit ? (
              <View style={styles.actions}>
                <Button variant="secondary" onPress={() => setShowEdit(true)} style={styles.actionBtn}>
                  {t('common.edit')}
                </Button>
                <Button variant="danger" onPress={() => setShowDelete(true)} style={styles.actionBtn}>
                  {t('common.delete')}
                </Button>
              </View>
            ) : null}
            {canEdit && product.track_inventory ? (
              <Button variant="secondary" onPress={() => setShowAdjust(true)} style={styles.adjustBtn}>
                {t('stock.adjustStock')}
              </Button>
            ) : null}

            <View style={styles.priceCard}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{t('stock.sellingPrice')}</Text>
                <MoneyText amount={product.selling_price} size={20} weight="800" color={colors.ink} />
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{t('stock.averageCost')}</Text>
                <MoneyText amount={product.average_cost} size={15} weight="600" color={colors.body} />
              </View>
              <View style={styles.divider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{t('stock.currentStock')}</Text>
                <Text style={styles.stockNumber}>{stock !== null ? stock : '—'}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{t('stock.reorderLevel')}</Text>
                <Text style={styles.stockNumber}>{product.reorder_level}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{t('stock.stockValue')}</Text>
                <MoneyText amount={stockValue ?? 0} size={15} weight="700" color={colors.ink} />
              </View>
              {product.barcode ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>{t('stock.barcode')}</Text>
                  <Text style={styles.mono}>{product.barcode}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('stock.movementHistory')}</Text>
              {movementsQuery.isLoading ? (
                <Skeleton height={120} />
              ) : movements.length === 0 ? (
                <EmptyState icon="swap-horizontal-outline" title={t('stock.noMovements')} />
              ) : (
                movements.map((m) => {
                  const incoming = IN_TYPES.includes(m.type);
                  return (
                    <View key={m.id} style={styles.moveRow}>
                      <View style={[styles.moveIcon, { backgroundColor: incoming ? colors.successSoft : colors.dangerSoft }]}>
                        <Ionicons
                          name={incoming ? 'arrow-down' : 'arrow-up'}
                          size={16}
                          color={incoming ? colors.successText : colors.dangerText}
                        />
                      </View>
                      <View style={styles.moveInfo}>
                        <Text style={styles.moveTitle}>{movementLabel(m.type)}</Text>
                        <Text style={styles.moveSub}>{m.occurred_at.slice(0, 10)}</Text>
                      </View>
                      <Text style={[styles.moveQty, { color: incoming ? colors.successText : colors.dangerText }]}>
                        {incoming ? '+' : '-'}{m.quantity}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>

      <AddProductSheet
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        categories={categories ?? []}
        mode="edit"
        initialProduct={product}
        lockCost={movements.length > 0}
        saving={updateProduct.isPending}
        onSubmit={handleUpdate}
        onCreateCategory={async (name) => {
          const created = await createCategory.mutateAsync({ name });
          await refetchCategories();
          showToast(t('stock.categoryAdded'), 'success');
          return created;
        }}
      />

      <ConfirmModal
        visible={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void handleDelete()}
        title={t('stock.deleteProduct')}
        message={t('stock.deleteProductConfirm')}
        confirmText={t('common.delete')}
        variant="danger"
        loading={deleteProduct.isPending}
      />

      <BottomSheet visible={showAdjust} onClose={() => setShowAdjust(false)} title={t('stock.adjustStockTitle')}>
        <View style={styles.kindRow}>
          {([
            ['damaged', t('stock.damagedGoods')],
            ['adjustment_out', t('stock.countOut')],
            ['adjustment_in', t('stock.countIn')],
          ] as const).map(([kind, label]) => (
            <TouchableOpacity
              key={kind}
              style={[styles.kindChip, adjustKind === kind && styles.kindChipActive]}
              onPress={() => setAdjustKind(kind)}
            >
              <Text style={[styles.kindText, adjustKind === kind && styles.kindTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Input
          label={t('stock.adjustQuantity')}
          value={adjustQty}
          onChangeText={setAdjustQty}
          keyboardType="number-pad"
        />
        <Button
          variant="primary"
          fullWidth
          loading={adjustStock.isPending}
          onPress={() => {
            if (!id) return;
            const quantity = Number(adjustQty);
            adjustStock.mutate(
              { productId: id, kind: adjustKind, quantity },
              {
                onSuccess: () => {
                  setShowAdjust(false);
                  setAdjustQty('1');
                  showToast(t('stock.stockAdjusted'), 'success');
                },
                onError: (error) => {
                  const code = error instanceof Error ? error.message : '';
                  if (code === 'DAY_CLOSED') showToast(t('cash.dayAlreadyClosed'), 'error');
                  else if (code === 'INSUFFICIENT_STOCK') showToast(t('sales.insufficientStock', { product: product?.name ?? '' }), 'error');
                  else showToast(t('stock.adjustFailed'), 'error');
                },
              }
            );
          }}
        >
          {t('common.save')}
        </Button>
      </BottomSheet>
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
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  backText: {
    fontSize: 15,
    color: colors.ink,
    fontWeight: '600',
  },
  skel: {
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
  },
  heroInfo: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
  adjustBtn: {
    marginTop: spacing.sm,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  kindChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.borderSoft,
  },
  kindChipActive: {
    backgroundColor: colors.primary,
  },
  kindText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.body,
  },
  kindTextActive: {
    color: colors.white,
  },
  priceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  priceLabel: {
    fontSize: 14,
    color: colors.body,
  },
  stockNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  mono: {
    fontSize: 13,
    color: colors.body,
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.md,
  },
  moveIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveInfo: {
    flex: 1,
  },
  moveTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  moveSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  moveQty: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
