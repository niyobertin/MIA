import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme/tokens';
import { BottomSheet } from '@/components/SegmentedControl';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { MoneyText } from '@/components/MoneyText';
import { CartItem } from '@/stores/salesStore';
import { CartLine } from './CartLine';

export function CartSheet({
  visible,
  onClose,
  cart,
  itemCount,
  total,
  onRemove,
  onQuantityChange,
  onPriceChange,
  onClear,
  onNext,
}: {
  visible: boolean;
  onClose: () => void;
  cart: CartItem[];
  itemCount: number;
  total: number;
  onRemove: (productId: string) => void;
  onQuantityChange: (productId: string, qty: number) => void;
  onPriceChange: (productId: string, price: number) => void;
  onClear: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={`${t('sales.reviewCart')} · ${itemCount}`}>
      {cart.length === 0 ? (
        <EmptyState icon="cart-outline" title={t('sales.emptyCart')} message={t('sales.addProducts')} />
      ) : (
        <View style={styles.body}>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {cart.map((item) => (
              <CartLine
                key={item.product.id}
                item={item}
                onRemove={() => onRemove(item.product.id)}
                onQuantityChange={(qty) => onQuantityChange(item.product.id, qty)}
                onPriceChange={(price) => onPriceChange(item.product.id, price)}
              />
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('sales.total')}</Text>
              <MoneyText amount={total} size={24} weight="800" color={colors.ink} />
            </View>
            <Button variant="primary" size="lg" fullWidth onPress={onNext}>
              {t('sales.choosePayment')}
            </Button>
            <TouchableOpacity onPress={onClear} hitSlop={8} style={styles.clear} accessibilityRole="button">
              <Text style={styles.clearText}>{t('sales.clearCart')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  list: { maxHeight: 360 },
  footer: { gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 17, fontWeight: '700', color: colors.ink },
  clear: { alignSelf: 'center', paddingVertical: spacing.xs },
  clearText: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
