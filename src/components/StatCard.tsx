import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '@/utils/formatters';
import { colors, radius, spacing, shadows } from '@/theme/tokens';

interface StatCardProps {
  title: string;
  value: number;
  currency?: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: string;
  color?: string;
  onPress?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  currency = 'RWF',
  subtitle,
  trend,
  trendValue,
  icon,
  color = colors.primary,
  onPress,
}) => {
  const trendColors = {
    up: colors.success,
    down: colors.danger,
    neutral: colors.muted,
  };

  const content = (
    <>
      <View style={styles.topRow}>
        <View style={[styles.iconTile, { backgroundColor: `${color}1a` }]}>
          <Ionicons name={(icon ?? 'stats-chart') as any} size={20} color={color} />
        </View>
        {trendValue ? (
          <View style={styles.trend}>
            {trend && trend !== 'neutral' ? (
              <Ionicons
                name={trend === 'up' ? 'trending-up' : 'trending-down'}
                size={14}
                color={trendColors[trend]}
              />
            ) : null}
            <Text style={[styles.trendValue, { color: trend ? trendColors[trend] : colors.muted }]}>
              {trendValue}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(value, currency)}
      </Text>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={[styles.card, { borderLeftColor: color }]} onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, { borderLeftColor: color }]}>{content}</View>;
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  trendValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 11,
    color: colors.faint,
    marginTop: 2,
  },
});
