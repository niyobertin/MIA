import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/theme/tokens';

export interface FilterChipProps {
  label: string;
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'default' | 'warning' | 'danger';
  selected: boolean;
  onPress: () => void;
}

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  count,
  icon,
  variant = 'default',
  selected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        variant === 'warning' && styles.chipWarning,
        variant === 'danger' && styles.chipDanger,
        selected && styles.chipSelected,
        selected && variant === 'warning' && styles.chipSelectedWarning,
        selected && variant === 'danger' && styles.chipSelectedDanger,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={
            selected
              ? colors.white
              : variant === 'warning'
                ? '#B45309'
                : variant === 'danger'
                  ? '#DC2626'
                  : colors.ink
          }
          style={styles.icon}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          variant === 'warning' && styles.labelWarning,
          variant === 'danger' && styles.labelDanger,
          selected && styles.labelSelected,
        ]}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <View
          style={[
            styles.badge,
            variant === 'warning' && styles.badgeWarning,
            variant === 'danger' && styles.badgeDanger,
            selected && styles.badgeSelected,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              variant === 'warning' && styles.badgeTextWarning,
              variant === 'danger' && styles.badgeTextDanger,
              selected && styles.badgeTextSelected,
            ]}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6,
  },
  chipWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  chipDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipSelectedWarning: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  chipSelectedDanger: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  icon: {
    marginRight: 5,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  labelWarning: {
    color: '#92400E',
  },
  labelDanger: {
    color: '#991B1B',
  },
  labelSelected: {
    color: colors.white,
    fontWeight: '700',
  },
  badge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeDanger: {
    backgroundColor: '#FEE2E2',
  },
  badgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  badgeTextWarning: {
    color: '#B45309',
  },
  badgeTextDanger: {
    color: '#B91C1C',
  },
  badgeTextSelected: {
    color: colors.white,
  },
});
