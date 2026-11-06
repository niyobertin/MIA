import { randomBytes, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Router, type NextFunction, type Response } from 'express';
import { ILike, IsNull, MoreThan } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import {
  Announcement,
  Business,
  BusinessPlatformState,
  DataRequest,
  PlatformAdmin,
  PlatformAuditLog,
  SubscriptionInvoice,
  SupportAccessGrant,
  User,
  type PlatformRole,
} from '../entities';
import { hashPassword, verifyPassword } from '../lib/auth';
import { buildOverview, stockLevels, type Period } from '../lib/businessData';
import { getBusinessState, upsertBusinessState } from '../lib/businessState';
import { notifyBusinessOwners, recordPlatformAudit } from '../lib/platformAudit';
import {
  isTwoFactorRequired,
  platformPasswordSchema,
  signPlatformChallenge,
  signPlatformSession,
  verifyPlatformToken,
} from '../lib/platformAuth';
import { FEATURE_FLAGS, platformPermissionsFor, resolveFlags } from '../lib/rbac';
import { decryptSecret, encryptSecret, findTotpStep, generateTotpSecret, totpUri } from '../lib/totp';
import { emailAndIpKey, rateLimit } from '../middleware/security';
import {
  requirePasswordCurrent,
  requirePermission,
  requirePlatformAuth,
  type PlatformRequest,
} from '../middleware/platform';
import { issuePinResetCode } from './auth';

export const platformRouter = Router();

const q = (sql: string, params: unknown[] = []) => AppDataSource.query(sql, params) as Promise<any[]>;
const num = (value: unknown) => Number(value ?? 0);

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const loginLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, key: emailAndIpKey });
const challengeLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 20 });

const INVALID_LOGIN = { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' };
const reasonSchema = z.object({ reason: z.string().trim().min(5, 'Enter a reason of at least 5 characters').max(500) });
const uuidSchema = z.string().uuid();
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(100).optional(),
});

function searchTerm(value: string | undefined) {
  return value ? `%${value.replace(/[%_\\]/g, '\\$&')}%` : null;
}

function publicAdmin(admin: PlatformAdmin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    active: admin.active,
    totp_enabled: admin.totp_enabled,
    must_change_password: admin.must_change_password,
    last_login_at: admin.last_login_at,
    permissions: platformPermissionsFor(admin.role),
  };
}

async function recordFailure(admin: PlatformAdmin) {
  const attempts = (admin.failed_attempts ?? 0) + 1;
  const locked = attempts >= MAX_FAILED_ATTEMPTS;
  await AppDataSource.getRepository(PlatformAdmin).update(admin.id, {
    failed_attempts: locked ? 0 : attempts,
    locked_until: locked ? new Date(Date.now() + FIFTEEN_MINUTES) : admin.locked_until,
  });
}

function isLocked(admin: PlatformAdmin) {
  return Boolean(admin.locked_until && admin.locked_until > new Date());
}

async function completeLogin(req: PlatformRequest, res: Response, admin: PlatformAdmin) {
  await AppDataSource.getRepository(PlatformAdmin).update(admin.id, {
    failed_attempts: 0,
    locked_until: null,
    last_login_at: new Date(),
  });
  await recordPlatformAudit({ req, admin, action: 'admin.login' });
  res.json({ step: 'done', token: signPlatformSession(admin.id, admin.token_version), admin: publicAdmin(admin) });
}

const LOCKED_RESPONSE = { error: 'Too many failed attempts. Try again in 15 minutes.', code: 'LOCKED' };

platformRouter.post('/auth/login', loginLimiter, async (req: PlatformRequest, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
  const email = body.email.trim().toLowerCase();
  const admin = await AppDataSource.getRepository(PlatformAdmin).findOne({ where: { email: ILike(email) } });
  if (!admin || !admin.active) {
    await hashPassword(body.password);
    await recordPlatformAudit({ req, action: 'admin.login_failed', metadata: { email } });
    res.status(401).json(INVALID_LOGIN);
    return;
  }
  if (isLocked(admin)) {
    res.status(423).json(LOCKED_RESPONSE);
    return;
  }
  if (!(await verifyPassword(body.password, admin.password_hash))) {
    await recordFailure(admin);
    await recordPlatformAudit({ req, admin, action: 'admin.login_failed' });
    res.status(401).json(INVALID_LOGIN);
    return;
  }
  if (!isTwoFactorRequired() && !admin.totp_enabled) {
    await completeLogin(req, res, admin);
    return;
  }
  res.json({
    step: admin.totp_enabled ? 'verify' : 'enroll',
    challenge: signPlatformChallenge(admin.id, admin.token_version),
  });
});

async function adminFromChallenge(challenge: string) {
  const payload = verifyPlatformToken(challenge, 'platform_mfa');
  const admin = await AppDataSource.getRepository(PlatformAdmin).findOne({ where: { id: payload.sub } });
  if (!admin || !admin.active || admin.token_version !== payload.ver) throw new Error('Invalid challenge');
  return admin;
}

