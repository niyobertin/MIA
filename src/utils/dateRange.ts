import {
  getMonthStartDateString,
  getTodayDateString,
  getWeekStartDateString,
  getYesterdayDateString,
} from '@/utils/formatters';
import { toLocalDateString } from '@/utils/periodBounds';

export type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';
export type DateRangeValue = { preset: DatePreset; start: string; end: string };

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
