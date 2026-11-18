import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';

export function QuickActions({
  hasOpenDay,
  onSale,
  onStockIn,
  onExpense,
  onDay,
  onMore,
}: {
  hasOpenDay: boolean;
  onSale: () => void;
  onStockIn: () => void;
  onExpense: () => void;
  onDay: () => void;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.primary} onPress={onSale} activeOpacity={0.85} accessibilityRole="button">
        <Ionicons name="cart" size={24} color={colors.white} />
        <Text style={styles.primaryText}>{t('sales.newSale')}</Text>
      </TouchableOpacity>
      <View style={styles.row}>
        <Tile icon="cube-outline" label={t('dashboard.actionStockIn')} color={colors.success} onPress={onStockIn} />
        <Tile icon="wallet-outline" label={t('dashboard.actionExpense')} color={colors.warning} onPress={onExpense} />
        <Tile
          icon={hasOpenDay ? 'moon-outline' : 'sunny-outline'}
          label={hasOpenDay ? t('dashboard.actionCloseDay') : t('dashboard.actionOpenDay')}
          color="#7c3aed"
          onPress={onDay}
        />
        <Tile icon="ellipsis-horizontal" label={t('dashboard.moreActions')} color={colors.muted} onPress={onMore} />
      </View>
    </View>
  );
}

function Tile({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Ionicons name={icon} size={24} color={color} />
      <Text style={styles.tileText} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.lg },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 56,
    ...shadows.card,
  },
  primaryText: { fontSize: 18, fontWeight: '800', color: colors.white },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 60,
    ...shadows.card,
  },
  tileText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.body },
});