platformRouter.post('/auth/2fa/setup', challengeLimiter, async (req, res) => {
  const body = z.object({ challenge: z.string().min(10) }).parse(req.body);
  let admin: PlatformAdmin;
  try {
    admin = await adminFromChallenge(body.challenge);
  } catch {
    res.status(401).json({ error: 'Your sign-in expired. Start again.', code: 'CHALLENGE_EXPIRED' });
    return;
  }
  if (admin.totp_enabled) {
    res.status(409).json({ error: 'Two-factor authentication is already set up' });
    return;
  }
  const secret = generateTotpSecret();
  await AppDataSource.getRepository(PlatformAdmin).update(admin.id, { totp_secret: encryptSecret(secret) });
  res.json({ secret, otpauth_uri: totpUri(secret, admin.email) });
});

platformRouter.post('/auth/2fa/verify', challengeLimiter, async (req: PlatformRequest, res) => {
  const body = z.object({ challenge: z.string().min(10), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }).parse(req.body);
  let admin: PlatformAdmin;
  try {
    admin = await adminFromChallenge(body.challenge);
  } catch {
    res.status(401).json({ error: 'Your sign-in expired. Start again.', code: 'CHALLENGE_EXPIRED' });
    return;
  }
  if (isLocked(admin)) {
    res.status(423).json(LOCKED_RESPONSE);
    return;
  }
  if (!admin.totp_secret) {
    res.status(400).json({ error: 'Set up two-factor authentication first' });
    return;
  }
  const step = findTotpStep(decryptSecret(admin.totp_secret), body.code, num(admin.totp_last_step));
  if (step === null) {
    await recordFailure(admin);
    await recordPlatformAudit({ req, admin, action: 'admin.2fa_failed' });
    res.status(401).json({ error: 'That code is not correct', code: 'INVALID_CODE' });
    return;
  }
  const enrolling = !admin.totp_enabled;
  await AppDataSource.getRepository(PlatformAdmin).update(admin.id, { totp_enabled: true, totp_last_step: step });
  if (enrolling) await recordPlatformAudit({ req, admin, action: 'admin.2fa_enrolled' });
  admin.totp_enabled = true;
  await completeLogin(req, res, admin);
});

platformRouter.use(requirePlatformAuth);

platformRouter.get('/auth/me', (req: PlatformRequest, res) => {
  res.json({ admin: publicAdmin(req.admin!) });
});

platformRouter.post('/auth/change-password', async (req: PlatformRequest, res) => {
  const body = z.object({ current: z.string().min(1).max(200), password: platformPasswordSchema }).parse(req.body);
  const admin = req.admin!;
  if (!(await verifyPassword(body.current, admin.password_hash))) {
    await recordFailure(admin);
    res.status(401).json({ error: 'Your current password is not correct' });
    return;
  }
  const version = admin.token_version + 1;
  await AppDataSource.getRepository(PlatformAdmin).update(admin.id, {
    password_hash: await hashPassword(body.password),
    must_change_password: false,
    token_version: version,
    updated_at: new Date(),
  });
  await recordPlatformAudit({ req, admin, action: 'admin.password_changed', targetType: 'admin', targetId: admin.id });
  res.json({ token: signPlatformSession(admin.id, version) });
});

platformRouter.use(requirePasswordCurrent);

