import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';

export function DayStatusCard({
  hasOpenDay,
  sessionNumber,
  sessionDuration,
  onPress,
}: {
  hasOpenDay: boolean;
  sessionNumber: number | null;
  sessionDuration: string | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  if (hasOpenDay) {
    return (
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
        <View style={[styles.dot, styles.dotOpen]} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {t('dashboard.openSessionLabel')}
            {sessionNumber != null ? ` #${sessionNumber}` : ''}
          </Text>
          {sessionDuration ? <Text style={styles.sub}>{sessionDuration}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.faint} />
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.card, styles.cardClosed]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Ionicons name="sunny-outline" size={24} color={colors.warningText} />
      <View style={styles.info}>
        <Text style={styles.title}>{t('dashboard.dayClosed')}</Text>
        <Text style={styles.sub}>{t('dashboard.dayClosedHint')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.warningText} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardClosed: {
    backgroundColor: colors.warningSoft,
    borderColor: '#fde68a',
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotOpen: { backgroundColor: colors.success },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
});
