/** Normalize report period bounds for date-only or date+time filters. */

export function hasTimeComponent(value: string): boolean {
  return /[T ]\d{2}:\d{2}/.test(value.trim());
}

function padTime(value: string, isEnd: boolean): string {
  const cleaned = value.trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return isEnd ? `${cleaned} 23:59:59` : `${cleaned} 00:00:00`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cleaned)) {
    return `${cleaned}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 19);
  }
  return cleaned;
}

export type PeriodBounds = {
  mode: 'date' | 'datetime';
  start: string;
  end: string;
};

export function resolvePeriodBounds(start: string, end: string): PeriodBounds {
  if (hasTimeComponent(start) || hasTimeComponent(end)) {
    return {
      mode: 'datetime',
      start: padTime(start, false),
      end: padTime(end, true),
    };
  }
  return {
    mode: 'date',
    start: start.trim().slice(0, 10),
    end: end.trim().slice(0, 10),
  };
}

/**
 * Build a SQL WHERE fragment for a business calendar period.
 * Date-only mode compares the first 10 chars so both `YYYY-MM-DD` and
 * ISO timestamps (from cloud pull) match the same day.
 */
export function buildPeriodWhere(
  dateColumn: string,
  dateTimeColumn: string,
  start: string,
  end: string
): { clause: string; params: [string, string] } {
  const bounds = resolvePeriodBounds(start, end);
  if (bounds.mode === 'datetime') {
    return {
      clause: `${dateTimeColumn} BETWEEN ? AND ?`,
      params: [bounds.start, bounds.end],
    };
  }
  return {
    clause: `substr(${dateColumn}, 1, 10) BETWEEN ? AND ?`,
    params: [bounds.start, bounds.end],
  };
}

export function combineDateAndTime(date: string, time: string, fallbackTime: string): string {
  const d = date.trim().slice(0, 10);
  const t = (time.trim() || fallbackTime).slice(0, 5);
  return `${d}T${t}:00`;
}

/** Local-calendar YYYY-MM-DD (avoids UTC day shift for Africa/Kigali). */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