platformRouter.get('/overview', requirePermission('metrics:read'), async (_req, res) => {
  const [totals] = await q(`
    SELECT
      (SELECT COUNT(*) FROM businesses) AS businesses,
      (SELECT COUNT(*) FROM businesses WHERE created_at >= now() - interval '30 days') AS new_businesses_30d,
      (SELECT COUNT(*) FROM business_platform_states WHERE status = 'suspended') AS suspended,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE active) AS active_users,
      (SELECT COUNT(DISTINCT business_id) FROM sales WHERE sale_date >= now() - interval '7 days' AND voided = false) AS active_7d,
      (SELECT COUNT(DISTINCT business_id) FROM sales WHERE sale_date >= now() - interval '30 days' AND voided = false) AS active_30d`);
  const [retention] = await q(`
    SELECT COUNT(*) AS eligible,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM sales s WHERE s.business_id = b.id AND s.voided = false AND s.sale_date >= now() - interval '30 days'
           )) AS retained
    FROM businesses b WHERE b.created_at < now() - interval '30 days'`);
  const [volume, roles, signups, plans] = await Promise.all([
    q(`SELECT b.currency, COUNT(*) AS sales, COALESCE(SUM(s.total_amount), 0) AS total
       FROM sales s JOIN businesses b ON b.id = s.business_id
       WHERE s.voided = false AND s.sale_date >= now() - interval '30 days'
       GROUP BY b.currency ORDER BY total DESC`),
    q(`SELECT COALESCE(role, 'NONE') AS role, COUNT(*) AS count FROM users GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(b.id) AS count
       FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
       LEFT JOIN businesses b ON date_trunc('day', b.created_at) = d
       GROUP BY d ORDER BY d`),
    q(`SELECT COALESCE(s.plan, 'free') AS plan, COUNT(*) AS count
       FROM businesses b LEFT JOIN business_platform_states s ON s.business_id = b.id GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  res.json({
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, num(value)])),
    retention: { eligible: num(retention.eligible), retained: num(retention.retained) },
    volume_30d: volume.map((row) => ({ currency: row.currency, sales: num(row.sales), total: num(row.total) })),
    roles: roles.map((row) => ({ role: row.role, count: num(row.count) })),
    signups: signups.map((row) => ({ day: row.day, count: num(row.count) })),
    plans: plans.map((row) => ({ plan: row.plan, count: num(row.count) })),
  });
});

platformRouter.get('/businesses', requirePermission('businesses:read'), async (req, res) => {
  const page = pageSchema.parse(req.query);
  const status = z.enum(['all', 'active', 'suspended']).default('all').parse(req.query.status);
  const params = [searchTerm(page.q), status];
  const where = `($1::text IS NULL OR b.name ILIKE $1 OR b.business_code ILIKE $1)
    AND ($2 = 'all' OR COALESCE(st.status, 'active') = $2)`;
  const from = `FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT b.id, b.name, b.business_code, b.currency, b.country, b.created_at,
              COALESCE(st.status, 'active') AS status, COALESCE(st.plan, 'free') AS plan,
              COALESCE(st.subscription_status, 'trial') AS subscription_status,
              (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS users,
              (SELECT u.email FROM users u WHERE u.business_id = b.id AND u.role = 'OWNER' ORDER BY u.created_at LIMIT 1) AS owner_email,
              (SELECT MAX(s.updated_at) FROM sales s WHERE s.business_id = b.id) AS last_sale_sync
       ${from} WHERE ${where} ORDER BY b.created_at DESC LIMIT $3 OFFSET $4`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params),
  ]);
  res.json({ total: num(count.total), rows: rows.map((row) => ({ ...row, users: num(row.users) })) });
});

platformRouter.get('/businesses/:id', requirePermission('businesses:read'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const business = await AppDataSource.getRepository(Business).findOne({ where: { id } });
  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }
  const [state, users, [counts]] = await Promise.all([
    getBusinessState(id),
    AppDataSource.getRepository(User).find({ where: { business_id: id }, order: { name: 'ASC' } }),
    q(
      `SELECT (SELECT COUNT(*) FROM products WHERE business_id = $1) AS products,
              (SELECT COUNT(*) FROM customers WHERE business_id = $1) AS customers,
              (SELECT COUNT(*) FROM sales WHERE business_id = $1) AS sales`,
      [id],
    ),
  ]);
  res.json({
    business,
    state: {
      status: state?.status ?? 'active',
      suspended_reason: state?.suspended_reason ?? null,
      suspended_at: state?.suspended_at ?? null,
      plan: state?.plan ?? 'free',
      subscription_status: state?.subscription_status ?? 'trial',
      trial_ends_at: state?.trial_ends_at ?? null,
      current_period_end: state?.current_period_end ?? null,
    },
    flags: resolveFlags(state?.feature_flags),
    flag_definitions: FEATURE_FLAGS,
    counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, num(value)])),
    users: users.map(({ id: userId, name, email, role, active, locked_until, failed_login_attempts }) => ({
      id: userId, name, email, role, active, locked_until, failed_login_attempts,
    })),
  });
});

async function requireBusiness(id: string, res: Response) {
  const business = await AppDataSource.getRepository(Business).findOne({ where: { id } });
  if (!business) res.status(404).json({ error: 'Business not found' });
  return business;
}

platformRouter.post('/businesses/:id/suspend', requirePermission('businesses:suspend'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { reason } = reasonSchema.parse(req.body);
  const business = await requireBusiness(id, res);
  if (!business) return;
  await upsertBusinessState(id, { status: 'suspended', suspended_reason: reason, suspended_at: new Date() });
  await recordPlatformAudit({ req, admin: req.admin, action: 'business.suspended', targetType: 'business', targetId: id, businessId: id, reason });
  await notifyBusinessOwners({
    businessId: id,
    action: 'PLATFORM_SUSPENDED',
    reason,
    subject: 'Your MIA business has been suspended',
    message: `MIA has suspended ${business.name}. Sign-in and sync are paused until this is resolved. Contact MIA support for help.`,
  });
  res.json({ ok: true });
});

platformRouter.post('/businesses/:id/reactivate', requirePermission('businesses:suspend'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { reason } = reasonSchema.parse(req.body);
  const business = await requireBusiness(id, res);
  if (!business) return;
  await upsertBusinessState(id, { status: 'active', suspended_reason: null, suspended_at: null });
  await recordPlatformAudit({ req, admin: req.admin, action: 'business.reactivated', targetType: 'business', targetId: id, businessId: id, reason });
  await notifyBusinessOwners({
    businessId: id,
    action: 'PLATFORM_REACTIVATED',
    reason,
    subject: 'Your MIA business is active again',
    message: `MIA has reactivated ${business.name}. Sign-in and sync work again.`,
  });
  res.json({ ok: true });
});

platformRouter.patch('/businesses/:id/flags', requirePermission('flags:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const body = z.object({
    flags: z.partialRecord(z.enum(Object.keys(FEATURE_FLAGS) as [keyof typeof FEATURE_FLAGS]), z.boolean()),
    reason: reasonSchema.shape.reason,
  }).parse(req.body);
  const business = await requireBusiness(id, res);
  if (!business) return;
  const state = await getBusinessState(id);
  const flags = { ...(state?.feature_flags ?? {}), ...body.flags };
  await upsertBusinessState(id, { feature_flags: flags });
  await recordPlatformAudit({ req, admin: req.admin, action: 'business.flags_changed', targetType: 'business', targetId: id, businessId: id, reason: body.reason, metadata: body.flags });
  res.json({ flags: resolveFlags(flags) });
});

platformRouter.get('/businesses/:id/export', requirePermission('data:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { reason } = reasonSchema.parse({ reason: req.query.reason });
  const business = await requireBusiness(id, res);
  if (!business) return;
  const tables = [
    'categories', 'products', 'suppliers', 'customers', 'stock_movements', 'purchases', 'purchase_items', 'sales',
    'sale_items', 'expenses', 'payments', 'daily_closings', 'daily_stock_lines', 'waiter_tabs', 'waiter_tab_items', 'audit_logs',
  ];
  const data: Record<string, unknown[]> = {};
  for (const table of tables) data[table] = await q(`SELECT * FROM ${table} WHERE business_id = $1`, [id]);
  data.users = await q(
    `SELECT id, business_id, name, email, phone, role, active, created_at, updated_at FROM users WHERE business_id = $1`,
    [id],
  );
  await recordPlatformAudit({ req, admin: req.admin, action: 'business.exported', targetType: 'business', targetId: id, businessId: id, reason });
  await notifyBusinessOwners({
    businessId: id,
    action: 'PLATFORM_DATA_EXPORT',
    reason,
    subject: 'A copy of your MIA data was exported',
    message: `MIA staff exported a copy of the data for ${business.name}.`,
  });
  res.setHeader('Content-Disposition', `attachment; filename="mia-${business.business_code}.json"`);
  res.json({ exported_at: new Date(), business, tables: data });
});

platformRouter.get('/users', requirePermission('users:read'), async (req, res) => {
  const page = pageSchema.parse(req.query);
  const params = [searchTerm(page.q)];
  const where = `($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1)`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.locked_until, u.failed_login_attempts,
              u.business_id, b.name AS business_name
       FROM users u LEFT JOIN businesses b ON b.id = u.business_id
       WHERE ${where} ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM users u WHERE ${where}`, params),
  ]);
  res.json({ total: num(count.total), rows });
});

const userActions = {
  unlock: { action: 'user.unlocked', changes: () => ({ locked_until: null, failed_login_attempts: 0 }) },
  'force-signout': { action: 'user.signed_out', changes: (u: User) => ({ token_version: (u.token_version ?? 0) + 1 }) },
  deactivate: { action: 'user.deactivated', changes: (u: User) => ({ active: false, token_version: (u.token_version ?? 0) + 1 }) },
  reactivate: { action: 'user.reactivated', changes: () => ({ active: true }) },
} as const;

platformRouter.post('/users/:id/:action', requirePermission('users:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const actionName = String(req.params.action);
  const { reason } = reasonSchema.parse(req.body);
  const users = AppDataSource.getRepository(User);
  const user = await users.findOne({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (actionName === 'send-pin-reset') {
    if (!user.active) {
      res.status(400).json({ error: 'Reactivate this user before sending a reset.' });
      return;
    }
    await AppDataSource.query(`DELETE FROM pin_reset_codes WHERE user_id = $1`, [id]);
    await issuePinResetCode(user.email);
    await recordPlatformAudit({ req, admin: req.admin, action: 'user.pin_reset_sent', targetType: 'user', targetId: id, businessId: user.business_id, reason });
    res.json({ ok: true });
    return;
  }
  const definition = userActions[actionName as keyof typeof userActions];
  if (!definition) {
    res.status(404).json({ error: 'Unknown action' });
    return;
  }
  await users.update(id, { ...definition.changes(user), updated_at: new Date() });
  await recordPlatformAudit({ req, admin: req.admin, action: definition.action, targetType: 'user', targetId: id, businessId: user.business_id, reason });
  res.json({ ok: true });
});

platformRouter.get('/audit', requirePermission('audit:read'), async (req, res) => {
  const page = pageSchema.parse(req.query);
  const params = [searchTerm(page.q)];
  const where = `($1::text IS NULL OR a.action ILIKE $1 OR a.admin_email ILIKE $1 OR a.target_id ILIKE $1 OR b.name ILIKE $1)`;
  const from = `FROM platform_audit_logs a LEFT JOIN businesses b ON b.id = a.business_id`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT a.id, a.admin_email, a.action, a.target_type, a.target_id, a.reason, a.metadata, a.ip, a.created_at, b.name AS business_name
       ${from} WHERE ${where} ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params),
  ]);
  res.json({ total: num(count.total), rows });
});

