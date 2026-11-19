import { randomBytes, randomInt, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Router, type NextFunction, type Response } from 'express';
import { ILike } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import {
  Business,
  DataRequest,
  PinHelpRequest,
  PlatformAdmin,
  PlatformLoginCode,
  SubscriptionInvoice,
  User,
  type PlatformRole,
} from '../entities';
import { hashPassword, verifyPassword } from '../lib/auth';
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
import { emailAndIpKey, rateLimit } from '../middleware/security';
import {
  requirePasswordCurrent,
  requirePermission,
  requirePlatformAuth,
  type PlatformRequest,
} from '../middleware/platform';
import { issuePinResetCode } from './auth';
import { platformAdminRouter } from './platformAdmin';
import { platformSupportRouter } from './platformSupport';
import { platformNotificationsRouter } from './platformNotifications';
import { platformCommsRouter } from './platformComms';
import { formatEventTime, queueTemplateEmail, sendSensitiveTemplateEmail } from '../lib/email';
import { notifyAdmins } from '../lib/notifications';
import { listWindow, windowWhere } from './dashboardShared';
import { generateTemporaryPin } from '../lib/pin';

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
    two_factor: isTwoFactorRequired() ? 'email' : 'off',
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
  if (locked) {
    void queueTemplateEmail({ template: 'auth.suspicious_login', to: admin.email, variables: { recipient_name: admin.name, event_time: formatEventTime(new Date()) } });
    void notifyAdmins({ permission: 'admins:manage', exceptAdminId: admin.id, category: 'security', priority: 'high', title: `${admin.name}'s platform account was locked`, message: 'Five failed sign-in attempts in a row.', actionUrl: '/platform/audit', dedupeKey: `admin-locked:${admin.id}:${new Date().toISOString().slice(0, 13)}` });
  }
}

function isLocked(admin: PlatformAdmin) {
  return Boolean(admin.locked_until && admin.locked_until > new Date());
}

async function completeLogin(req: PlatformRequest, res: Response, admin: PlatformAdmin) {
  const [seen] = await AppDataSource.query(
    `SELECT EXISTS (SELECT 1 FROM platform_audit_logs WHERE admin_id = $1 AND action = 'admin.login' AND ip IS NOT DISTINCT FROM $2) AS same_ip,
            EXISTS (SELECT 1 FROM platform_audit_logs WHERE admin_id = $1 AND action = 'admin.login') AS any_before`,
    [admin.id, req.ip ?? null],
  );
  if (seen?.any_before && !seen?.same_ip) {
    void queueTemplateEmail({ template: 'auth.new_login', to: admin.email, variables: { recipient_name: admin.name, event_time: formatEventTime(new Date()), ip_address: req.ip ?? 'unknown', device: String(req.headers['user-agent'] ?? 'Unknown device').slice(0, 80) } });
  }
  await AppDataSource.getRepository(PlatformAdmin).update(admin.id, {
    failed_attempts: 0,
    locked_until: null,
    last_login_at: new Date(),
  });
  await recordPlatformAudit({ req, admin, action: 'admin.login' });
  res.json({ step: 'done', token: signPlatformSession(admin.id, admin.token_version), admin: publicAdmin(admin) });
}

const LOCKED_RESPONSE = { error: 'Too many failed attempts. Try again in 15 minutes.', code: 'LOCKED' };

const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
const LOGIN_CODE_RESEND_MS = 60 * 1000;
const LOGIN_CODE_MAX_ATTEMPTS = 5;

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const shown = name.length <= 2 ? name.charAt(0) : `${name.slice(0, 2)}`;
  return `${shown}${'•'.repeat(Math.max(1, name.length - shown.length))}@${domain}`;
}

