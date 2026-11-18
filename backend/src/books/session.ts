import { BooksError, Ctx, one } from './core';

export type OpenSession = { id: string; business_date: string; session_number: number; opened_at: string | null };

export async function getOpenSession(ctx: Ctx): Promise<OpenSession | null> {
  return one<OpenSession>(
    ctx,
    `SELECT id, to_char(business_date, 'YYYY-MM-DD') AS business_date, session_number, opened_at
     FROM daily_closings WHERE business_id = $1 AND status = 'open'
     ORDER BY opened_at DESC NULLS LAST LIMIT 1`,
    [ctx.businessId],
  );
}

/** Same rule as the phone: money and stock only move while a day is open. */
export async function requireOpenSession(ctx: Ctx): Promise<OpenSession> {
  const session = await getOpenSession(ctx);
  if (!session) throw new BooksError('DAY_CLOSED');
  return session;
}