platformRouter.get('/sync-health', requirePermission('sync:read'), async (_req, res) => {
  const started = Date.now();
  await q('SELECT 1');
  const dbLatency = Date.now() - started;
  const rows = await q(`
    SELECT b.id, b.name, b.business_code,
           GREATEST(
             (SELECT MAX(updated_at) FROM sales WHERE business_id = b.id),
             (SELECT MAX(updated_at) FROM stock_movements WHERE business_id = b.id),
             (SELECT MAX(updated_at) FROM payments WHERE business_id = b.id),
             (SELECT MAX(updated_at) FROM expenses WHERE business_id = b.id)
           ) AS last_data_received,
           (SELECT COUNT(DISTINCT device_id) FROM sales WHERE business_id = b.id AND updated_at >= now() - interval '30 days') AS devices_30d,
           (SELECT COUNT(*) FROM sales WHERE business_id = b.id AND updated_at >= now() - interval '24 hours') AS sales_24h
    FROM businesses b ORDER BY last_data_received DESC NULLS LAST LIMIT 200`);
  res.json({
    api: {
      uptime_seconds: Math.round(process.uptime()),
      db_latency_ms: dbLatency,
      email_configured: Boolean(process.env.SMTP_HOST),
      node_env: process.env.NODE_ENV ?? 'development',
    },
    businesses: rows.map((row) => ({ ...row, devices_30d: num(row.devices_30d), sales_24h: num(row.sales_24h) })),
  });
});

