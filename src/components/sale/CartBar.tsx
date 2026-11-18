import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';

export function CartBar({ itemCount, total, onPress }: { itemCount: number; total: number; onPress: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <TouchableOpacity
        style={styles.button}
        onPress={onPress}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={t('sales.payNow')}
      >
        <View style={styles.count}>
          <Text style={styles.countText}>{itemCount}</Text>
        </View>
        <Text style={styles.label}>{t('sales.payNow')}</Text>
        <MoneyText amount={total} size={18} weight="800" color={colors.white} />
        <Ionicons name="chevron-forward" size={20} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  count: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 6,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  label: { flex: 1, color: colors.white, fontSize: 17, fontWeight: '700' },
});
