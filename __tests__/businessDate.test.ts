import { toBusinessDate } from '@/utils/formatters';

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('toBusinessDate', () => {
  it('keeps plain calendar dates unchanged', () => {
    expect(toBusinessDate('2026-11-03')).toBe('2026-11-03');
  });

  it('converts a server midnight timestamp to the local calendar day', () => {
    const localMidnight = new Date(2026, 10, 3, 0, 0, 0);
    expect(toBusinessDate(localMidnight.toISOString())).toBe('2026-11-03');
    expect(toBusinessDate(localMidnight)).toBe('2026-11-03');
  });

  it('handles Postgres-style offsets with a space separator', () => {
    const value = '2026-11-03 00:00:00+02';
    expect(toBusinessDate(value)).toBe(localDay(new Date('2026-11-03T00:00:00+02:00')));
  });

  it('falls back to the first ten characters for zoneless timestamps', () => {
    expect(toBusinessDate('2026-11-03 22:57:00')).toBe('2026-11-03');
  });

  it('returns null for empty values', () => {
    expect(toBusinessDate(null)).toBeNull();
    expect(toBusinessDate('')).toBeNull();
  });
});
