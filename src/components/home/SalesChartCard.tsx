import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { Skeleton } from '@/components/Skeleton';
import { ChartBar } from '@/hooks/useHomeDashboard';
import { homeCard } from './styles';

export function SalesChartCard({
  title,
  subtitle,
  bars,
  loading,
}: {
  title: string;
  subtitle: string;
  bars: ChartBar[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const total = bars.reduce((sum, d) => sum + d.total, 0);
  const maxDay = Math.max(1, ...bars.map((d) => d.total));
  const empty = bars.length === 0 || bars.every((d) => d.total === 0);

  return (
    <View style={homeCard.card}>
      <View style={homeCard.header}>
        <Text style={homeCard.title}>{title}</Text>
        <MoneyText amount={total} size={16} weight="700" color={colors.ink} />
      </View>
      {subtitle ? <Text style={homeCard.hint}>{subtitle}</Text> : null}
      {loading ? (
        <Skeleton height={110} />
      ) : empty ? (
        <Text style={homeCard.muted}>{t('dashboard.noSalesInPeriod')}</Text>
      ) : bars.length <= 14 || width >= 1100 ? (
        <View style={styles.chart}>
          {bars.map((d) => (
            <View key={d.date} style={styles.col}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      height: `${Math.max(4, Math.round((d.total / maxDay) * 100))}%`,
                      backgroundColor: d.isToday ? colors.primary : colors.primarySoft,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.label, d.isToday && styles.labelToday]} numberOfLines={1}>
                {d.displayLabel}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chart}>
            {bars.map((d, i) => (
              <View key={d.date} style={styles.colNarrow}>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fillNarrow,
                      {
                        height: `${Math.max(4, Math.round((d.total / maxDay) * 100))}%`,
                        backgroundColor: d.isToday ? colors.primary : colors.primarySoft,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.label, d.isToday && styles.labelToday]}>
                  {i % 5 === 0 || d.isToday ? d.displayLabel : ''}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'stretch', height: 132 },
  col: { flex: 1, alignItems: 'center', minWidth: 0 },
  colNarrow: { width: 22, alignItems: 'center' },
  track: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 2 },
  fill: { width: '70%', maxWidth: 28, borderRadius: 6, minHeight: 4 },
  fillNarrow: { width: 12, borderRadius: 6, minHeight: 4 },
  label: { fontSize: 12, color: colors.muted, marginTop: 6, fontWeight: '600' },
  labelToday: { color: colors.primary, fontWeight: '800' },
});
