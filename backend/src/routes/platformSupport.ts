import { randomUUID } from 'crypto';
import { Router, type NextFunction, type Response } from 'express';
import { IsNull, MoreThan, MoreThanOrEqual } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import { sql } from '../lib/db';
import { Business, SupportAccessGrant, type SupportLevel } from '../entities';
import { verifyPassword } from '../lib/auth';
import { buildOverview, parsePeriodQuery, stockLevels } from '../lib/businessData';
import { notifyBusinessOwners, recordPlatformAudit } from '../lib/platformAudit';
import { notifyAdmins } from '../lib/notifications';
import { requirePermission, type PlatformRequest } from '../middleware/platform';

export const platformSupportRouter = Router();

const q = sql;
const uuidSchema = z.string().uuid();

export const SUPPORT_LEVELS: Record<SupportLevel, { name: string; max_minutes: number; super_admin_only: boolean; description: string }> = {
  1: { name: 'Monitoring', max_minutes: 60, super_admin_only: false, description: 'Status, sync health and technical signals. No business records.' },
  2: { name: 'Read-only support', max_minutes: 60, super_admin_only: false, description: 'Read business records. Customer contact details stay masked.' },
  3: { name: 'Administrative support', max_minutes: 30, super_admin_only: true, description: 'Approved troubleshooting and business profile changes.' },
  4: { name: 'Emergency access', max_minutes: 15, super_admin_only: true, description: 'Time-limited exceptional access, including customer contact details. Requires your password.' },
};

export async function activeGrant(adminId: string, businessId: string, minLevel: SupportLevel) {
  return AppDataSource.getRepository(SupportAccessGrant).findOne({
    where: { admin_id: adminId, business_id: businessId, revoked_at: IsNull(), expires_at: MoreThan(new Date()), level: MoreThanOrEqual(minLevel) },
    order: { level: 'DESC', expires_at: 'DESC' },
  });
}

type GrantRequest = PlatformRequest & { grant?: SupportAccessGrant };

function requireActiveGrant(minLevel: SupportLevel) {
  return async (req: GrantRequest, res: Response, next: NextFunction) => {
    const businessId = uuidSchema.parse(req.params.businessId);
    const grant = await activeGrant(req.admin!.id, businessId, minLevel);
    if (!grant) {
      res.status(403).json({ error: `Start a Level ${minLevel} support session for this business first`, code: 'NO_ACTIVE_GRANT', required_level: minLevel });
      return;
    }
    req.grant = grant;
    next();
  };
}

platformSupportRouter.get('/support/levels', requirePermission('support:access'), (_req, res) => {
  res.json({ levels: SUPPORT_LEVELS });
});

const grantSchema = z.object({
  business_id: uuidSchema,
  level: z.coerce.number().int().min(1).max(4).default(2),
  minutes: z.number().int().min(5).max(60).default(30),
  reason: z.string().trim().min(5, 'Enter a reason of at least 5 characters').max(500),
  password: z.string().max(200).optional(),
});

