import { dailyClosingRepository } from '@/repositories/reports/dailyClosing';
import { DailyClosing } from '@/types';
import { guardError } from './guards';

/**
 * Trading session = one open daily_closings row.
 * Calendar date (sale_date etc.) answers "when on the calendar";
 * session_id answers "which open→close trading period".
 */

export async function getOpenSession(businessId: string): Promise<DailyClosing | null> {
  return dailyClosingRepository.findOpenDay(businessId);
}

/** Require exactly one open session; throw DAY_CLOSED if none. */
export async function requireOpenSession(businessId: string): Promise<DailyClosing> {
  const open = await getOpenSession(businessId);
  if (!open) throw guardError('DAY_CLOSED');
  return open;
}

/** Next human-friendly session number for this business (1, 2, 3…). */
export async function nextSessionNumber(businessId: string): Promise<number> {
  return dailyClosingRepository.nextSessionNumber(businessId);
}

/**
 * A record is mutable only while its session is still the open one.
 * Legacy rows without session_id fall back to "any open session exists".
 * Closed-session rows throw HISTORY_LOCKED (use postHistoryCorrection instead).
 */
export async function assertSessionMutable(
  businessId: string,
  sessionId: string | null | undefined
): Promise<DailyClosing> {
  const open = await requireOpenSession(businessId);
  if (sessionId && sessionId !== open.id) {
    throw guardError('HISTORY_LOCKED');
  }
  return open;
}

/**
 * Scope assumption: exactly one open trading session per business_id
 * (not per register / device). Matches server 409 on concurrent opens.
 */
export async function assertSingleOpenSession(businessId: string): Promise<void> {
  const open = await getOpenSession(businessId);
  if (open) throw guardError('DAY_ALREADY_OPEN');
}

export function sessionElapsedMs(openedAt: string | null | undefined, now = new Date()): number {
  if (!openedAt) return 0;
  const start = Date.parse(openedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, now.getTime() - start);
}

export function formatSessionDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
