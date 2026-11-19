import { createHash, randomUUID } from 'crypto';
import type { Request } from 'express';
import { AppDataSource } from '../data-source';
import { AuditLog, PlatformAuditLog } from '../entities';

const AUDIT_LOCK_KEY = 74_201_311;

function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function auditHash(prevHash: string | null, row: Pick<PlatformAuditLog, 'id' | 'admin_id' | 'admin_email' | 'action' | 'target_type' | 'target_id' | 'business_id' | 'reason' | 'metadata' | 'ip' | 'result' | 'created_at'>) {
  const payload = canonical({
    id: row.id,
    admin_id: row.admin_id,
    admin_email: row.admin_email,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    business_id: row.business_id,
    reason: row.reason,
    metadata: row.metadata,
    ip: row.ip,
    result: row.result,
    created_at: new Date(row.created_at),
  });
  return createHash('sha256').update(`${prevHash ?? ''}|${payload}`).digest('hex');
}

export async function recordPlatformAudit(entry: {
  req: Request;
  admin?: { id: string; email: string } | null;
  action: string;
  targetType?: string;
  targetId?: string;
  businessId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  result?: 'success' | 'failed' | 'denied';
}) {
  await AppDataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_LOCK_KEY]);
    const [last] = await manager.query(`SELECT hash FROM platform_audit_logs WHERE hash IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1`);
    const createdAt = new Date();
    const row = {
      id: randomUUID(),
      admin_id: entry.admin?.id ?? null,
      admin_email: entry.admin?.email ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      business_id: entry.businessId ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata ? (JSON.parse(JSON.stringify(entry.metadata)) as Record<string, unknown>) : null,
      ip: entry.req.ip ?? null,
      result: entry.result ?? (entry.action.endsWith('_failed') ? 'failed' : 'success'),
      created_at: createdAt,
    } as const;
    const prevHash = (last?.hash as string | undefined) ?? null;
    await manager.getRepository(PlatformAuditLog).insert({ ...row, prev_hash: prevHash, hash: auditHash(prevHash, row) } as never);
  });
}

export async function verifyAuditChain() {
  const rows = await AppDataSource.query(
    `SELECT id, admin_id, admin_email, action, target_type, target_id, business_id, reason, metadata, ip, result, created_at, prev_hash, hash
     FROM platform_audit_logs WHERE hash IS NOT NULL ORDER BY created_at ASC, id ASC`,
  ) as (PlatformAuditLog & { prev_hash: string | null; hash: string })[];
  let previous: string | null = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (index > 0 && row.prev_hash !== previous) return { ok: false, checked: index, broken_at: row.id, reason: 'chain link mismatch' };
    if (auditHash(row.prev_hash, row) !== row.hash) return { ok: false, checked: index, broken_at: row.id, reason: 'entry was altered' };
    previous = row.hash;
  }
  const [{ unhashed }] = await AppDataSource.query(`SELECT COUNT(*) AS unhashed FROM platform_audit_logs WHERE hash IS NULL`);
  return { ok: true, checked: rows.length, unhashed: Number(unhashed) };
}

export async function notifyBusinessOwners(input: {
  businessId: string;
  action: string;
  entityId?: string;
  reason: string;
  subject: string;
  message: string;
  template?: string;
  variables?: Record<string, string | null | undefined>;
  idempotencyKey?: string;
}) {
  const now = new Date();
  await AppDataSource.getRepository(AuditLog).insert({
    id: randomUUID(),
    business_id: input.businessId,
    user_id: null,
    role: 'MIA_PLATFORM',
    action: input.action,
    entity: 'platform',
    entity_id: input.entityId ?? null,
    before_state: null,
    after_state: null,
    reason: input.reason,
    device_id: null,
    created_at: now,
  });

  if (input.template === 'none') return;
  const { emailOwners } = await import('./email');
  await emailOwners(
    input.businessId,
    input.template ?? 'businesses.notice',
    { title: input.subject, message: input.message, reason: input.reason, ...input.variables },
    input.idempotencyKey,
  );
}
