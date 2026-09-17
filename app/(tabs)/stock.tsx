import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { colors, spacing } from '@/theme/tokens';
import { ProductCard } from '@/components/ProductCard';
import { SearchBar } from '@/components/SearchBar';
import { FilterChip } from '@/components/FilterChip';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { SyncIndicator } from '@/components/SyncIndicator';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { showToast } from '@/stores/toastStore';
import { canManageInventory } from '@/utils/permissions';
import { useProducts, useCategories, useCreateProduct } from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { AddProductSheet } from '@/components/AddProductSheet';

export default function StockScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { data: products, isLoading, refetch, isRefetching } = useProducts({ active: true });
  const { data: categories } = useCategories();
  const createProductMutation = useCreateProduct();

  const [searchQuery, setSearchQuery] = React.useState('');
  const [liveQuery, setLiveQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [showAddProduct, setShowAddProduct] = React.useState(false);

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
    } catch (error) {
      showToast(t('stock.productFailed'), 'error');
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
          renderItem={({ item }) => <ProductCard product={item} onPress={() => router.push(`/stock/${item.id}` as any)} />}
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
          ]}
        />
      ) : null}

      <AddProductSheet
        visible={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        categories={categories ?? []}
        onSubmit={handleCreate}
        saving={createProductMutation.isPending}
      />
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
    paddingBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  skel: {
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
});
