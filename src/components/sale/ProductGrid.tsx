import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { debounce, formatNumber, getInitials } from '@/utils/formatters';
import { Product } from '@/types';

const PAGE_SIZE = 100;
const TILE_COLORS = ['#4338ca', '#0f766e', '#b45309', '#be123c', '#1d4ed8', '#7c3aed', '#047857', '#c2410c'];

function tileColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % TILE_COLORS.length;
  return TILE_COLORS[hash] ?? TILE_COLORS[0];
}

export function ProductGrid({
  products,
  quantityOf,
  onAdd,
  bottomPadding,
}: {
  products: Product[];
  quantityOf: (productId: string) => number;
  onAdd: (product: Product) => void;
  bottomPadding: number;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const columns = width >= 980 ? 4 : width >= 680 ? 3 : 2;
  const [searchText, setSearchText] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const debouncedSearch = React.useMemo(
    () => debounce((...args: unknown[]) => setQuery(args[0] as string), 250),
    []
  );

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  const filtered = React.useMemo(() => {
    if (!query) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }, [products, query]);

  return (
    <FlatList
      key={columns}
      data={filtered.slice(0, visibleCount)}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      columnWrapperStyle={styles.row}
      style={styles.flex}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      onEndReached={() => {
        if (visibleCount < filtered.length) setVisibleCount((count) => count + PAGE_SIZE);
      }}
      onEndReachedThreshold={0.4}
      contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
      ListHeaderComponent={
        <View style={styles.search}>
          <SearchBar
            value={searchText}
            onChangeText={(text) => {
              setSearchText(text);
              debouncedSearch(text);
            }}
            placeholder={t('stock.searchProducts')}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="search"
          title={query ? t('common.noResults') : t('stock.noProducts')}
          message={query ? undefined : t('stock.addFirstProduct')}
        />
      }
      renderItem={({ item }) => (
        <ProductTile product={item} quantity={quantityOf(item.id)} onPress={() => onAdd(item)} />
      )}
    />
  );
}

function productDescription(product: Product): string {
  if (product.description?.trim()) return product.description.trim();
  const parts = [product.category_name, product.sku ? `SKU ${product.sku}` : null, product.unit].filter(Boolean);
  return parts.join(' · ');
}

function ProductCover({ product, quantity, stockLabel, out }: { product: Product; quantity: number; stockLabel: string | null; out: boolean }) {
  const [failed, setFailed] = React.useState(false);
  const color = tileColor(product.name);
  const showImage = Boolean(product.image_url) && !failed;
  return (
    <View style={[styles.cover, { backgroundColor: `${color}1A` }]}>
      {showImage ? (
        <Image
          source={{ uri: product.image_url as string }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.placeholder} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.placeholderBadge, { backgroundColor: color }]}>
            <Text style={styles.initials}>{getInitials(product.name)}</Text>
          </View>
          <Ionicons name="image-outline" size={18} color={color} style={styles.placeholderIcon} />
        </View>
      )}
      {stockLabel ? (
        <View style={[styles.stockPill, out && styles.stockPillOut]}>
          <Text style={[styles.stockPillText, out && styles.stockPillTextOut]} numberOfLines={1}>
            {stockLabel}
          </Text>
        </View>
      ) : null}
      {quantity > 0 ? (
        <View style={styles.qty}>
          <Text style={styles.qtyText}>{quantity}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ProductTile({ product, quantity, onPress }: { product: Product; quantity: number; onPress: () => void }) {
  const { t } = useTranslation();
  const selected = quantity > 0;
  const stock = product.track_inventory ? (product.current_stock ?? null) : null;
  const out = stock !== null && stock <= 0;
  const stockLabel = stock === null ? null : out ? t('stock.outOfStock') : `${formatNumber(stock)} ${product.unit}`;
  const description = productDescription(product);
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected, out && styles.cardOut]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={[product.name, description, stockLabel].filter(Boolean).join(', ')}
    >
      <ProductCover product={product} quantity={quantity} stockLabel={stockLabel} out={out} />
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        <MoneyText
          amount={product.selling_price}
          size={16}
          weight="800"
          color={selected ? colors.primaryText : colors.ink}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, flexGrow: 1 },
  search: { marginBottom: spacing.md },
  row: { gap: spacing.sm, marginBottom: spacing.sm },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardSelected: { borderColor: colors.primary, borderWidth: 2 },
  cardOut: { opacity: 0.6 },
  cover: { aspectRatio: 4 / 3, width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderBadge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { marginTop: 6, opacity: 0.8 },
  initials: { color: colors.white, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  stockPill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '80%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  stockPillOut: { backgroundColor: colors.dangerText },
  stockPillText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  stockPillTextOut: { color: colors.white },
  qty: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 6,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  meta: { padding: spacing.md, gap: 4 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  description: { fontSize: 13, color: colors.muted, lineHeight: 18 },
});
