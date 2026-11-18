import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { CartItem } from '@/stores/salesStore';

export function CartLine({
  item,
  onRemove,
  onQuantityChange,
  onPriceChange,
}: {
  item: CartItem;
  onRemove: () => void;
  onQuantityChange: (qty: number) => void;
  onPriceChange: (price: number) => void;
}) {
  const { t } = useTranslation();
  const [qtyText, setQtyText] = React.useState(String(item.quantity));
  const [priceText, setPriceText] = React.useState(String(item.sellingPrice));

  React.useEffect(() => {
    setQtyText(String(item.quantity));
  }, [item.quantity]);

  React.useEffect(() => {
    setPriceText(String(item.sellingPrice));
  }, [item.sellingPrice]);

  const stock = item.product.track_inventory ? item.product.current_stock : null;

  const commitQty = () => {
    const parsed = parseInt(qtyText.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setQtyText(String(item.quantity));
      return;
    }
    const cap = stock != null ? Math.max(0, stock) : null;
    if (cap != null && cap < 1) {
      setQtyText(String(item.quantity));
      return;
    }
    const next = cap != null ? Math.min(parsed, cap) : parsed;
    onQuantityChange(next);
    setQtyText(String(next));
  };

  const commitPrice = () => {
    const parsed = parseInt(priceText.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setPriceText(String(item.sellingPrice));
      return;
    }
    onPriceChange(parsed);
    setPriceText(String(parsed));
  };

  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>
          {item.product.name}
        </Text>
        <MoneyText amount={item.quantity * item.sellingPrice} size={16} weight="800" color={colors.ink} />
      </View>

      <View style={styles.editors}>
        <View style={styles.stepper}>
          <TouchableOpacity
            style={styles.stepButton}
            onPress={() => (item.quantity <= 1 ? onRemove() : onQuantityChange(item.quantity - 1))}
            hitSlop={6}
            accessibilityLabel={item.quantity <= 1 ? t('sales.removeItem') : t('sales.decreaseQty')}
          >
            <Ionicons name={item.quantity <= 1 ? 'trash-outline' : 'remove'} size={20} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.qtyInput}
            value={qtyText}
            onChangeText={(text) => setQtyText(text.replace(/[^\d]/g, ''))}
            onBlur={commitQty}
            onSubmitEditing={commitQty}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={t('sales.quantity')}
          />
          <TouchableOpacity
            style={styles.stepButton}
            onPress={() => {
              if (stock != null && item.quantity >= stock) return;
              onQuantityChange(item.quantity + 1);
            }}
            hitSlop={6}
            accessibilityLabel={t('sales.increaseQty')}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.times}>×</Text>

        <View style={styles.priceWrap}>
          <TextInput
            style={styles.priceInput}
            value={priceText}
            onChangeText={(text) => setPriceText(text.replace(/[^\d]/g, ''))}
            onBlur={commitPrice}
            onSubmitEditing={commitPrice}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={t('sales.price')}
          />
          <Text style={styles.suffix}>RWF</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  editors: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    minHeight: 44,
  },
  stepButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  qtyInput: {
    width: 44,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    paddingVertical: 6,
    fontVariant: ['tabular-nums'],
  },
  times: { fontSize: 16, color: colors.muted },
  priceWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  priceInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    paddingVertical: 8,
    fontVariant: ['tabular-nums'],
  },
  suffix: { fontSize: 13, fontWeight: '700', color: colors.faint, marginLeft: 4 },
});
