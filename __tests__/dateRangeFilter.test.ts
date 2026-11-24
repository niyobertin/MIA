import { inDateRange, rangeForPreset } from '@/utils/dateRange';
import { getTodayDateString, getYesterdayDateString } from '@/utils/formatters';

describe('date range filter', () => {
  it('all time keeps every row, even rows without a date', () => {
    const all = rangeForPreset('all');
    expect(inDateRange(undefined, all)).toBe(true);
    expect(inDateRange('2001-01-01', all)).toBe(true);
  });

  it('today matches plain dates and timestamps from today only', () => {
    const today = rangeForPreset('today');
    const now = new Date();
    expect(inDateRange(getTodayDateString(), today)).toBe(true);
    expect(inDateRange(now.toISOString(), today)).toBe(true);
    expect(inDateRange(getYesterdayDateString(), today)).toBe(false);
    expect(inDateRange(null, today)).toBe(false);
  });

  it('custom ranges include both end days', () => {
    const range = { preset: 'custom' as const, start: '2026-03-01', end: '2026-03-31' };
    expect(inDateRange('2026-03-01', range)).toBe(true);
    expect(inDateRange('2026-03-31', range)).toBe(true);
    expect(inDateRange('2026-04-01', range)).toBe(false);
    expect(inDateRange('2026-02-28', range)).toBe(false);
  });

  it('this month starts on the 1st and ends today', () => {
    const month = rangeForPreset('month');
    expect(month.start.endsWith('-01')).toBe(true);
    expect(month.end).toBe(getTodayDateString());
  });

  it('this year starts on 1 January and ends today', () => {
    const year = rangeForPreset('year');
    expect(year.start).toBe(`${getTodayDateString().slice(0, 4)}-01-01`);
    expect(year.end).toBe(getTodayDateString());
    expect(inDateRange(`${getTodayDateString().slice(0, 4)}-01-01`, year)).toBe(true);
    expect(inDateRange(`${Number(getTodayDateString().slice(0, 4)) - 1}-12-31`, year)).toBe(false);
  });
});
