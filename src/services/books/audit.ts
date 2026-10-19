import { getDatabase } from '@/db/database';
import { generateUUID } from '@/utils/uuid';
import { UserRole } from '@/types';

export type AuditAction =
  | 'sale.create'
  | 'sale.void'
  | 'purchase.create'
  | 'purchase.void'
  | 'stock.adjust'
  | 'stock.damage'
  | 'payment.customer'
  | 'payment.supplier'
  | 'expense.create'
  | 'day.open'
  | 'day.close'
  | 'stock.count'
  | 'price.below_cost_override'
  | 'credit_limit.override'
  | 'history.correction'
  | 'session.abandon_local';

/** Append-only audit trail. Never throws: the books must not fail because the log did. */
export async function audit(input: {
  businessId: string;
  userId?: string | null;
  role?: UserRole | null;
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  deviceId?: string | null;
}): Promise<void> {
  try {
    const db = await getDatabase();
    const id = generateUUID();
    const now = new Date().toISOString();
    const row = {
      id,
      business_id: input.businessId,
      user_id: input.userId ?? null,
      role: input.role ?? null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      before_state: input.before === undefined ? null : JSON.stringify(input.before),
      after_state: input.after === undefined ? null : JSON.stringify(input.after),
      reason: input.reason ?? null,
      device_id: input.deviceId ?? null,
      created_at: now,
    };
    await db.runAsync(
      `INSERT INTO audit_logs
        (id, business_id, user_id, role, action, entity, entity_id, before_state, after_state, reason, device_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.business_id,
        row.user_id,
        row.role,
        row.action,
        row.entity,
        row.entity_id,
        row.before_state,
        row.after_state,
        row.reason,
        row.device_id,
        row.created_at,
      ]
    );
    const { queueSync } = await import('@/services/sync/queue');
    await queueSync('audit_logs', id, 'insert', row as unknown as Record<string, unknown>, input.businessId);
  } catch (error) {
    console.error('Audit log failed', error);
  }
}

export async function getAuditHistory(
  businessId: string,
  options?: { entity?: string; entityId?: string; limit?: number }
): Promise<Array<Record<string, unknown>>> {
  const db = await getDatabase();
  const clauses = ['business_id = ?'];
  const params: unknown[] = [businessId];
  if (options?.entity) {
    clauses.push('entity = ?');
    params.push(options.entity);
  }
  if (options?.entityId) {
    clauses.push('entity_id = ?');
    params.push(options.entityId);
  }
  params.push(options?.limit ?? 100);
  return db.getAllAsync(
    `SELECT * FROM audit_logs WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
    params as (string | number | null)[]
  );
}