platformRouter.get('/alerts', requirePermission('alerts:read'), async (_req, res) => {
  const [locked, attempts, voids, variance, stale] = await Promise.all([
    q(`SELECT u.id, u.email, u.locked_until, b.name AS business_name FROM users u
       LEFT JOIN businesses b ON b.id = u.business_id WHERE u.locked_until > now() ORDER BY u.locked_until DESC LIMIT 50`),
    q(`SELECT u.id, u.email, u.failed_login_attempts, b.name AS business_name FROM users u
       LEFT JOIN businesses b ON b.id = u.business_id WHERE u.failed_login_attempts >= 3
       ORDER BY u.failed_login_attempts DESC LIMIT 50`),
    q(`SELECT s.business_id, b.name AS business_name, COUNT(*) AS sales,
              COUNT(*) FILTER (WHERE s.voided) AS voided
       FROM sales s JOIN businesses b ON b.id = s.business_id
       WHERE s.sale_date >= now() - interval '7 days'
       GROUP BY s.business_id, b.name
       HAVING COUNT(*) >= 10 AND COUNT(*) FILTER (WHERE s.voided) * 5 >= COUNT(*)
       ORDER BY voided DESC LIMIT 50`),
    q(`SELECT d.business_id, b.name AS business_name, b.currency, d.business_date, d.cash_variance
       FROM daily_closings d JOIN businesses b ON b.id = d.business_id
       WHERE d.status = 'closed' AND d.closed_at >= now() - interval '7 days' AND ABS(d.cash_variance) >= 50000
       ORDER BY ABS(d.cash_variance) DESC LIMIT 50`),
    q(`SELECT b.id AS business_id, b.name AS business_name, MAX(s.updated_at) AS last_sale
       FROM businesses b JOIN sales s ON s.business_id = b.id
       GROUP BY b.id, b.name HAVING MAX(s.updated_at) < now() - interval '14 days'
       ORDER BY last_sale DESC LIMIT 50`),
  ]);
  res.json({
    locked_users: locked,
    repeated_failed_logins: attempts.map((row) => ({ ...row })),
    high_void_rates: voids.map((row) => ({ ...row, sales: num(row.sales), voided: num(row.voided) })),
    large_cash_variances: variance.map((row) => ({ ...row, cash_variance: num(row.cash_variance) })),
    gone_quiet: stale,
  });
});

