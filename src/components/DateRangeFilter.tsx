import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { BottomSheet } from '@/components/SegmentedControl';
import { Button } from '@/components/Button';
import { DatePickerField } from '@/components/DatePickerField';
import { showToast } from '@/stores/toastStore';
import { getTodayDateString } from '@/utils/formatters';
import { inDateRange, rangeForPreset, type DatePreset, type DateRangeValue } from '@/utils/dateRange';

export { inDateRange, rangeForPreset, type DatePreset, type DateRangeValue };
import { ExportButton } from '@/components/ExportButton';
import type { ListExport } from '@/utils/listExport';

const PRESETS: { value: Exclude<DatePreset, 'custom'>; key: string }[] = [
  { value: 'today', key: 'reports.today' },
  { value: 'week', key: 'reports.thisWeek' },
  { value: 'month', key: 'reports.thisMonth' },
  { value: 'year', key: 'dashboard.thisYear' },
  { value: 'all', key: 'sales.allTime' },
];

export function rangeLabel(value: DateRangeValue, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (value.preset === 'custom') {
    return value.start === value.end ? value.start : t('common.dateRange', { start: value.start, end: value.end });
  }
  if (value.preset === 'yesterday') return t('reports.yesterday');
  return t(PRESETS.find((p) => p.value === value.preset)?.key ?? 'sales.allTime');
}

export function useDateRange(initial: Exclude<DatePreset, 'custom'> = 'all') {
  const [range, setRange] = React.useState<DateRangeValue>(() => rangeForPreset(initial));
  const filter = React.useCallback(
    <T,>(rows: readonly T[], getDate: (row: T) => string | null | undefined) => rows.filter((row) => inDateRange(getDate(row), range)),
    [range],
  );
  return { range, setRange, filter };
}

export function DateRangeFilter({ value, onChange }: { value: DateRangeValue; onChange: (value: DateRangeValue) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const today = getTodayDateString();
  const [start, setStart] = React.useState(value.preset === 'custom' ? value.start : today);
  const [end, setEnd] = React.useState(value.preset === 'custom' ? value.end : today);

  const label = rangeLabel(value, t);

  const applyCustom = () => {
    if (start > end) {
      showToast(t('reports.invalidRange'), 'error');
      return;
    }
    onChange({ preset: 'custom', start, end });
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={StyleSheet.flatten([styles.pill, value.preset !== 'all' ? styles.pillActive : null])}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('common.dateFilter')}: ${label}`}
        activeOpacity={0.8}
      >
        <Ionicons name="calendar-outline" size={16} color={value.preset !== 'all' ? colors.primary : colors.muted} />
        <Text style={StyleSheet.flatten([styles.pillText, value.preset !== 'all' ? styles.pillTextActive : null])} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.muted} />
      </TouchableOpacity>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={t('common.dateFilter')}>
        <View style={styles.options}>
          {PRESETS.map((preset) => {
            const selected = value.preset === preset.value;
            return (
              <TouchableOpacity
                key={preset.value}
                style={StyleSheet.flatten([styles.option, selected ? styles.optionSelected : null])}
                onPress={() => {
                  onChange(rangeForPreset(preset.value));
                  setOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={StyleSheet.flatten([styles.optionText, selected ? styles.optionTextSelected : null])}>{t(preset.key)}</Text>
                {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.customTitle}>{t('reports.customRange')}</Text>
        <View style={styles.row}>
          <DatePickerField label={t('reports.startDate')} value={start} onChange={setStart} maxDate={today} />
          <DatePickerField label={t('reports.endDate')} value={end} onChange={setEnd} maxDate={today} />
        </View>
        <Button variant="primary" size="lg" fullWidth onPress={applyCustom}>
          {t('reports.applyRange')}
        </Button>
        <View style={styles.spacer} />
      </BottomSheet>
    </>
  );
}

export function DateRangeBar({
  value,
  onChange,
  count,
  onExport,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  count?: number;
  onExport?: () => ListExport;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.bar}>
      <DateRangeFilter value={value} onChange={onChange} />
      <View style={styles.barRight}>
        {count !== undefined ? <Text style={styles.count}>{t('common.itemCount', { count })}</Text> : null}
        {onExport ? <ExportButton build={onExport} disabled={count === 0} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 'auto' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    maxWidth: 260,
  },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pillText: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: colors.body },
  pillTextActive: { color: colors.primaryText },
  count: { fontSize: 13, color: colors.muted },
  options: { gap: spacing.xs, marginTop: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
  },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { fontSize: 16, fontWeight: '600', color: colors.body },
  optionTextSelected: { color: colors.primaryText },
  customTitle: { marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: 13, fontWeight: '700', color: colors.muted },
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  spacer: { height: spacing.lg },
});
