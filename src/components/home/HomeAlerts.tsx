import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';

export function HomeAlerts({
  lowStockNames,
  debtorNames,
  onLowStock,
  onDebtors,
}: {
  lowStockNames: string[];
  debtorNames: string[];
  onLowStock: () => void;
  onDebtors: () => void;
}) {
  const { t } = useTranslation();
  if (lowStockNames.length === 0 && debtorNames.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {lowStockNames.length > 0 ? (
        <Alert
          icon="alert-circle"
          tone="warn"
          title={t('dashboard.lowStockAlerts')}
          detail={summarize(lowStockNames, 3)}
          onPress={onLowStock}
        />
      ) : null}
      {debtorNames.length > 0 ? (
        <Alert
          icon="people"
          tone="danger"
          title={t('dashboard.whoOwes')}
          detail={summarize(debtorNames, 2)}
          onPress={onDebtors}
        />
      ) : null}
    </View>
  );
}

function summarize(names: string[], max: number): string {
  const head = names.slice(0, max).join(', ');
  return names.length > max ? `${head} +${names.length - max}` : head;
}

function Alert({
  icon,
  tone,
  title,
  detail,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'warn' | 'danger';
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const color = tone === 'warn' ? colors.warningText : colors.dangerText;
  return (
    <TouchableOpacity
      style={[styles.card, tone === 'warn' ? styles.warn : styles.danger]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={22} color={color} />
      <View style={styles.info}>
        <Text style={[styles.title, { color }]}>{title}</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  warn: { backgroundColor: colors.warningSoft, borderColor: '#fde68a' },
  danger: { backgroundColor: colors.dangerSoft, borderColor: '#fecaca' },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700' },
  detail: { fontSize: 14, color: colors.body, marginTop: 2 },
});
