import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { BottomSheet } from '@/components/SegmentedControl';
import { Button } from '@/components/Button';
import { DatePickerField } from '@/components/DatePickerField';
import { showToast } from '@/stores/toastStore';
import {
  getMonthStartDateString,
  getTodayDateString,
  getWeekStartDateString,
  getYesterdayDateString,
} from '@/utils/formatters';
import { toLocalDateString } from '@/utils/periodBounds';

export type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';
export type DateRangeValue = { preset: DatePreset; start: string; end: string };

const PRESETS: { value: Exclude<DatePreset, 'custom'>; key: string }[] = [
  { value: 'today', key: 'reports.today' },
  { value: 'week', key: 'reports.thisWeek' },
  { value: 'month', key: 'reports.thisMonth' },
  { value: 'year', key: 'dashboard.thisYear' },
  { value: 'all', key: 'sales.allTime' },
];

export function rangeForPreset(preset: Exclude<DatePreset, 'custom'>): DateRangeValue {
  const today = getTodayDateString();
  switch (preset) {
    case 'today':
      return { preset, start: today, end: today };
    case 'yesterday': {
      const day = getYesterdayDateString();
      return { preset, start: day, end: day };
    }
    case 'week':
      return { preset, start: getWeekStartDateString(), end: today };
    case 'month':
      return { preset, start: getMonthStartDateString(), end: today };
    case 'year':
      return { preset, start: `${today.slice(0, 4)}-01-01`, end: today };
    default:
      return { preset: 'all', start: '', end: '' };
  }
}

export function inDateRange(value: string | null | undefined, range: DateRangeValue): boolean {
  if (range.preset === 'all') return true;
  if (!value) return false;
  const day = value.length > 10 && (value.includes('T') || value.includes(' '))
    ? toLocalDateString(new Date(value.replace(' ', 'T')))
    : value.slice(0, 10);
  return day >= range.start && day <= range.end;
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

  const label = value.preset === 'custom'
    ? value.start === value.end ? value.start : t('common.dateRange', { start: value.start, end: value.end })
    : value.preset === 'yesterday' ? t('reports.yesterday') : t(PRESETS.find((p) => p.value === value.preset)?.key ?? 'sales.allTime');

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

export function DateRangeBar({ value, onChange, count }: { value: DateRangeValue; onChange: (value: DateRangeValue) => void; count?: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.bar}>
      <DateRangeFilter value={value} onChange={onChange} />
      {count !== undefined ? <Text style={styles.count}>{t('common.itemCount', { count })}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
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