platformSupportRouter.post('/support/grants', requirePermission('support:access'), async (req: PlatformRequest, res) => {
  const body = grantSchema.parse(req.body);
  const level = body.level as SupportLevel;
  const definition = SUPPORT_LEVELS[level];
  const admin = req.admin!;
  const business = await AppDataSource.getRepository(Business).findOne({ where: { id: body.business_id } });
  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }
  if (definition.super_admin_only && admin.role !== 'SUPER_ADMIN') {
    await recordPlatformAudit({ req, admin, action: 'support.access_denied', targetType: 'business', targetId: business.id, businessId: business.id, reason: body.reason, metadata: { level }, result: 'denied' });
    res.status(403).json({ error: `Level ${level} access needs a super admin.`, code: 'FORBIDDEN' });
    return;
  }
  if (body.minutes > definition.max_minutes) {
    res.status(400).json({ error: `Level ${level} access lasts at most ${definition.max_minutes} minutes.` });
    return;
  }
  if (level === 4 && !(body.password && await verifyPassword(body.password, admin.password_hash))) {
    await recordPlatformAudit({ req, admin, action: 'support.emergency_failed', targetType: 'business', targetId: business.id, businessId: business.id, reason: body.reason, result: 'failed' });
    res.status(401).json({ error: 'Confirm your password to start emergency access.', code: 'STEP_UP_REQUIRED' });
    return;
  }
  const repo = AppDataSource.getRepository(SupportAccessGrant);
  const now = new Date();
  const grant = await repo.save(repo.create({
    id: randomUUID(),
    admin_id: admin.id,
    admin_name: admin.name,
    business_id: business.id,
    reason: body.reason,
    level,
    expires_at: new Date(now.getTime() + body.minutes * 60 * 1000),
    revoked_at: null,
    created_at: now,
  }));
  if (level >= 3) {
    await notifyAdmins({ permission: 'admins:manage', exceptAdminId: admin.id, category: 'support', priority: level === 4 ? 'critical' : 'high', title: `${admin.name} started level ${level} access to ${business.name}`, message: body.reason, actionUrl: '/platform/support', businessId: business.id, resourceType: 'grant', resourceId: grant.id });
  }
  await recordPlatformAudit({ req, admin, action: 'support.access_started', targetType: 'grant', targetId: grant.id, businessId: business.id, reason: body.reason, metadata: { minutes: body.minutes, level, level_name: definition.name } });
  await notifyBusinessOwners({
    businessId: business.id,
    action: 'PLATFORM_SUPPORT_ACCESS',
    entityId: grant.id,
    reason: body.reason,
    subject: level === 4 ? 'MIA support started emergency access to your business' : 'MIA support is viewing your business',
    message: `${admin.name} from MIA support has ${definition.name.toLowerCase()} access (level ${level}) to ${business.name} for up to ${body.minutes} minutes. ${definition.description}`,
  });
  res.status(201).json({ grant });
});

platformSupportRouter.get('/support/grants', requirePermission('support:access'), async (req, res) => {
  const businessId = typeof req.query.business_id === 'string' && req.query.business_id ? uuidSchema.parse(req.query.business_id) : null;
  const rows = await q(
    `SELECT g.id, g.admin_name, g.admin_id, g.business_id, g.reason, g.level, g.expires_at, g.revoked_at, g.created_at, b.name AS business_name,
            (SELECT COUNT(*) FROM platform_audit_logs a WHERE a.metadata->>'grant_id' = g.id::text) AS actions
     FROM support_access_grants g JOIN businesses b ON b.id = g.business_id
     WHERE ($1::uuid IS NULL OR g.business_id = $1)
     ORDER BY g.created_at DESC LIMIT 100`,
    [businessId],
  );
  res.json({ rows: rows.map((row) => ({ ...row, actions: Number(row.actions) })) });
});

platformSupportRouter.post('/support/grants/:id/revoke', requirePermission('support:access'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const repo = AppDataSource.getRepository(SupportAccessGrant);
  const grant = await repo.findOne({ where: { id } });
  if (!grant) {
    res.status(404).json({ error: 'Grant not found' });
    return;
  }
  if (grant.admin_id !== req.admin!.id && req.admin!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'You can only end your own access', code: 'FORBIDDEN' });
    return;
  }
  if (grant.revoked_at) {
    res.json({ ok: true });
    return;
  }
  await repo.update(id, { revoked_at: new Date() });
  await recordPlatformAudit({ req, admin: req.admin, action: 'support.access_ended', targetType: 'grant', targetId: id, businessId: grant.business_id, metadata: { grant_id: id, level: grant.level } });
  res.json({ ok: true });
});

async function audited(req: GrantRequest, action: string) {
  const businessId = req.grant!.business_id;
  await recordPlatformAudit({ req, admin: req.admin, action, targetType: 'business', targetId: businessId, businessId, metadata: { grant_id: req.grant!.id, level: req.grant!.level } });
}