async function sendLoginCode(admin: PlatformAdmin, force = false): Promise<'sent' | 'wait'> {
  const codes = AppDataSource.getRepository(PlatformLoginCode);
  const existing = await codes.findOne({ where: { admin_id: admin.id } });
  const now = Date.now();
  if (!force && existing && now - existing.created_at.getTime() < LOGIN_CODE_RESEND_MS) return 'wait';
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await codes.save(
    codes.create({
      admin_id: admin.id,
      code_hash: await hashPassword(code),
      expires_at: new Date(now + LOGIN_CODE_TTL_MS),
      attempts: 0,
      created_at: new Date(now),
    }),
  );
  await sendSensitiveTemplateEmail({
    template: 'auth.sign_in_code',
    to: admin.email,
    variables: { recipient_name: admin.name, verification_code: code, expiration_time: '10 minutes' },
  });
  return 'sent';
}

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
  if (!isTwoFactorRequired()) {
    await completeLogin(req, res, admin);
    return;
  }
  try {
    await sendLoginCode(admin, true);
  } catch (error) {
    console.error('Could not send platform sign-in code', error);
    res.status(503).json({ error: 'We could not send your sign-in code. Try again in a minute.', code: 'EMAIL_FAILED' });
    return;
  }
  await recordPlatformAudit({ req, admin, action: 'admin.code_sent' });
  res.json({
    step: 'verify',
    channel: 'email',
    sent_to: maskEmail(admin.email),
    challenge: signPlatformChallenge(admin.id, admin.token_version),
  });
});

async function adminFromChallenge(challenge: string) {
  const payload = verifyPlatformToken(challenge, 'platform_mfa');
  const admin = await AppDataSource.getRepository(PlatformAdmin).findOne({ where: { id: payload.sub } });
  if (!admin || !admin.active || admin.token_version !== payload.ver) throw new Error('Invalid challenge');
  return admin;
}

const CHALLENGE_EXPIRED = { error: 'Your sign-in expired. Start again.', code: 'CHALLENGE_EXPIRED' };

platformRouter.post('/auth/2fa/resend', challengeLimiter, async (req: PlatformRequest, res) => {
  const body = z.object({ challenge: z.string().min(10) }).parse(req.body);
  let admin: PlatformAdmin;
  try {
    admin = await adminFromChallenge(body.challenge);
  } catch {
    res.status(401).json(CHALLENGE_EXPIRED);
    return;
  }
  if (isLocked(admin)) {
    res.status(423).json(LOCKED_RESPONSE);
    return;
  }
  try {
    const result = await sendLoginCode(admin);
    if (result === 'wait') {
      res.status(429).json({ error: 'Wait a minute before asking for another code.', code: 'RESEND_TOO_SOON' });
      return;
    }
  } catch (error) {
    console.error('Could not send platform sign-in code', error);
    res.status(503).json({ error: 'We could not send your sign-in code. Try again in a minute.', code: 'EMAIL_FAILED' });
    return;
  }
  await recordPlatformAudit({ req, admin, action: 'admin.code_sent' });
  res.json({ ok: true, sent_to: maskEmail(admin.email) });
});

platformRouter.post('/auth/2fa/verify', challengeLimiter, async (req: PlatformRequest, res) => {
  const body = z.object({ challenge: z.string().min(10), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }).parse(req.body);
  let admin: PlatformAdmin;
  try {
    admin = await adminFromChallenge(body.challenge);
  } catch {
    res.status(401).json(CHALLENGE_EXPIRED);
    return;
  }
  if (isLocked(admin)) {
    res.status(423).json(LOCKED_RESPONSE);
    return;
  }
  const codes = AppDataSource.getRepository(PlatformLoginCode);
  const stored = await codes.findOne({ where: { admin_id: admin.id } });
  if (!stored || stored.expires_at.getTime() < Date.now()) {
    if (stored) await codes.delete({ admin_id: admin.id });
    res.status(401).json({ error: 'That code has expired. Ask for a new one.', code: 'CODE_EXPIRED' });
    return;
  }
  if (!(await verifyPassword(body.code, stored.code_hash))) {
    const attempts = stored.attempts + 1;
    if (attempts >= LOGIN_CODE_MAX_ATTEMPTS) await codes.delete({ admin_id: admin.id });
    else await codes.update({ admin_id: admin.id }, { attempts });
    await recordFailure(admin);
    await recordPlatformAudit({ req, admin, action: 'admin.2fa_failed' });
    res.status(401).json({ error: 'That code is not correct', code: 'INVALID_CODE' });
    return;
  }
  await codes.delete({ admin_id: admin.id });
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
  void queueTemplateEmail({ template: 'auth.password_changed', to: admin.email, variables: { recipient_name: admin.name, event_time: formatEventTime(new Date()) } });
  res.json({ token: signPlatformSession(admin.id, version) });
});

