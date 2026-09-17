import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ScrollView } from 'react-native';
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
import { useAuthStore } from '@/stores/authStore';
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
    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.category_id === selectedCategory);
    }
    return result;
  }, [products, liveQuery, selectedCategory]);

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
        <SyncIndicator compact />
      </View>

      <View style={styles.searchWrap}>
        <SearchBar
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={t('stock.searchProducts')}
        />
      </View>

      {categories && categories.length > 0 ? (
        <FlatList
          horizontal
          data={[{ id: 'all', name: t('common.all') }, ...categories]}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FilterChip
              label={item.name}
              selected={selectedCategory === item.id}
              onPress={() => setSelectedCategory(item.id)}
            />
          )}
          contentContainerStyle={styles.chips}
          showsHorizontalScrollIndicator={false}
        />
      ) : null}

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
  searchWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
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
