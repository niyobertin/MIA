import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Product } from '@/types';
import { MoneyText } from './MoneyText';
import { formatNumber, getInitials } from '@/utils/formatters';
import { useTranslation } from 'react-i18next';

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  onLongPress?: () => void;
  showStock?: boolean;
  showActions?: boolean;
  compact?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  onLongPress,
  showStock = true,
  showActions = false,
  compact = false,
}) => {
  const { t } = useTranslation();

  const stock = product.track_inventory ? (product.current_stock ?? null) : null;
  const isLowStock = stock !== null && stock <= product.reorder_level && stock > 0;
  const isOutOfStock = stock !== null && stock <= 0;
  const stockColor = isOutOfStock ? '#dc2626' : isLowStock ? '#d97706' : '#16a34a';
  const stockBg = isOutOfStock ? '#fee2e2' : isLowStock ? '#fef3c7' : '#dcfce7';
  const stockLabel = isOutOfStock
    ? t('stock.outOfStock')
    : isLowStock
      ? `${t('stock.lowStock')} · ${formatNumber(stock ?? 0)}`
      : `${t('stock.inStock')} · ${formatNumber(stock ?? 0)}`;

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactCard}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.8}
      >
        <View style={styles.compactAvatar}>
          <Text style={styles.compactAvatarText}>
            {getInitials(product.name)}
          </Text>
        </View>
        <View style={styles.compactMain}>
          <Text style={styles.compactName} numberOfLines={1}>{product.name}</Text>
          <Text style={styles.compactSub} numberOfLines={1}>
            {[product.sku, product.unit].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.compactRight}>
          <MoneyText amount={product.selling_price} size={14} weight="700" />
          {showStock && stock !== null && (
            <View style={[styles.compactStock, { backgroundColor: stockBg }]}>
              <Text style={[styles.compactStockText, { color: stockColor }]}>
                {stockLabel}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.imageContainer}>
          {product.barcode && (
            <Text style={styles.barcode}>{product.barcode}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          {product.sku && <Text style={styles.sku}>{product.sku}</Text>}
        </View>
      </View>
      
      <View style={styles.prices}>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>{t('stock.sellingPrice')}</Text>
          <MoneyText amount={product.selling_price} size={16} weight="700" />
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>{t('stock.averageCost')}</Text>
          <MoneyText amount={product.average_cost} size={14} color="#6b7280" />
        </View>
      </View>

      {showStock && product.track_inventory && stock !== null && (
        <View style={[
          styles.stockRow,
          { backgroundColor: isOutOfStock ? '#fee2e2' : isLowStock ? '#fef3c7' : '#dcfce7' },
        ]}>
          <View style={[styles.stockIndicator, { backgroundColor: stockColor }]} />
          <Text style={[
            styles.stockText,
            { color: isOutOfStock ? '#dc2626' : isLowStock ? '#d97706' : '#16a34a' },
          ]}>
            {isOutOfStock 
              ? t('stock.outOfStock') 
              : isLowStock 
                ? `${t('stock.lowStock')}: ${formatNumber(stock)}`
                : `${t('stock.inStock')}: ${formatNumber(stock)}`
            }
          </Text>
        </View>
      )}

      {showActions && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{t('common.edit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonDanger]}>
            <Text style={styles.actionButtonDangerText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  compactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  compactAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0284c7',
  },
  compactMain: {
    flex: 1,
    justifyContent: 'center',
  },
  compactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  compactSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  compactRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 12,
  },
  compactStock: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  compactStockText: {
    fontSize: 11,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  imageContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  barcode: {
    fontSize: 10,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  sku: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  prices: {
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  priceLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
  },
  stockIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  stockText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    marginRight: 8,
  },
  actionButtonDanger: {
    backgroundColor: '#fee2e2',
    marginRight: 0,
    marginLeft: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  actionButtonDangerText: {
    color: '#dc2626',
  },
});