import { randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import type { BusinessRole } from '../lib/rbac';

/** Rows written from the web dashboard carry this device id, like a phone's device id. */
export const WEB_DEVICE = 'web-dashboard';

export type BooksActor = {
  businessId: string;
  userId: string;
  role: BusinessRole;
  timezone: string;
};

export type Ctx = BooksActor & { tx: EntityManager };

/** Same error codes the phone uses, so both show the same message. */
export class BooksError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export const newId = () => randomUUID();

export async function rows<T = Record<string, any>>(ctx: Ctx, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await ctx.tx.query(sql, params)) as T[];
}

export async function one<T = Record<string, any>>(ctx: Ctx, sql: string, params: unknown[] = []): Promise<T | null> {
  const found = await rows<T>(ctx, sql, params);
  return found[0] ?? null;
}

export const num = (value: unknown) => Number(value ?? 0);

/** Calendar day in the business time zone, as the phone stores it (YYYY-MM-DD). */
export function businessToday(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Runs one dashboard action in a single transaction so a failure leaves nothing half-written. */
export async function inBooks<T>(actor: BooksActor, work: (ctx: Ctx) => Promise<T>): Promise<T> {
  return AppDataSource.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [actor.businessId]);
    return work({ ...actor, tx });
  });
}

export function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export async function audit(
  ctx: Ctx,
  input: { action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown; reason?: string | null },
): Promise<void> {
  await ctx.tx.query(
    `INSERT INTO audit_logs (id, business_id, user_id, role, action, entity, entity_id, before_state, after_state, reason, device_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
    [
      newId(),
      ctx.businessId,
      ctx.userId,
      ctx.role,
      input.action,
      input.entity,
      input.entityId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.reason ?? null,
      WEB_DEVICE,
    ],
  );
}
