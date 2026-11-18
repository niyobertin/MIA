import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { BottomSheet } from './SegmentedControl';
import { toLocalDateString } from '@/utils/periodBounds';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIso(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function formatPickedDate(value: string, months: string[], short = false): string {
  const date = parseIso(value);
  if (!date) return value;
  const month = months[date.getMonth()] ?? '';
  return `${date.getDate()} ${short ? month.slice(0, 3) : month} ${date.getFullYear()}`;
}

export function DatePickerField({
  label,
  value,
  onChange,
  maxDate,
  minDate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxDate?: string;
  minDate?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const months = t('common.monthsLong').split(',');
  const weekdays = t('common.weekdaysShort').split(',');
  const selected = parseIso(value) ?? new Date();
  const [cursor, setCursor] = React.useState({ year: selected.getFullYear(), month: selected.getMonth() });

  const openSheet = () => {
    const d = parseIso(value) ?? new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setOpen(true);
  };

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const today = toLocalDateString(new Date());
  const cells = monthGrid(cursor.year, cursor.month);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.input}
        onPress={openSheet}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatPickedDate(value, months)}`}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <Text style={styles.value} numberOfLines={1}>
          {formatPickedDate(value, months, true)}
        </Text>
      </TouchableOpacity>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label || t('common.pickDate')}>
        <View style={styles.monthRow}>
          <TouchableOpacity
            onPress={() => shift(-1)}
            style={styles.navBtn}
            accessibilityLabel={t('common.previousMonth')}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {months[cursor.month]} {cursor.year}
          </Text>
          <TouchableOpacity
            onPress={() => shift(1)}
            style={styles.navBtn}
            accessibilityLabel={t('common.nextMonth')}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <View style={styles.grid}>
          {weekdays.map((w, i) => (
            <Text key={`w${i}`} style={styles.weekday}>
              {w}
            </Text>
          ))}
          {cells.map((day, i) => {
            if (day == null) return <View key={`e${i}`} style={styles.cell} />;
            const iso = toLocalDateString(new Date(cursor.year, cursor.month, day));
            const disabled = (maxDate != null && iso > maxDate) || (minDate != null && iso < minDate);
            const active = iso === value;
            const isToday = iso === today;
            return (
              <TouchableOpacity
                key={iso}
                style={styles.cell}
                disabled={disabled}
                onPress={() => {
                  onChange(iso);
                  setOpen(false);
                }}
                accessibilityLabel={formatPickedDate(iso, months)}
              >
                <View style={[styles.day, isToday && styles.dayToday, active && styles.dayActive]}>
                  <Text
                    style={[
                      styles.dayText,
                      disabled && styles.dayTextDisabled,
                      active && styles.dayTextActive,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.spacer} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.muted },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    backgroundColor: colors.inputBg,
  },
  value: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    paddingVertical: 6,
  },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1, borderColor: colors.primary },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  dayTextDisabled: { color: colors.faint },
  dayTextActive: { color: colors.white },
  spacer: { height: spacing.lg },
});
