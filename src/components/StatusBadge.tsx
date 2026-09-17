import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, radius, spacing } from '@/theme/tokens';

interface StatusBadgeProps {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const tones = {
  success: { bg: colors.successSoft, fg: colors.successText },
  warning: { bg: colors.warningSoft, fg: colors.warningText },
  danger: { bg: colors.dangerSoft, fg: colors.dangerText },
  info: { bg: colors.infoSoft, fg: colors.info },
  neutral: { bg: colors.borderSoft, fg: colors.body },
} as const;

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, tone = 'neutral' }) => {
  const { bg, fg } = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
