import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { SaleSuccess } from '@/hooks/useSaleCheckout';

export function SaleDoneBanner({
  success,
  onShare,
  onClose,
}: {
  success: SaleSuccess | null;
  onShare: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!success) return null;
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Ionicons name="checkmark-circle" size={28} color={colors.white} />
      <View style={styles.info}>
        <Text style={styles.title}>
          {t('sales.saleSaved')} · {success.total.toLocaleString()} RWF
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {t('sales.undoHint')}
        </Text>
      </View>
      <TouchableOpacity onPress={onShare} style={styles.share} accessibilityRole="button" accessibilityLabel={t('sales.sharePdf80')}>
        <Ionicons name="share-outline" size={22} color={colors.white} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
        <Ionicons name="close" size={22} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800', color: colors.white },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  share: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