platformSupportRouter.get('/support/:businessId/monitoring', requirePermission('support:access'), requireActiveGrant(1), async (req: GrantRequest, res) => {
  const id = req.grant!.business_id;
  const devices = await q(
    `SELECT device_id, MAX(updated_at) AS last_seen, COUNT(*) AS records
     FROM (SELECT device_id, updated_at FROM sales WHERE business_id = $1 AND updated_at >= now() - interval '30 days'
           UNION ALL SELECT device_id, updated_at FROM expenses WHERE business_id = $1 AND updated_at >= now() - interval '30 days'
           UNION ALL SELECT device_id, updated_at FROM payments WHERE business_id = $1 AND updated_at >= now() - interval '30 days') x
     WHERE device_id IS NOT NULL GROUP BY device_id ORDER BY last_seen DESC LIMIT 50`,
    [id],
  );
  const [problems] = await q(
    `SELECT (SELECT COUNT(*) FROM users WHERE business_id = $1 AND locked_until > now()) AS locked_users,
            (SELECT COUNT(*) FROM user_login_events WHERE business_id = $1 AND NOT success AND created_at >= now() - interval '7 days') AS failed_logins_7d,
            (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND voided AND sale_date >= now() - interval '7 days') AS voids_7d`,
    [id],
  );
  await audited(req, 'support.viewed_monitoring');
  res.json({ devices: devices.map((row) => ({ ...row, records: Number(row.records) })), signals: Object.fromEntries(Object.entries(problems).map(([k, v]) => [k, Number(v)])) });
});

platformSupportRouter.get('/support/:businessId/overview', requirePermission('support:access'), requireActiveGrant(2), async (req: GrantRequest, res) => {
  const id = req.grant!.business_id;
  const business = await AppDataSource.getRepository(Business).findOne({ where: { id } });
  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }
  const parsed = parsePeriodQuery(req.query);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  await audited(req, 'support.viewed_overview');
  res.json({ business, overview: await buildOverview(id, business.timezone, parsed.period, parsed.custom) });
});

platformSupportRouter.get('/support/:businessId/products', requirePermission('support:access'), requireActiveGrant(2), async (req: GrantRequest, res) => {
  await audited(req, 'support.viewed_products');
  res.json({ rows: await stockLevels(req.grant!.business_id) });
});

function maskName(name: string | null) {
  if (!name) return null;
  return name.split(/\s+/).map((part) => `${part.charAt(0)}${'•'.repeat(Math.max(1, part.length - 1))}`).join(' ');
}

platformSupportRouter.get('/support/:businessId/sales', requirePermission('support:access'), requireActiveGrant(2), async (req: GrantRequest, res) => {
  const id = req.grant!.business_id;
  const unmasked = req.grant!.level >= 4;
  const rows = await q(
    `SELECT s.id, s.reference_number, s.sale_date, s.total_amount, s.paid_amount, s.payment_status, s.voided, u.name AS cashier,
            c.name AS customer_name, c.phone AS customer_phone
     FROM sales s LEFT JOIN users u ON u.id = s.created_by LEFT JOIN customers c ON c.id = s.customer_id AND c.business_id = s.business_id
     WHERE s.business_id = $1 ORDER BY s.sale_date DESC LIMIT 50`,
    [id],
  );
  await audited(req, unmasked ? 'support.viewed_sales_unmasked' : 'support.viewed_sales');
  res.json({
    masked: !unmasked,
    rows: rows.map((row) => ({
      ...row,
      total_amount: Number(row.total_amount),
      paid_amount: Number(row.paid_amount),
      customer_name: unmasked ? row.customer_name : maskName(row.customer_name),
      customer_phone: unmasked ? row.customer_phone : row.customer_phone ? `•••• ${String(row.customer_phone).slice(-3)}` : null,
    })),
  });
});
