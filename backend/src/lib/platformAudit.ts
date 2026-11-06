import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { AppDataSource } from '../data-source';
import { AuditLog, PlatformAuditLog, User } from '../entities';
import { sendMail } from './mailer';

export async function recordPlatformAudit(entry: {
  req: Request;
  admin?: { id: string; email: string } | null;
  action: string;
  targetType?: string;
  targetId?: string;
  businessId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const repo = AppDataSource.getRepository(PlatformAuditLog);
  await repo.save(repo.create({
    id: randomUUID(),
    admin_id: entry.admin?.id ?? null,
    admin_email: entry.admin?.email ?? null,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    business_id: entry.businessId ?? null,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? null,
    ip: entry.req.ip ?? null,
    created_at: new Date(),
  }));
}

export async function notifyBusinessOwners(input: {
  businessId: string;
  action: string;
  entityId?: string;
  reason: string;
  subject: string;
  message: string;
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

  const owners = await AppDataSource.getRepository(User).find({
    where: { business_id: input.businessId, role: 'OWNER', active: true },
  });
  for (const owner of owners) {
    sendMail({ to: owner.email, subject: input.subject, text: `Hello ${owner.name},\n\n${input.message}\n\nReason: ${input.reason}` }).catch((error) => {
      console.error('Could not email business owner', error);
    });
  }
}
