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
import { getInitials, formatRecordDateTime, formatCurrency } from '@/utils/formatters';
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
  useSuppliers,
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
  const [adjustReason, setAdjustReason] = React.useState('');
  const adjustStock = useAdjustStock();

  const product = productQuery.data;
  const stock = balanceQuery.data ?? product?.current_stock ?? null;
  const movements = movementsQuery.data ?? [];
  const category = categories?.find((c) => c.id === product?.category_id);
  const { data: suppliers } = useSuppliers();
  const preferredSupplier = suppliers?.find((s) => s.id === product?.preferred_supplier_id) ?? null;
  const [showSupplier, setShowSupplier] = React.useState(false);

  const handleSupplier = async (supplierId: string | null) => {
    if (!id) return;
    try {
      await updateProduct.mutateAsync({ id, updates: { preferred_supplier_id: supplierId } });
      setShowSupplier(false);
      showToast(t('stock.supplierSaved'), 'success');
      await productQuery.refetch();
    } catch {
      showToast(t('stock.productFailed'), 'error');
    }
  };
  const loading = productQuery.isLoading;
  const canEdit = canManageInventory(user?.role);

  const stockValue = stock !== null && product ? stock * product.average_cost : null;
  const isLow = stock !== null && product ? stock <= product.reorder_level && stock > 0 : false;
  const isOut = stock !== null ? stock <= 0 : false;
  const unitProfit = product ? product.selling_price - product.average_cost : 0;
  const marginPercent =
    product && product.selling_price > 0 ? Math.round((unitProfit / product.selling_price) * 100) : 0;
  const isProfitPositive = unitProfit >= 0;

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
            {/* HERO CARD */}
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(product.name)}</Text>
                </View>
                <View style={styles.heroInfo}>
                  <Text style={styles.name}>{product.name}</Text>
                  <View style={styles.tagRow}>
                    {category ? (
                      <View style={styles.categoryBadge}>
                        <Ionicons name="folder-outline" size={12} color={colors.primary} />
                        <Text style={styles.categoryBadgeText}>{category.name}</Text>
                      </View>
                    ) : null}
                    {product.sku ? (
                      <View style={styles.skuBadge}>
                        <Text style={styles.skuBadgeText}>{product.sku}</Text>
                      </View>
                    ) : null}
                    {product.unit ? (
                      <View style={styles.unitBadge}>
                        <Text style={styles.unitBadgeText}>{product.unit}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {stock !== null && product.track_inventory ? (
                <View style={styles.heroStatusRow}>
                  <View
                    style={[
                      styles.statusPillWrap,
                      {
                        backgroundColor: isOut ? '#FEE2E2' : isLow ? '#FEF3C7' : '#DCFCE7',
                        borderColor: isOut ? '#FCA5A5' : isLow ? '#FCD34D' : '#86EFAC',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor: isOut
                            ? colors.danger
                            : isLow
                              ? colors.warning
                              : colors.success,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color: isOut
                            ? colors.dangerText
                            : isLow
                              ? colors.warningText
                              : colors.successText,
                        },
                      ]}
                    >
                      {isOut
                        ? t('stock.outOfStock')
                        : isLow
                          ? `${t('stock.lowStock')} (${stock} ${product.unit})`
                          : `${t('stock.inStock')} (${stock} ${product.unit})`}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* ACTION SHORTCUTS */}
            {canEdit ? (
              <View style={styles.actionsBar}>
                {product.track_inventory ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                    onPress={() => router.push('/stock-in' as any)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle" size={18} color={colors.white} />
                    <Text style={styles.actionBtnPrimaryText}>{t('navigation.stockIn')}</Text>
                  </TouchableOpacity>
                ) : null}

                {product.track_inventory ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnSecondary]}
                    onPress={() => setShowAdjust(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="swap-vertical" size={17} color={colors.ink} />
                    <Text style={styles.actionBtnSecondaryText}>{t('stock.adjustStock')}</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnSecondary]}
                  onPress={() => setShowEdit(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pencil" size={16} color={colors.ink} />
                  <Text style={styles.actionBtnSecondaryText}>{t('common.edit')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteIconButton}
                  onPress={() => setShowDelete(true)}
                  activeOpacity={0.8}
                  accessibilityLabel={t('common.delete')}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ) : null}

            {/* 2X2 FINANCIAL & INVENTORY METRICS GRID */}
            <View style={styles.metricsGrid}>
              {/* Tile 1: Selling Price & Unit Margin */}
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{t('stock.sellingPrice')}</Text>
                <MoneyText amount={product.selling_price} size={18} weight="800" color={colors.ink} />
                <View
                  style={[
                    styles.profitBadge,
                    {
                      backgroundColor: isProfitPositive ? '#DCFCE7' : '#FFE4E6',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.profitBadgeText,
                      { color: isProfitPositive ? '#15803D' : '#BE123C' },
                    ]}
                  >
                    {isProfitPositive ? '+' : ''}{formatCurrency(unitProfit)} · {marginPercent}%
                  </Text>
                </View>
              </View>

              {/* Tile 2: Cost Price / Average Cost */}
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{t('stock.averageCost')}</Text>
                <MoneyText amount={product.average_cost} size={18} weight="800" color={colors.body} />
                <Text style={styles.metricHelper}>{t('stock.costPrice')}</Text>
              </View>

              {/* Tile 3: Current Stock on hand */}
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{t('stock.currentStock')}</Text>
                <Text style={styles.stockMainNumber}>
                  {stock !== null ? stock : '—'} <Text style={styles.stockUnitText}>{product.unit}</Text>
                </Text>
                <Text style={styles.metricHelper}>
                  {t('stock.reorderLevel')}: {product.reorder_level}
                </Text>
              </View>

              {/* Tile 4: Stock Valuation */}
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{t('stock.stockValue')}</Text>
                <MoneyText amount={stockValue ?? 0} size={18} weight="800" color={colors.ink} />
                <Text style={styles.metricHelper}>
                  {stock ?? 0} × {formatCurrency(product.average_cost)}
                </Text>
              </View>
            </View>

            {/* PRODUCT SPECIFICATIONS / DETAILS */}
            <View style={styles.detailsCard}>
              <Text style={styles.sectionHeader}>{t('stock.priceHelpTitle')}</Text>

              {category ? (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelWrap}>
                    <Ionicons name="folder-outline" size={17} color={colors.muted} />
                    <Text style={styles.detailLabel}>{t('stock.addCategory')}</Text>
                  </View>
                  <Text style={styles.detailValue}>{category.name}</Text>
                </View>
              ) : null}

              {product.barcode ? (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelWrap}>
                    <Ionicons name="barcode-outline" size={17} color={colors.muted} />
                    <Text style={styles.detailLabel}>{t('stock.barcode')}</Text>
                  </View>
                  <Text style={styles.monoValue}>{product.barcode}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.detailRow}
                onPress={canEdit ? () => setShowSupplier(true) : undefined}
                activeOpacity={canEdit ? 0.7 : 1}
              >
                <View style={styles.detailLabelWrap}>
                  <Ionicons name="business-outline" size={17} color={colors.muted} />
                  <Text style={styles.detailLabel}>{t('stock.preferredSupplier')}</Text>
                </View>
                <View style={styles.supplierValueWrap}>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {preferredSupplier ? preferredSupplier.name : t('stock.noSupplier')}
                  </Text>
                  {canEdit ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null}
                </View>
              </TouchableOpacity>
            </View>

            {/* STOCK MOVEMENT HISTORY */}
            <View style={styles.card}>
              <View style={styles.historyHeader}>
                <Text style={styles.cardTitle}>{t('stock.movementHistory')}</Text>
                {movements.length > 0 ? (
                  <View style={styles.historyCountBadge}>
                    <Text style={styles.historyCountText}>{movements.length}</Text>
                  </View>
                ) : null}
              </View>

              {movementsQuery.isLoading ? (
                <Skeleton height={120} />
              ) : movements.length === 0 ? (
                <EmptyState icon="swap-horizontal-outline" title={t('stock.noMovements')} />
              ) : (
                movements.map((m) => {
                  const incoming = IN_TYPES.includes(m.type);
                  return (
                    <View key={m.id} style={styles.moveRow}>
                      <View style={[styles.moveIcon, { backgroundColor: incoming ? '#DCFCE7' : '#FEE2E2' }]}>
                        <Ionicons
                          name={incoming ? 'arrow-down' : 'arrow-up'}
                          size={16}
                          color={incoming ? '#15803D' : '#DC2626'}
                        />
                      </View>
                      <View style={styles.moveInfo}>
                        <Text style={styles.moveTitle}>{movementLabel(m.type)}</Text>
                        <Text style={styles.moveSub}>{formatRecordDateTime(m.occurred_at)}</Text>
                      </View>
                      <Text style={[styles.moveQty, { color: incoming ? '#15803D' : '#DC2626' }]}>
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
        <Input
          label={t('stock.reason')}
          value={adjustReason}
          onChangeText={setAdjustReason}
        />
        <Button
          variant="primary"
          fullWidth
          loading={adjustStock.isPending}
          onPress={() => {
            if (!id) return;
            const quantity = Number(adjustQty);
            if (!adjustReason.trim()) {
              showToast(t('stock.reasonRequired'), 'error');
              return;
            }
            adjustStock.mutate(
              { productId: id, kind: adjustKind, quantity, reason: adjustReason.trim() },
              {
                onSuccess: () => {
                  setShowAdjust(false);
                  setAdjustQty('1');
                  setAdjustReason('');
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

      <BottomSheet visible={showSupplier} onClose={() => setShowSupplier(false)} title={t('stock.preferredSupplier')}>
        <TouchableOpacity
          style={styles.supplierOption}
          onPress={() => void handleSupplier(null)}
          activeOpacity={0.8}
        >
          <Text style={styles.supplierName}>{t('stock.noSupplier')}</Text>
          {product?.preferred_supplier_id == null ? (
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          ) : null}
        </TouchableOpacity>
        {(suppliers ?? []).map((s) => {
          const active = product?.preferred_supplier_id === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={styles.supplierOption}
              onPress={() => void handleSupplier(s.id)}
              activeOpacity={0.8}
            >
              <View style={styles.supplierInfo}>
                <Text style={styles.supplierName}>{s.name}</Text>
                {s.phone ? <Text style={styles.supplierPhone}>{s.phone}</Text> : null}
              </View>
              {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
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
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#059669',
  },
  heroInfo: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  skuBadge: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  skuBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  unitBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.body,
  },
  heroStatusRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statusPillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionsBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  actionBtnSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  deleteIconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...shadows.card,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 4,
  },
  profitBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  profitBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricHelper: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  stockMainNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  stockUnitText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 14,
    ...shadows.card,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  detailLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.body,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  monoValue: {
    fontSize: 13,
    color: colors.ink,
    fontFamily: 'monospace',
  },
  supplierValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'flex-end',
    marginLeft: 16,
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
  supplierOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: spacing.md,
    minHeight: 56,
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  supplierPhone: {
    fontSize: 13,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.card,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  historyCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  historyCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 12,
  },
  moveIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveInfo: {
    flex: 1,
  },
  moveTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  moveSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  moveQty: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