platformRouter.get('/billing', requirePermission('billing:read'), async (req, res) => {
  const page = pageSchema.parse(req.query);
  const params = [searchTerm(page.q)];
  const where = `($1::text IS NULL OR b.name ILIKE $1 OR b.business_code ILIKE $1)`;
  const [rows, [count], [summary]] = await Promise.all([
    q(
      `SELECT b.id, b.name, b.business_code, b.currency, COALESCE(s.plan, 'free') AS plan,
              COALESCE(s.subscription_status, 'trial') AS subscription_status, s.trial_ends_at, s.current_period_end,
              (SELECT COALESCE(SUM(amount), 0) FROM subscription_invoices i WHERE i.business_id = b.id AND i.status = 'open') AS open_balance
       FROM businesses b LEFT JOIN business_platform_states s ON s.business_id = b.id
       WHERE ${where} ORDER BY b.name LIMIT $2 OFFSET $3`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM businesses b WHERE ${where}`, params),
    q(`SELECT COUNT(*) FILTER (WHERE status = 'open') AS open_invoices,
              COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= now() - interval '30 days'), 0) AS paid_30d
       FROM subscription_invoices`),
  ]);
  res.json({
    total: num(count.total),
    summary: { open_invoices: num(summary.open_invoices), paid_30d: num(summary.paid_30d) },
    rows: rows.map((row) => ({ ...row, open_balance: num(row.open_balance) })),
  });
});

platformRouter.patch('/billing/:businessId', requirePermission('billing:write'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.businessId);
  const body = z.object({
    plan: z.string().trim().min(2).max(40).optional(),
    subscription_status: z.enum(['trial', 'active', 'past_due', 'cancelled']).optional(),
    trial_ends_at: z.coerce.date().nullable().optional(),
    current_period_end: z.coerce.date().nullable().optional(),
    reason: reasonSchema.shape.reason,
  }).parse(req.body);
  const { reason, ...changes } = body;
  if (!(await requireBusiness(id, res))) return;
  await upsertBusinessState(id, changes);
  await recordPlatformAudit({ req, admin: req.admin, action: 'billing.subscription_changed', targetType: 'business', targetId: id, businessId: id, reason, metadata: changes });
  res.json({ ok: true });
});

platformRouter.get('/billing/:businessId/invoices', requirePermission('billing:read'), async (req, res) => {
  const id = uuidSchema.parse(req.params.businessId);
  const rows = await AppDataSource.getRepository(SubscriptionInvoice).find({ where: { business_id: id }, order: { created_at: 'DESC' }, take: 100 });
  res.json({ rows });
});

platformRouter.post('/billing/:businessId/invoices', requirePermission('billing:write'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.businessId);
  const body = z.object({
    amount: z.number().int().positive(),
    period_start: z.string().date(),
    period_end: z.string().date(),
  }).refine((value) => value.period_end >= value.period_start, 'The period end must be after the start').parse(req.body);
  const business = await requireBusiness(id, res);
  if (!business) return;
  const repo = AppDataSource.getRepository(SubscriptionInvoice);
  const invoice = await repo.save(repo.create({
    id: randomUUID(),
    business_id: id,
    amount: body.amount,
    currency: business.currency,
    period_start: body.period_start,
    period_end: body.period_end,
    status: 'open',
    created_by: req.admin!.id,
    created_at: new Date(),
  }));
  await recordPlatformAudit({ req, admin: req.admin, action: 'billing.invoice_created', targetType: 'invoice', targetId: invoice.id, businessId: id, metadata: { amount: body.amount } });
  res.status(201).json({ invoice });
});

platformRouter.post('/billing/invoices/:id/status', requirePermission('billing:write'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const body = z.object({
    status: z.enum(['paid', 'void']),
    payment_method: z.string().trim().max(40).optional(),
    payment_reference: z.string().trim().max(100).optional(),
  }).parse(req.body);
  const repo = AppDataSource.getRepository(SubscriptionInvoice);
  const invoice = await repo.findOne({ where: { id } });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (invoice.status !== 'open') {
    res.status(409).json({ error: 'Only open invoices can be changed' });
    return;
  }
  await repo.update(id, {
    status: body.status,
    paid_at: body.status === 'paid' ? new Date() : null,
    payment_method: body.payment_method ?? null,
    payment_reference: body.payment_reference ?? null,
  });
  await recordPlatformAudit({ req, admin: req.admin, action: `billing.invoice_${body.status}`, targetType: 'invoice', targetId: id, businessId: invoice.business_id, metadata: { amount: invoice.amount } });
  res.json({ ok: true });
});

const grantSchema = z.object({
  business_id: uuidSchema,
  minutes: z.number().int().min(5).max(60).default(30),
  reason: reasonSchema.shape.reason,
});

platformRouter.post('/support/grants', requirePermission('support:access'), async (req: PlatformRequest, res) => {
  const body = grantSchema.parse(req.body);
  const business = await requireBusiness(body.business_id, res);
  if (!business) return;
  const repo = AppDataSource.getRepository(SupportAccessGrant);
  const now = new Date();
  const grant = await repo.save(repo.create({
    id: randomUUID(),
    admin_id: req.admin!.id,
    admin_name: req.admin!.name,
    business_id: body.business_id,
    reason: body.reason,
    expires_at: new Date(now.getTime() + body.minutes * 60 * 1000),
    revoked_at: null,
    created_at: now,
  }));
  await recordPlatformAudit({ req, admin: req.admin, action: 'support.access_started', targetType: 'grant', targetId: grant.id, businessId: body.business_id, reason: body.reason, metadata: { minutes: body.minutes } });
  await notifyBusinessOwners({
    businessId: body.business_id,
    action: 'PLATFORM_SUPPORT_ACCESS',
    entityId: grant.id,
    reason: body.reason,
    subject: 'MIA support is viewing your business',
    message: `${req.admin!.name} from MIA support has read-only access to ${business.name} for up to ${body.minutes} minutes. They cannot change your records.`,
  });
  res.status(201).json({ grant });
});

platformRouter.get('/support/grants', requirePermission('support:access'), async (_req, res) => {
  const rows = await q(
    `SELECT g.id, g.admin_name, g.admin_id, g.business_id, g.reason, g.expires_at, g.revoked_at, g.created_at, b.name AS business_name
     FROM support_access_grants g JOIN businesses b ON b.id = g.business_id
     ORDER BY g.created_at DESC LIMIT 100`,
  );
  res.json({ rows });
});

platformRouter.post('/support/grants/:id/revoke', requirePermission('support:access'), async (req: PlatformRequest, res) => {
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
  await repo.update(id, { revoked_at: new Date() });
  await recordPlatformAudit({ req, admin: req.admin, action: 'support.access_ended', targetType: 'grant', targetId: id, businessId: grant.business_id });
  res.json({ ok: true });
});

async function requireActiveGrant(req: PlatformRequest, res: Response, next: NextFunction) {
  const businessId = uuidSchema.parse(req.params.businessId);
  const grant = await AppDataSource.getRepository(SupportAccessGrant).findOne({
    where: { admin_id: req.admin!.id, business_id: businessId, revoked_at: IsNull(), expires_at: MoreThan(new Date()) },
    order: { expires_at: 'DESC' },
  });
  if (!grant) {
    res.status(403).json({ error: 'Start a support session for this business first', code: 'NO_ACTIVE_GRANT' });
    return;
  }
  next();
}

platformRouter.get('/support/:businessId/overview', requirePermission('support:access'), requireActiveGrant, async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.businessId);
  const business = await requireBusiness(id, res);
  if (!business) return;
  const period = z.enum(['today', 'yesterday', '7d', '30d', '90d']).default('7d').parse(req.query.period) as Period;
  await recordPlatformAudit({ req, admin: req.admin, action: 'support.viewed_overview', targetType: 'business', targetId: id, businessId: id });
  res.json({ business, overview: await buildOverview(id, business.timezone, period) });
});

platformRouter.get('/support/:businessId/products', requirePermission('support:access'), requireActiveGrant, async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.businessId);
  await recordPlatformAudit({ req, admin: req.admin, action: 'support.viewed_products', targetType: 'business', targetId: id, businessId: id });
  res.json({ rows: await stockLevels(id) });
});

platformRouter.get('/data-requests', requirePermission('data:manage'), async (_req, res) => {
  const rows = await q(
    `SELECT r.id, r.business_id, r.type, r.status, r.notes, r.completed_at, r.created_at, b.name AS business_name
     FROM data_requests r LEFT JOIN businesses b ON b.id = r.business_id ORDER BY r.created_at DESC LIMIT 200`,
  );
  res.json({ rows });
});

platformRouter.post('/data-requests', requirePermission('data:manage'), async (req: PlatformRequest, res) => {
  const body = z.object({
    business_id: uuidSchema,
    type: z.enum(['export', 'deletion']),
    notes: z.string().trim().max(1000).optional(),
  }).parse(req.body);
  if (!(await requireBusiness(body.business_id, res))) return;
  const repo = AppDataSource.getRepository(DataRequest);
  const now = new Date();
  const request = await repo.save(repo.create({
    id: randomUUID(),
    business_id: body.business_id,
    type: body.type,
    status: 'open',
    notes: body.notes ?? null,
    created_by: req.admin!.id,
    created_at: now,
    updated_at: now,
  }));
  await recordPlatformAudit({ req, admin: req.admin, action: `data.${body.type}_requested`, targetType: 'data_request', targetId: request.id, businessId: body.business_id });
  res.status(201).json({ request });
});

platformRouter.patch('/data-requests/:id', requirePermission('data:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const body = z.object({
    status: z.enum(['in_progress', 'completed', 'rejected']),
    notes: z.string().trim().max(1000).optional(),
  }).parse(req.body);
  const repo = AppDataSource.getRepository(DataRequest);
  const request = await repo.findOne({ where: { id } });
  if (!request) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }
  await repo.update(id, {
    status: body.status,
    notes: body.notes ?? request.notes,
    completed_at: body.status === 'completed' ? new Date() : null,
    updated_at: new Date(),
  });
  await recordPlatformAudit({ req, admin: req.admin, action: `data.request_${body.status}`, targetType: 'data_request', targetId: id, businessId: request.business_id });
  res.json({ ok: true });
});

platformRouter.get('/backups', requirePermission('data:manage'), async (_req, res) => {
  const dir = path.resolve(process.env.BACKUP_DIR ?? './backups');
  try {
    const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.dump'));
    const files = await Promise.all(names.map(async (name) => {
      const stat = await fs.stat(path.join(dir, name));
      return { name, size_bytes: stat.size, created_at: stat.mtime };
    }));
    files.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    res.json({ configured: true, files: files.slice(0, 30) });
  } catch {
    res.json({ configured: false, files: [] });
  }
});

platformRouter.get('/announcements', requirePermission('announcements:manage'), async (_req, res) => {
  const rows = await q(
    `SELECT a.id, a.title, a.body, a.severity, a.business_id, a.starts_at, a.ends_at, a.active, a.created_at, b.name AS business_name
     FROM announcements a LEFT JOIN businesses b ON b.id = a.business_id ORDER BY a.created_at DESC LIMIT 100`,
  );
  res.json({ rows });
});

platformRouter.post('/announcements', requirePermission('announcements:manage'), async (req: PlatformRequest, res) => {
  const body = z.object({
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(3).max(1000),
    severity: z.enum(['info', 'warning', 'critical']).default('info'),
    business_id: uuidSchema.nullable().optional(),
    ends_at: z.coerce.date().nullable().optional(),
  }).parse(req.body);
  const repo = AppDataSource.getRepository(Announcement);
  const now = new Date();
  const announcement = await repo.save(repo.create({
    id: randomUUID(),
    title: body.title,
    body: body.body,
    severity: body.severity,
    business_id: body.business_id ?? null,
    starts_at: now,
    ends_at: body.ends_at ?? null,
    active: true,
    created_by: req.admin!.id,
    created_at: now,
  }));
  await recordPlatformAudit({ req, admin: req.admin, action: 'announcement.created', targetType: 'announcement', targetId: announcement.id, businessId: body.business_id ?? null, metadata: { title: body.title } });
  res.status(201).json({ announcement });
});

platformRouter.patch('/announcements/:id', requirePermission('announcements:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const body = z.object({ active: z.boolean() }).parse(req.body);
  await AppDataSource.getRepository(Announcement).update(id, { active: body.active });
  await recordPlatformAudit({ req, admin: req.admin, action: body.active ? 'announcement.activated' : 'announcement.ended', targetType: 'announcement', targetId: id });
  res.json({ ok: true });
});

platformRouter.get('/admins', requirePermission('admins:manage'), async (_req, res) => {
  const admins = await AppDataSource.getRepository(PlatformAdmin).find({ order: { name: 'ASC' } });
  res.json({ rows: admins.map(publicAdmin) });
});

const roleSchema = z.enum(['SUPER_ADMIN', 'SUPPORT', 'FINANCE']);

function temporaryPassword() {
  return `Mia-${randomBytes(9).toString('base64url')}7a`;
}

platformRouter.post('/admins', requirePermission('admins:manage'), async (req: PlatformRequest, res) => {
  const body = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email(), role: roleSchema }).parse(req.body);
  const repo = AppDataSource.getRepository(PlatformAdmin);
  const email = body.email.trim().toLowerCase();
  if (await repo.findOne({ where: { email: ILike(email) } })) {
    res.status(409).json({ error: 'An admin with this email already exists' });
    return;
  }
  const password = temporaryPassword();
  const now = new Date();
  const admin = await repo.save(repo.create({
    id: randomUUID(),
    name: body.name,
    email,
    password_hash: await hashPassword(password),
    role: body.role as PlatformRole,
    must_change_password: true,
    created_at: now,
    updated_at: now,
  }));
  await recordPlatformAudit({ req, admin: req.admin, action: 'admin.created', targetType: 'admin', targetId: admin.id, metadata: { role: body.role, email } });
  res.status(201).json({ admin: publicAdmin(admin), temporary_password: password });
});

platformRouter.post('/admins/:id/:action', requirePermission('admins:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const action = z.enum(['deactivate', 'reactivate', 'reset-2fa', 'reset-password', 'set-role']).parse(req.params.action);
  const { reason } = reasonSchema.parse(req.body);
  if (id === req.admin!.id) {
    res.status(400).json({ error: 'Ask another super admin to change your own account.' });
    return;
  }
  const repo = AppDataSource.getRepository(PlatformAdmin);
  const target = await repo.findOne({ where: { id } });
  if (!target) {
    res.status(404).json({ error: 'Admin not found' });
    return;
  }
  const version = target.token_version + 1;
  const now = new Date();
  let temporary: string | undefined;
  if (action === 'deactivate') await repo.update(id, { active: false, token_version: version, updated_at: now });
  if (action === 'reactivate') await repo.update(id, { active: true, updated_at: now });
  if (action === 'reset-2fa') await repo.update(id, { totp_enabled: false, totp_secret: null, totp_last_step: 0, token_version: version, updated_at: now });
  if (action === 'set-role') await repo.update(id, { role: roleSchema.parse(req.body.role) as PlatformRole, token_version: version, updated_at: now });
  if (action === 'reset-password') {
    temporary = temporaryPassword();
    await repo.update(id, { password_hash: await hashPassword(temporary), must_change_password: true, token_version: version, failed_attempts: 0, locked_until: null, updated_at: now });
  }
  await recordPlatformAudit({ req, admin: req.admin, action: `admin.${action}`, targetType: 'admin', targetId: id, reason, metadata: action === 'set-role' ? { role: req.body.role } : undefined });
  res.json({ ok: true, ...(temporary ? { temporary_password: temporary } : {}) });
});

platformRouter.use((error: unknown, _req: PlatformRequest, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong' });
});