platformRouter.use(requirePasswordCurrent);
platformRouter.use(platformAdminRouter);
platformRouter.use(platformSupportRouter);
platformRouter.use(platformNotificationsRouter);
platformRouter.use(platformCommsRouter);

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
  await notifyAdmins({ permission: 'businesses:read', exceptAdminId: req.admin!.id, category: 'businesses', priority: 'high', title: `${business.name} was suspended`, message: `${req.admin!.name}: ${reason}`, actionUrl: `/platform/businesses/${id}`, businessId: id, resourceType: 'business', resourceId: id });
  await notifyBusinessOwners({
    businessId: id,
    action: 'PLATFORM_SUSPENDED',
    reason,
    subject: 'Your MIA business has been suspended',
    message: `MIA has suspended ${business.name}. Sign-in and sync are paused until this is resolved. Contact MIA support for help.`,
    template: 'businesses.suspended',
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
  await notifyAdmins({ permission: 'businesses:read', exceptAdminId: req.admin!.id, category: 'businesses', title: `${business.name} was reactivated`, message: `${req.admin!.name}: ${reason}`, actionUrl: `/platform/businesses/${id}`, businessId: id, resourceType: 'business', resourceId: id });
  await notifyBusinessOwners({
    businessId: id,
    action: 'PLATFORM_REACTIVATED',
    reason,
    subject: 'Your MIA business is active again',
    message: `MIA has reactivated ${business.name}. Sign-in and sync work again.`,
    template: 'businesses.reactivated',
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
    if (!user.email) {
      res.status(400).json({ error: 'This user has no email. Issue a temporary PIN from a PIN help request instead.' });
      return;
    }
    await AppDataSource.query(`DELETE FROM pin_reset_codes WHERE user_id = $1`, [id]);
    await issuePinResetCode(user);
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
  await recordPlatformAudit({ req, admin: req.admin, action: definition.action, targetType: 'user', targetId: id, businessId: user.business_id, reason, metadata: { before: { active: user.active, locked_until: user.locked_until }, after: definition.changes(user) } });
  if (user.email && (actionName === 'deactivate' || actionName === 'reactivate')) {
    const business = user.business_id ? await AppDataSource.getRepository(Business).findOne({ where: { id: user.business_id } }) : null;
    void queueTemplateEmail({ template: actionName === 'deactivate' ? 'users.account_deactivated' : 'users.account_activated', to: user.email, businessId: user.business_id, variables: { recipient_name: user.name, organization_name: business?.name ?? 'MIA', reason } });
  }
  res.json({ ok: true });
});

const pinHelpStatusSchema = z.object({
  status: z.enum(['open', 'resolved', 'rejected']).default('open'),
});

platformRouter.get('/pin-help', requirePermission('users:read'), async (req, res) => {
  const { status } = pinHelpStatusSchema.parse(req.query);
  const rows = await q(
    `SELECT r.id, r.identifier, r.name, r.contact_phone, r.message, r.status, r.resolution_note,
            r.created_at, r.updated_at, r.user_id,
            u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.role AS user_role,
            u.active AS user_active, b.name AS business_name
     FROM pin_help_requests r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN businesses b ON b.id = u.business_id
     WHERE r.status = $1
     ORDER BY r.created_at ${status === 'open' ? 'ASC' : 'DESC'}
     LIMIT 200`,
    [status],
  );
  res.json({ rows });
});

platformRouter.post('/pin-help/:id/temporary-pin', requirePermission('users:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { reason } = reasonSchema.parse(req.body);
  const requests = AppDataSource.getRepository(PinHelpRequest);
  const request = await requests.findOne({ where: { id } });
  if (!request || request.status !== 'open') {
    res.status(404).json({ error: 'This request is not open' });
    return;
  }
  const users = AppDataSource.getRepository(User);
  const user = request.user_id ? await users.findOne({ where: { id: request.user_id } }) : null;
  if (!user) {
    res.status(400).json({ error: 'No MIA account matches this request. Close it instead.' });
    return;
  }
  if (!user.active) {
    res.status(400).json({ error: 'Reactivate this user before issuing a temporary PIN.' });
    return;
  }
  const pin = generateTemporaryPin();
  const now = new Date();
  await AppDataSource.transaction(async (manager) => {
    await manager.update(User, { id: user.id }, {
      password_hash: await hashPassword(pin),
      failed_login_attempts: 0,
      locked_until: null,
      must_change_pin: true,
      token_version: (user.token_version ?? 0) + 1,
      updated_at: now,
    });
    await manager.delete('pin_reset_codes', { user_id: user.id });
    await manager.update(PinHelpRequest, { id }, {
      status: 'resolved',
      resolved_by: req.admin!.id,
      resolution_note: reason,
      updated_at: now,
    });
  });
  await recordPlatformAudit({ req, admin: req.admin, action: 'user.temporary_pin_issued', targetType: 'user', targetId: user.id, businessId: user.business_id, reason });
  if (user.business_id && user.role !== 'OWNER') {
    await notifyBusinessOwners({
      businessId: user.business_id,
      action: 'PLATFORM_TEMPORARY_PIN',
      reason,
      subject: 'MIA support reset a team member PIN',
      message: `MIA support gave ${user.name} a temporary PIN after they asked for help. They must choose a new PIN when they sign in.`,
    });
  }
  res.json({ ok: true, pin });
});

platformRouter.post('/pin-help/:id/close', requirePermission('users:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { reason } = reasonSchema.parse(req.body);
  const requests = AppDataSource.getRepository(PinHelpRequest);
  const request = await requests.findOne({ where: { id } });
  if (!request || request.status !== 'open') {
    res.status(404).json({ error: 'This request is not open' });
    return;
  }
  await requests.update(id, { status: 'rejected', resolved_by: req.admin!.id, resolution_note: reason, updated_at: new Date() });
  await recordPlatformAudit({ req, admin: req.admin, action: 'pin_help.closed', targetType: 'pin_help_request', targetId: id, businessId: null, reason });
  res.json({ ok: true });
});

platformRouter.get('/audit', requirePermission('audit:read'), async (req, res) => {
  const page = pageSchema.parse(req.query);
  const win = await listWindow(req, { date: 'a.created_at', action: 'a.action', admin: 'a.admin_email', business: 'b.name', result: 'a.result' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const businessId = typeof req.query.business_id === 'string' && req.query.business_id ? uuidSchema.parse(req.query.business_id) : null;
  const result = z.enum(['all', 'success', 'failed', 'denied']).default('all').parse(req.query.result);
  const params = [searchTerm(page.q), win.from, win.to, businessId, result];
  const where = `($1::text IS NULL OR a.action ILIKE $1 OR a.admin_email ILIKE $1 OR a.target_id ILIKE $1 OR b.name ILIKE $1) AND ${windowWhere('a.created_at', 2)}
    AND ($4::uuid IS NULL OR a.business_id = $4) AND ($5 = 'all' OR a.result = $5)`;
  const from = `FROM platform_audit_logs a LEFT JOIN businesses b ON b.id = a.business_id`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT a.id, a.admin_email, a.action, a.target_type, a.target_id, a.business_id, a.reason, a.metadata, a.ip, a.result, a.hash IS NOT NULL AS sealed, a.created_at, b.name AS business_name
       ${from} WHERE ${where} ORDER BY ${win.orderBy}, a.created_at DESC LIMIT $6 OFFSET $7`,
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
  if (body.status === 'paid') {
    const { emailOwners } = await import('../lib/email');
    await emailOwners(invoice.business_id, 'subscription.payment_received', { amount: `${new Intl.NumberFormat('en-US').format(invoice.amount)} ${invoice.currency}` }, `invoice-paid:${id}`);
    await notifyAdmins({ permission: 'billing:read', exceptAdminId: req.admin!.id, category: 'payments', title: 'Subscription payment recorded', message: `${new Intl.NumberFormat('en-US').format(invoice.amount)} ${invoice.currency}`, actionUrl: `/platform/businesses/${invoice.business_id}/subscriptions`, businessId: invoice.business_id });
  }
  res.json({ ok: true });
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
  const action = z.enum(['deactivate', 'reactivate', 'reset-password', 'set-role']).parse(req.params.action);
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
