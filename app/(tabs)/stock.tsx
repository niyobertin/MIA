import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ScrollView, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { colors, spacing, radius } from '@/theme/tokens';
import { ProductCard } from '@/components/ProductCard';
import { SearchBar } from '@/components/SearchBar';
import { FilterChip } from '@/components/FilterChip';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { SyncIndicator } from '@/components/SyncIndicator';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { BottomSheet } from '@/components/SegmentedControl';
import { Button } from '@/components/Button';
import { showToast } from '@/stores/toastStore';
import { canManageInventory } from '@/utils/permissions';
import {
  useProducts,
  useCategories,
  useCreateProduct,
  useCreateCategory,
  useImportProducts,
} from '@/hooks/useData';
import { useReorderSuggestions } from '@/hooks/useReorderSuggestions';
import { useAuthStore } from '@/stores/authStore';
import { MoneyText } from '@/components/MoneyText';
import { AddProductSheet } from '@/components/AddProductSheet';
import {
  pickAndParseProductFile,
  shareProductImportTemplate,
  ProductImportParseResult,
} from '@/services/products/importProducts';

export default function StockScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { data: products, isLoading, refetch, isRefetching } = useProducts({ active: true });
  const { data: categories, refetch: refetchCategories } = useCategories();
  const {
    rows: reorderRows,
    totalCost: reorderTotalCost,
    outCount: reorderOutCount,
  } = useReorderSuggestions();
  const createProductMutation = useCreateProduct();
  const createCategory = useCreateCategory();
  const importProducts = useImportProducts();

  const [searchQuery, setSearchQuery] = React.useState('');
  const [liveQuery, setLiveQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [showAddProduct, setShowAddProduct] = React.useState(false);
  const [importPreview, setImportPreview] = React.useState<ProductImportParseResult | null>(null);
  const [picking, setPicking] = React.useState(false);

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLiveQuery(text), 250);
  };

  const statusCounts = React.useMemo(() => {
    let low = 0;
    let out = 0;
    for (const p of products ?? []) {
      if (p.track_inventory) {
        const stock = p.current_stock ?? 0;
        if (stock <= 0) out++;
        else if (stock <= (p.reorder_level ?? 0)) low++;
      }
    }
    return { low, out };
  }, [products]);

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: products?.length ?? 0 };
    for (const p of products ?? []) {
      if (p.category_id) {
        counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [products]);

  const filterOptions = React.useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      count?: number;
      icon?: keyof typeof Ionicons.glyphMap;
      variant?: 'default' | 'warning' | 'danger';
    }> = [
      {
        id: 'all',
        label: t('common.all'),
        count: products?.length ?? 0,
        icon: 'layers-outline',
      },
    ];

    if (statusCounts.low > 0) {
      list.push({
        id: 'status_low',
        label: t('stock.lowStock'),
        count: statusCounts.low,
        icon: 'alert-circle-outline',
        variant: 'warning',
      });
    }

    if (statusCounts.out > 0) {
      list.push({
        id: 'status_out',
        label: t('stock.outOfStock'),
        count: statusCounts.out,
        icon: 'close-circle-outline',
        variant: 'danger',
      });
    }

    for (const cat of categories ?? []) {
      const count = categoryCounts[cat.id] ?? 0;
      list.push({
        id: cat.id,
        label: cat.name,
        count,
        icon: 'folder-outline',
      });
    }

    return list;
  }, [products, categories, statusCounts, categoryCounts, t]);

  const filteredProducts = React.useMemo(() => {
    let result = products ?? [];
    if (liveQuery) {
      const q = liveQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
      );
    }
    if (selectedCategory === 'status_low') {
      result = result.filter(
        (p) =>
          p.track_inventory &&
          (p.current_stock ?? 0) <= (p.reorder_level ?? 0) &&
          (p.current_stock ?? 0) > 0
      );
    } else if (selectedCategory === 'status_out') {
      result = result.filter((p) => p.track_inventory && (p.current_stock ?? 0) <= 0);
    } else if (selectedCategory !== 'all') {
      result = result.filter((p) => p.category_id === selectedCategory);
    }
    return result;
  }, [products, liveQuery, selectedCategory]);

  const stats = React.useMemo(() => {
    const list = products ?? [];
    const totalCount = list.length;
    let totalValue = 0;
    let lowCount = 0;
    for (const p of list) {
      const stock = p.current_stock ?? 0;
      totalValue += stock * (p.average_cost ?? 0);
      if (p.track_inventory && stock <= (p.reorder_level ?? 0)) {
        lowCount++;
      }
    }
    return { totalCount, totalValue, lowCount };
  }, [products]);

  const canEdit = canManageInventory(user?.role);

  const handleCreate = async (data: {
    name: string;
    sku?: string;
    barcode?: string;
    category_id?: string;
    unit: string;
    selling_price: number;
    average_cost: number;
    reorder_level: number;
    track_inventory: boolean;
  }) => {
    try {
      await createProductMutation.mutateAsync({
        business_id: '',
        category_id: data.category_id || null,
        preferred_supplier_id: null,
        name: data.name,
        sku: data.sku || null,
        barcode: data.barcode || null,
        unit: data.unit,
        selling_price: data.selling_price,
        average_cost: data.average_cost,
        reorder_level: data.reorder_level,
        track_inventory: data.track_inventory,
        active: true,
      });
      setShowAddProduct(false);
      showToast(t('stock.productAdded'), 'success');
      refetch();
    } catch {
      showToast(t('stock.productFailed'), 'error');
    }
  };

  const handlePickImport = async () => {
    setPicking(true);
    try {
      const parsed = await pickAndParseProductFile();
      if (!parsed) return;
      if (parsed.rows.length === 0) {
        showToast(parsed.errors[0] ?? t('stock.importFailed'), 'error');
        return;
      }
      setImportPreview(parsed);
    } catch {
      showToast(t('stock.importFailed'), 'error');
    } finally {
      setPicking(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.rows.length) return;
    try {
      const result = await importProducts.mutateAsync(importPreview.rows);
      setImportPreview(null);
      await Promise.all([refetch(), refetchCategories()]);
      showToast(
        t('stock.importSuccess', {
          created: result.created,
          updated: result.updated,
        }),
        'success'
      );
      if (result.errors.length > 0) {
        showToast(t('stock.importPartial', { count: result.errors.length }), 'warning');
      }
    } catch {
      showToast(t('stock.importFailed'), 'error');
    }
  };

  const handleShareTemplate = async () => {
    try {
      await shareProductImportTemplate();
    } catch {
      showToast(t('stock.templateFailed'), 'error');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View>
          <Text style={styles.title}>{t('stock.products')}</Text>
          <Text style={styles.subtitle}>
            {(filteredProducts?.length ?? 0)} {t('stock.products').toLowerCase()}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {reorderRows.length > 0 ? (
            <TouchableOpacity
              style={styles.headerCartBtn}
              onPress={() => router.push('/reorder' as any)}
              accessibilityRole="button"
              accessibilityLabel={t('stock.buySuggestions')}
              hitSlop={8}
            >
              <Ionicons name="cart-outline" size={22} color={colors.ink} />
              <View style={styles.headerCartBadge}>
                <Text style={styles.headerCartBadgeText}>{reorderRows.length}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          <SyncIndicator compact />
        </View>
      </View>

      {/* SUMMARY BANNER */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('stock.totalProductsCount')}</Text>
          <Text style={styles.summaryValue}>{stats.totalCount}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('stock.lowStockItems')}</Text>
          <View style={styles.lowWrap}>
            {stats.lowCount > 0 ? <View style={styles.lowDot} /> : null}
            <Text style={[styles.summaryValue, stats.lowCount > 0 && { color: colors.warningText }]}>
              {stats.lowCount}
            </Text>
          </View>
        </View>
        <View style={styles.summaryDivider} />
        <View style={[styles.summaryItem, { flex: 1.2 }]}>
          <Text style={styles.summaryLabel}>{t('stock.totalValuation')}</Text>
          <MoneyText amount={stats.totalValue} size={15} weight="800" color={colors.ink} />
        </View>
      </View>

      {reorderRows.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.reorderCard, pressed && styles.reorderCardPressed]}
          onPress={() => router.push('/reorder' as any)}
          accessibilityRole="button"
        >
          <View style={styles.reorderCartIconWrap}>
            <Ionicons name="cart" size={22} color="#D97706" />
            {reorderOutCount > 0 ? <View style={styles.cartOutBadgeDot} /> : null}
          </View>
          <View style={styles.reorderCardBody}>
            <View style={styles.reorderTitleRow}>
              <Text style={styles.reorderCardTitle}>
                {t('stock.buySuggestions')}
              </Text>
              <View style={styles.reorderCountPill}>
                <Text style={styles.reorderCountPillText}>
                  {reorderRows.length}
                </Text>
              </View>
            </View>
            <Text style={styles.reorderSubText} numberOfLines={1}>
              {reorderOutCount > 0 ? (
                <Text style={styles.reorderOutText}>
                  {reorderOutCount} {t('stock.outOfStock')} ·{' '}
                </Text>
              ) : null}
              {t('stock.estimatedCost')}:{' '}
              <MoneyText amount={reorderTotalCost} size={12} weight="800" color="#92400E" />
            </Text>
          </View>
          <View style={styles.reorderActionCta}>
            <Text style={styles.reorderActionCtaText}>{t('stock.buyStock')}</Text>
            <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
          </View>
        </Pressable>
      ) : null}

      <View style={styles.searchWrap}>
        <SearchBar
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={t('stock.searchProducts')}
        />
      </View>

      <FlatList
        horizontal
        data={filterOptions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FilterChip
            label={item.label}
            count={item.count}
            icon={item.icon}
            variant={item.variant}
            selected={selectedCategory === item.id}
            onPress={() => setSelectedCategory(item.id)}
          />
        )}
        style={styles.chipList}
        contentContainerStyle={styles.chips}
        showsHorizontalScrollIndicator={false}
      />


      {isLoading ? (
        <View style={styles.list}>
          <Skeleton height={120} style={styles.skel} />
          <Skeleton height={120} style={styles.skel} />
          <Skeleton height={120} style={styles.skel} />
        </View>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title={liveQuery || selectedCategory !== 'all' ? t('common.noResults') : t('stock.noProducts')}
          message={liveQuery || selectedCategory !== 'all' ? undefined : t('stock.addFirstProduct')}
          actionLabel={canEdit && !liveQuery && selectedCategory === 'all' ? t('stock.addProduct') : undefined}
          onAction={canEdit ? () => setShowAddProduct(true) : undefined}
        />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProductCard product={item} onPress={() => router.push(`/stock/${item.id}` as any)} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={() => refetch()} />}
        />
      )}

      {canEdit ? (
        <FloatingActionButton
          mainColor={colors.primary}
          tooltip={t('stock.addProduct')}
          actions={[
            {
              label: t('stock.addProduct'),
              description: t('stock.addProductHint'),
              icon: 'cube-outline',
              onPress: () => setShowAddProduct(true),
              variant: 'primary',
            },
            {
              label: t('stock.importExcel'),
              description: t('stock.importExcelHint'),
              icon: 'cloud-upload-outline',
              onPress: () => void handlePickImport(),
              variant: 'secondary',
            },
            {
              label: t('stock.downloadTemplate'),
              description: t('stock.downloadTemplateHint'),
              icon: 'download-outline',
              onPress: () => void handleShareTemplate(),
              variant: 'secondary',
            },
          ]}
        />
      ) : null}

      <AddProductSheet
        visible={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        categories={categories ?? []}
        onSubmit={handleCreate}
        saving={createProductMutation.isPending}
        onCreateCategory={async (name) => {
          const created = await createCategory.mutateAsync({ name });
          await refetchCategories();
          showToast(t('stock.categoryAdded'), 'success');
          return created;
        }}
      />

      <BottomSheet
        visible={!!importPreview}
        onClose={() => setImportPreview(null)}
        title={t('stock.importPreview')}
      >
        <ScrollView style={styles.previewScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.previewMeta}>
            {importPreview?.fileName} · {importPreview?.rows.length ?? 0} {t('stock.products').toLowerCase()}
          </Text>
          <Text style={styles.previewHint}>{t('stock.importPreviewHint')}</Text>
          {(importPreview?.rows ?? []).slice(0, 8).map((row) => (
            <View key={`${row.rowNumber}-${row.name}`} style={styles.previewRow}>
              <Text style={styles.previewName} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={styles.previewSub}>
                {row.selling_price} · {row.unit || 'pcs'}
                {row.opening_stock > 0 ? ` · stock ${row.opening_stock}` : ''}
              </Text>
            </View>
          ))}
          {(importPreview?.rows.length ?? 0) > 8 ? (
            <Text style={styles.previewMore}>
              +{(importPreview?.rows.length ?? 0) - 8} {t('common.more').toLowerCase()}
            </Text>
          ) : null}
          {importPreview?.errors?.length ? (
            <Text style={styles.previewErrors}>
              {t('stock.importRowErrors', { count: importPreview.errors.length })}
            </Text>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={importProducts.isPending || picking}
            onPress={() => void handleConfirmImport()}
          >
            {t('stock.confirmImport')}
          </Button>
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  lowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerCartBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCartBadge: {
    position: 'absolute',
    top: -3,
    right: -4,
    backgroundColor: '#D97706',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  headerCartBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  chipList: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chips: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  reorderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  reorderCardPressed: {
    opacity: 0.8,
  },
  reorderCartIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartOutBadgeDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#FEF3C7',
  },
  reorderCardBody: {
    flex: 1,
    minWidth: 0,
  },
  reorderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  reorderCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  reorderCountPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  reorderCountPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  reorderSubText: {
    fontSize: 12,
    color: '#78350F',
  },
  reorderOutText: {
    fontWeight: '700',
    color: '#DC2626',
  },
  reorderActionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  reorderActionCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  skel: {
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  previewScroll: {
    maxHeight: 420,
  },
  previewMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  previewHint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  previewRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  previewName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  previewSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  previewMore: {
    fontSize: 13,
    color: colors.muted,
    marginVertical: spacing.sm,
  },
  previewErrors: {
    fontSize: 13,
    color: colors.dangerText,
    marginBottom: spacing.md,
  },
});
