import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import { sql } from '../lib/db';
import { Business, BusinessPlatformState, SubscriptionInvoice, SubscriptionPlan, User } from '../entities';
import { generateTemporaryPin } from '../lib/pin';
import { hashPassword } from '../lib/auth';
import { getBusinessState } from '../lib/businessState';
import { stockLevels } from '../lib/businessData';
import { notifyBusinessOwners, recordPlatformAudit, verifyAuditChain } from '../lib/platformAudit';
import { notifyAdmins } from '../lib/notifications';
import { emailOwners, queueTemplateEmail } from '../lib/email';
import { resolveFlags, FEATURE_FLAGS, hasPlatformPermission } from '../lib/rbac';
import {
  addMonths,
  describeSubscription,
  GRACE_PERIOD_DAYS,
  ORG_STATUS_SQL,
  organizationStatus,
  renewalWindow,
  SUB_STATUS_SQL,
} from '../lib/subscription';
import { requirePermission, type PlatformRequest } from '../middleware/platform';
import { listWindow, windowWhere } from './dashboardShared';

export const platformAdminRouter = Router();

const q = sql;
const num = (value: unknown) => Number(value ?? 0);
const uuidSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(5, 'Enter a reason of at least 5 characters').max(500);
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(100).optional(),
});
const BUSINESS_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'STAFF'] as const;
const ASSIGNABLE_ROLES = ['MANAGER', 'CASHIER', 'STAFF'] as const;

function searchTerm(value: string | undefined) {
  return value ? `%${value.replace(/[%_\\]/g, '\\$&')}%` : null;
}

function optionalUuid(value: unknown) {
  return typeof value === 'string' && value ? uuidSchema.parse(value) : null;
}

async function requireBusiness(id: string, res: Response) {
  const business = await AppDataSource.getRepository(Business).findOne({ where: { id } });
  if (!business) res.status(404).json({ error: 'Business not found' });
  return business;
}

const RANGES = {
  '7d': { days: 7, bucket: 'day' },
  '30d': { days: 30, bucket: 'day' },
  '90d': { days: 90, bucket: 'week' },
  '6m': { days: 183, bucket: 'month' },
  '12m': { days: 365, bucket: 'month' },
} as const;
type RangeKey = keyof typeof RANGES;
const rangeSchema = z.enum(Object.keys(RANGES) as [RangeKey, ...RangeKey[]]).default('30d');

function rangeWindow(range: RangeKey, granularity?: 'day' | 'week' | 'month') {
  const { days, bucket } = RANGES[range];
  const now = new Date();
  const start = new Date(now.getTime() - days * 86_400_000);
  const previousStart = new Date(start.getTime() - days * 86_400_000);
  return { now, start, previousStart, bucket: granularity ?? bucket };
}

function bucketSeries(bucket: string, start: Date, now: Date) {
  return `generate_series(date_trunc('${bucket}', $1::timestamptz), date_trunc('${bucket}', $2::timestamptz), interval '1 ${bucket}') d`;
}

function growth(current: number, previous: number, historyComplete: boolean) {
  return historyComplete && previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
}

platformAdminRouter.get('/overview', requirePermission('metrics:read'), async (req, res) => {
  const range = rangeSchema.parse(req.query.range);
  const { now, start, previousStart, bucket } = rangeWindow(range);
  const window = [start, now, previousStart];
  const [[totals], [retention], [earliest], volume, roles, plans, statuses, series] = await Promise.all([
    q(`SELECT
        (SELECT COUNT(*) FROM businesses) AS businesses,
        (SELECT COUNT(*) FROM businesses WHERE created_at >= now() - interval '30 days') AS new_businesses_30d,
        (SELECT COUNT(*) FROM businesses WHERE created_at >= $1) AS new_businesses,
        (SELECT COUNT(*) FROM businesses WHERE created_at >= $3 AND created_at < $1) AS previous_new_businesses,
        (SELECT COUNT(*) FROM businesses WHERE created_at < $1) AS businesses_at_start,
        (SELECT COUNT(*) FROM business_platform_states WHERE status = 'suspended') AS suspended,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM users WHERE active) AS active_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= $1) AS new_users,
        (SELECT COUNT(*) FROM users WHERE created_at < $1) AS users_at_start,
        (SELECT COUNT(DISTINCT user_id) FROM user_login_events WHERE success AND created_at >= $1) AS signed_in_users,
        (SELECT COUNT(DISTINCT business_id) FROM sales WHERE sale_date >= now() - interval '7 days' AND voided = false) AS active_7d,
        (SELECT COUNT(DISTINCT business_id) FROM sales WHERE sale_date >= now() - interval '30 days' AND voided = false) AS active_30d,
        (SELECT COUNT(*) FROM sales WHERE voided = false AND sale_date >= $1 AND sale_date <= $2) AS transactions,
        (SELECT COUNT(*) FROM sales WHERE voided = false AND sale_date >= $3 AND sale_date < $1) AS previous_transactions`, window),
    q(`SELECT COUNT(*) AS eligible,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM sales s WHERE s.business_id = b.id AND s.voided = false AND s.sale_date >= now() - interval '30 days'
              )) AS retained
       FROM businesses b WHERE b.created_at < now() - interval '30 days'`),
    q(`SELECT LEAST((SELECT MIN(created_at) FROM businesses), (SELECT MIN(sale_date) FROM sales)) AS at`),
    q(`SELECT b.currency,
              COUNT(*) FILTER (WHERE s.sale_date >= $1) AS sales,
              COALESCE(SUM(s.total_amount) FILTER (WHERE s.sale_date >= $1), 0) AS total,
              COALESCE(SUM(s.total_amount) FILTER (WHERE s.sale_date >= $3 AND s.sale_date < $1), 0) AS previous_total,
              COUNT(*) FILTER (WHERE s.sale_date >= now() - interval '30 days') AS sales_30d,
              COALESCE(SUM(s.total_amount) FILTER (WHERE s.sale_date >= now() - interval '30 days'), 0) AS total_30d
       FROM sales s JOIN businesses b ON b.id = s.business_id
       WHERE s.voided = false AND s.sale_date >= LEAST($3, now() - interval '30 days') AND s.sale_date <= $2
       GROUP BY b.currency ORDER BY total DESC`, window),
    q(`SELECT COALESCE(role, 'NONE') AS role, COUNT(*) AS count, COUNT(*) FILTER (WHERE active) AS active FROM users GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT COALESCE(st.plan, 'free') AS plan, p.name, COUNT(*) AS count
       FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id
       LEFT JOIN subscription_plans p ON p.code = COALESCE(st.plan, 'free')
       GROUP BY 1, 2 ORDER BY 3 DESC`),
    q(`SELECT ${ORG_STATUS_SQL} AS status, COUNT(*) AS count
       FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id GROUP BY 1`),
    q(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
              (SELECT COUNT(*) FROM businesses b WHERE date_trunc('${bucket}', b.created_at) = d) AS businesses,
              (SELECT COUNT(*) FROM users u WHERE date_trunc('${bucket}', u.created_at) = d) AS users,
              (SELECT COUNT(*) FROM sales s WHERE s.voided = false AND date_trunc('${bucket}', s.sale_date) = d) AS transactions
       FROM ${bucketSeries(bucket, start, now)} ORDER BY d`, [start, now]),
  ]);
  const primary = volume.find((row) => row.currency === 'RWF') ?? volume[0];
  const volumeSeries = primary
    ? await q(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day,
              COALESCE((SELECT SUM(s.total_amount) FROM sales s JOIN businesses b ON b.id = s.business_id
                        WHERE s.voided = false AND b.currency = $3 AND date_trunc('${bucket}', s.sale_date) = d), 0) AS total
       FROM ${bucketSeries(bucket, start, now)} ORDER BY d`, [start, now, primary.currency])
    : [];
  const historyComplete = Boolean(earliest?.at && new Date(earliest.at) <= previousStart);
  const t = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, num(value)]));
  const statusCounts = Object.fromEntries(statuses.map((row) => [row.status, num(row.count)]));
  const paid = plans.filter((row) => row.plan !== 'free').reduce((sum, row) => sum + num(row.count), 0);
  res.json({
    range,
    bucket,
    window: { start, end: now, previous_start: previousStart },
    history_complete: historyComplete,
    totals: t,
    retention: { eligible: num(retention.eligible), retained: num(retention.retained) },
    kpis: {
      businesses: { value: t.businesses, new: t.new_businesses, previous_new: t.previous_new_businesses, growth: growth(t.new_businesses, t.previous_new_businesses, historyComplete) },
      users: { value: t.users, active: t.active_users, inactive: t.users - t.active_users, new: t.new_users, signed_in: t.signed_in_users, growth: growth(t.users, t.users_at_start, historyComplete) },
      sales_volume: primary
        ? { currency: primary.currency, value: num(primary.total), previous: num(primary.previous_total), growth: growth(num(primary.total), num(primary.previous_total), historyComplete) }
        : { currency: 'RWF', value: 0, previous: 0, growth: null },
      transactions: { value: t.transactions, previous: t.previous_transactions, growth: growth(t.transactions, t.previous_transactions, historyComplete) },
    },
    other_currencies: volume.filter((row) => row !== primary).map((row) => ({ currency: row.currency, total: num(row.total), sales: num(row.sales) })),
    volume_30d: volume.map((row) => ({ currency: row.currency, sales: num(row.sales_30d), total: num(row.total_30d) })),
    roles: roles.map((row) => ({ role: row.role, count: num(row.count), active: num(row.active) })),
    plans: plans.map((row) => ({ plan: row.plan, name: row.name ?? null, count: num(row.count) })),
    distribution: {
      free: t.businesses - paid,
      paid,
      active: statusCounts.active ?? 0,
      trial: statusCounts.trial ?? 0,
      expired: statusCounts.expired ?? 0,
      suspended: statusCounts.suspended ?? 0,
    },
    series: series.map((row, index) => ({
      day: row.day,
      businesses: num(row.businesses),
      users: num(row.users),
      transactions: num(row.transactions),
      sales_volume: num(volumeSeries[index]?.total),
    })),
    signups: series.map((row) => ({ day: row.day, count: num(row.businesses) })),
  });
});

async function backupStatus() {
  const dir = path.resolve(process.env.BACKUP_DIR ?? './backups');
  try {
    const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.dump'));
    if (names.length === 0) return { status: 'not_configured' as const, last_backup_at: null, detail: 'No backup files found' };
    const stats = await Promise.all(names.map((name) => fs.stat(path.join(dir, name))));
    const latest = stats.reduce((best, stat) => (stat.mtime > best ? stat.mtime : best), new Date(0));
    const ageHours = (Date.now() - latest.getTime()) / 3_600_000;
    return { status: ageHours <= 26 ? 'operational' as const : 'degraded' as const, last_backup_at: latest, detail: ageHours <= 26 ? 'Backed up in the last day' : 'Last backup is older than a day' };
  } catch {
    return { status: 'not_configured' as const, last_backup_at: null, detail: 'No backup folder on this server' };
  }
}

platformAdminRouter.get('/health', requirePermission('metrics:read'), async (_req, res) => {
  const started = Date.now();
  let database: { status: string; latency_ms: number | null; detail: string };
  try {
    await q('SELECT 1');
    const latency = Date.now() - started;
    database = { status: latency < 500 ? 'operational' : 'degraded', latency_ms: latency, detail: `Responded in ${latency} ms` };
  } catch {
    database = { status: 'down', latency_ms: null, detail: 'Database did not respond' };
  }
  const [sync] = database.status === 'down' ? [null] : await q(`SELECT GREATEST(
      (SELECT MAX(updated_at) FROM sales), (SELECT MAX(updated_at) FROM stock_movements),
      (SELECT MAX(updated_at) FROM payments), (SELECT MAX(updated_at) FROM expenses)) AS last_received,
      (SELECT COUNT(*) FROM sales WHERE updated_at >= now() - interval '24 hours') AS sales_24h`);
  const backups = await backupStatus();
  res.json({
    checked_at: new Date(),
    api: { status: 'operational', uptime_seconds: Math.round(process.uptime()), detail: process.env.NODE_ENV ?? 'development' },
    database,
    sync: {
      status: database.status === 'down' ? 'down' : 'operational',
      last_received_at: sync?.last_received ?? null,
      records_24h: num(sync?.sales_24h),
      detail: 'Accepting uploads. Failures on phones are not reported to the server.',
    },
    backups,
    email: { status: process.env.SMTP_HOST ? 'operational' : 'not_configured', detail: process.env.SMTP_HOST ? 'SMTP configured' : 'PIN reset emails cannot be sent' },
  });
});

const HIDDEN_ACTIONS = `a.action NOT IN ('admin.login', 'admin.login_failed', 'admin.code_sent', 'admin.2fa_failed') AND a.action NOT LIKE 'support.viewed%'`;

platformAdminRouter.get('/activity', requirePermission('metrics:read'), async (req: PlatformRequest, res) => {
  const businessId = optionalUuid(req.query.business_id);
  const limit = z.coerce.number().int().min(1).max(100).default(15).parse(req.query.limit);
  const canAudit = hasPlatformPermission(req.admin!.role, 'audit:read') || hasPlatformPermission(req.admin!.role, 'businesses:read');
  const rows = await q(
    `SELECT * FROM (
       SELECT 'business_registered' AS kind, b.id::text AS ref, b.name AS title, b.business_code AS detail, b.id AS business_id, b.name AS business_name, NULL::bigint AS amount, b.created_at AS at
       FROM businesses b WHERE ($1::uuid IS NULL OR b.id = $1)
       UNION ALL
       SELECT 'user_created', u.id::text, u.name, u.role, u.business_id, b.name, NULL, u.created_at
       FROM users u LEFT JOIN businesses b ON b.id = u.business_id WHERE ($1::uuid IS NULL OR u.business_id = $1)
       UNION ALL
       SELECT 'admin_action', a.id::text, a.action, a.admin_email, a.business_id, b.name, NULL, a.created_at
       FROM platform_audit_logs a LEFT JOIN businesses b ON b.id = a.business_id
       WHERE $3 AND ${HIDDEN_ACTIONS} AND ($1::uuid IS NULL OR a.business_id = $1)
       UNION ALL
       SELECT 'sales_day', to_char(date_trunc('day', s.sale_date), 'YYYY-MM-DD'), COUNT(*)::text, MAX(b.currency), s.business_id, MAX(b.name), SUM(s.total_amount)::bigint, MAX(s.sale_date)
       FROM sales s JOIN businesses b ON b.id = s.business_id
       WHERE $1::uuid IS NOT NULL AND s.business_id = $1 AND s.voided = false AND s.sale_date >= now() - interval '14 days'
       GROUP BY s.business_id, date_trunc('day', s.sale_date)
     ) x ORDER BY at DESC LIMIT $2`,
    [businessId, limit, canAudit],
  );
  res.json({ rows: rows.map((row) => ({ ...row, amount: row.amount === null ? null : num(row.amount) })) });
});

platformAdminRouter.get('/alerts/summary', requirePermission('metrics:read'), async (_req, res) => {
  const [subs, locked, failedLogins, quiet, backups] = await Promise.all([
    q(`SELECT b.id AS business_id, b.name AS business_name, ${SUB_STATUS_SQL} AS status,
              CASE WHEN COALESCE(st.subscription_status, 'trial') = 'trial' THEN COALESCE(st.trial_ends_at, st.current_period_end) ELSE st.current_period_end END AS ends_at
       FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id`),
    q(`SELECT COUNT(*) AS count FROM users WHERE locked_until > now()`),
    q(`SELECT COUNT(*) AS count FROM user_login_events WHERE success = false AND created_at >= now() - interval '24 hours'`),
    q(`SELECT COUNT(*) AS count FROM (SELECT business_id FROM sales GROUP BY business_id HAVING MAX(updated_at) < now() - interval '14 days') x`),
    backupStatus(),
  ]);
  const items: { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; link: string; at: Date | null }[] = [];
  const expired = subs.filter((row) => row.status === 'expired');
  const grace = subs.filter((row) => row.status === 'grace');
  const expiring = subs.filter((row) => row.status === 'expiring_soon');
  if (expired.length) items.push({ id: 'expired', severity: 'critical', title: `${expired.length} ${expired.length === 1 ? 'business has an' : 'businesses have'} expired subscription${expired.length === 1 ? '' : 's'}`, detail: expired.slice(0, 3).map((row) => row.business_name).join(', '), link: '/platform/billing?status=expired', at: null });
  if (grace.length) items.push({ id: 'grace', severity: 'warning', title: `${grace.length} in the ${GRACE_PERIOD_DAYS}-day grace period`, detail: grace.slice(0, 3).map((row) => row.business_name).join(', '), link: '/platform/billing?status=grace', at: null });
  if (expiring.length) items.push({ id: 'expiring', severity: 'info', title: `${expiring.length} expiring within 7 days`, detail: expiring.slice(0, 3).map((row) => row.business_name).join(', '), link: '/platform/billing?status=expiring_soon', at: null });
  if (num(locked[0].count)) items.push({ id: 'locked', severity: 'warning', title: `${num(locked[0].count)} locked user account${num(locked[0].count) === 1 ? '' : 's'}`, detail: 'Too many wrong PINs', link: '/platform/alerts', at: null });
  if (num(failedLogins[0].count) >= 10) items.push({ id: 'logins', severity: 'warning', title: `${num(failedLogins[0].count)} failed sign-ins in 24 hours`, detail: 'Possible suspicious sign-in activity', link: '/platform/alerts', at: null });
  if (num(quiet[0].count)) items.push({ id: 'quiet', severity: 'info', title: `${num(quiet[0].count)} business${num(quiet[0].count) === 1 ? '' : 'es'} stopped syncing`, detail: 'No new sales received for 14 days', link: '/platform/sync', at: null });
  if (backups.status !== 'operational') items.push({ id: 'backups', severity: backups.status === 'degraded' ? 'critical' : 'warning', title: backups.status === 'degraded' ? 'Backups are out of date' : 'Backups are not configured', detail: backups.detail, link: '/platform/data', at: backups.last_backup_at });
  res.json({ count: items.length, items });
});

platformAdminRouter.get('/businesses', requirePermission('businesses:read'), async (req, res) => {
  const page = pageSchema.parse(req.query);
  const status = z.enum(['all', 'active', 'suspended', 'trial', 'expired']).default('all').parse(req.query.status);
  const plan = z.string().trim().max(40).optional().parse(req.query.plan) || null;
  const win = await listWindow(req, { date: 'b.created_at', name: 'b.name', code: 'b.business_code', users: 'users', plan: 'plan', status: 'org_status' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [searchTerm(page.q), status, win.from, win.to, plan];
  const base = `SELECT b.id, b.name, b.business_code, b.currency, b.country, b.created_at, b.contact_email, b.contact_phone, b.address, b.logo_url,
      COALESCE(st.status, 'active') AS status, COALESCE(st.plan, 'free') AS plan, p.name AS plan_name,
      COALESCE(st.subscription_status, 'trial') AS subscription_status, ${SUB_STATUS_SQL} AS subscription_effective,
      ${ORG_STATUS_SQL} AS org_status,
      (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS users,
      (SELECT u.name FROM users u WHERE u.business_id = b.id AND u.role = 'OWNER' ORDER BY u.created_at LIMIT 1) AS owner_name,
      (SELECT u.email FROM users u WHERE u.business_id = b.id AND u.role = 'OWNER' ORDER BY u.created_at LIMIT 1) AS owner_email,
      (SELECT u.phone FROM users u WHERE u.business_id = b.id AND u.role = 'OWNER' ORDER BY u.created_at LIMIT 1) AS owner_phone,
      (SELECT MAX(s.updated_at) FROM sales s WHERE s.business_id = b.id) AS last_sale_sync
    FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id
    LEFT JOIN subscription_plans p ON p.code = COALESCE(st.plan, 'free')`;
  const where = `($1::text IS NULL OR name ILIKE $1 OR business_code ILIKE $1 OR id::text ILIKE $1)
    AND ($2 = 'all' OR org_status = $2) AND ${windowWhere('created_at', 3)} AND ($5::text IS NULL OR plan = $5)`;
  const orderBy = win.orderBy.replace(/^b\./, '');
  const [rows, [count], [summary]] = await Promise.all([
    q(`SELECT * FROM (${base}) x WHERE ${where} ORDER BY ${orderBy}, created_at DESC LIMIT $6 OFFSET $7`, [...params, page.limit, page.offset]),
    q(`SELECT COUNT(*) AS total FROM (${base}) x WHERE ${where}`, params),
    q(`SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE org_status = 'active') AS active,
              COUNT(*) FILTER (WHERE org_status = 'trial') AS trial,
              COUNT(*) FILTER (WHERE org_status = 'expired') AS expired,
              COUNT(*) FILTER (WHERE org_status = 'suspended') AS suspended,
              COUNT(*) FILTER (WHERE plan <> 'free') AS paid,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new_30d,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS previous_new_30d
       FROM (${base}) x`),
  ]);
  res.json({
    total: num(count.total),
    summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, num(value)])),
    rows: rows.map((row) => ({ ...row, users: num(row.users) })),
  });
});

platformAdminRouter.get('/users', requirePermission('users:read'), async (req, res) => {
  const page = pageSchema.parse(req.query);
  const businessId = optionalUuid(req.query.business_id);
  const role = z.enum(['all', ...BUSINESS_ROLES]).default('all').parse(req.query.role);
  const status = z.enum(['all', 'active', 'inactive', 'locked']).default('all').parse(req.query.status);
  const win = await listWindow(req, { date: 'u.created_at', name: 'u.name', email: 'u.email', role: 'u.role', business: 'b.name', last_login: 'u.last_login_at', status: 'u.active' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [searchTerm(page.q), win.from, win.to, businessId, role, status];
  const where = `($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1 OR u.id::text ILIKE $1)
    AND ${windowWhere('u.created_at', 2)} AND ($4::uuid IS NULL OR u.business_id = $4) AND ($5 = 'all' OR u.role = $5)
    AND ($6 = 'all' OR ($6 = 'active' AND u.active AND (u.locked_until IS NULL OR u.locked_until <= now()))
         OR ($6 = 'inactive' AND NOT u.active) OR ($6 = 'locked' AND u.locked_until > now()))`;
  const from = `FROM users u LEFT JOIN businesses b ON b.id = u.business_id`;
  const [rows, [count], [summary], [admins]] = await Promise.all([
    q(`SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.locked_until, u.failed_login_attempts, u.last_login_at,
              u.business_id, u.created_at, b.name AS business_name, b.business_code
       ${from} WHERE ${where} ORDER BY ${win.orderBy}, u.created_at DESC LIMIT $7 OFFSET $8`, [...params, page.limit, page.offset]),
    q(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params),
    q(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE active) AS active, COUNT(*) FILTER (WHERE NOT active) AS inactive,
              COUNT(*) FILTER (WHERE locked_until > now()) AS locked,
              COUNT(*) FILTER (WHERE created_at < now() - interval '30 days') AS total_30d_ago,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new_30d
       FROM users`),
    q(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE role = 'SUPER_ADMIN') AS super_admins, COUNT(*) FILTER (WHERE active) AS active FROM platform_admins`),
  ]);
  res.json({
    total: num(count.total),
    summary: {
      ...Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, num(value)])),
      platform_admins: num(admins.total),
      super_admins: num(admins.super_admins),
    },
    rows,
  });
});

platformAdminRouter.get('/users/:id', requirePermission('users:read'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const [user] = await q(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.locked_until, u.failed_login_attempts, u.last_login_at,
            u.must_change_pin, u.business_id, u.created_at, u.updated_at, b.name AS business_name, b.business_code
     FROM users u LEFT JOIN businesses b ON b.id = u.business_id WHERE u.id = $1`,
    [id],
  );
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const [logins, activity, adminActions] = await Promise.all([
    q(`SELECT id, success, ip, user_agent, created_at FROM user_login_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [id]),
    q(`SELECT id, action, entity, created_at FROM audit_logs WHERE user_id = $1 AND business_id IS NOT DISTINCT FROM $2 ORDER BY created_at DESC LIMIT 20`, [id, user.business_id]),
    q(`SELECT id, action, admin_email, reason, created_at FROM platform_audit_logs WHERE target_type = 'user' AND target_id = $1 ORDER BY created_at DESC LIMIT 20`, [id]),
  ]);
  const { DASHBOARD_PERMISSIONS } = await import('../lib/rbac');
  const permissions = Object.entries(DASHBOARD_PERMISSIONS).filter(([, roles]) => (roles as readonly string[]).includes(user.role ?? '')).map(([key]) => key);
  res.json({ user, logins, activity, admin_actions: adminActions, permissions });
});

platformAdminRouter.post('/users/:id/role', requirePermission('users:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const body = z.object({ role: z.enum(ASSIGNABLE_ROLES), reason: reasonSchema }).parse(req.body);
  const users = AppDataSource.getRepository(User);
  const user = await users.findOne({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.role === 'OWNER') {
    res.status(400).json({ error: 'Owner roles can only be changed by the business itself.', code: 'OWNER_ROLE_LOCKED' });
    return;
  }
  if (user.role === body.role) {
    res.status(400).json({ error: 'This user already has that role.' });
    return;
  }
  await users.update(id, { role: body.role, token_version: (user.token_version ?? 0) + 1, updated_at: new Date() });
  await recordPlatformAudit({ req, admin: req.admin, action: 'user.role_changed', targetType: 'user', targetId: id, businessId: user.business_id, reason: body.reason, metadata: { before: { role: user.role }, after: { role: body.role } } });
  if (user.email) {
    const [org] = user.business_id ? await q(`SELECT name FROM businesses WHERE id = $1`, [user.business_id]) : [];
    void queueTemplateEmail({ template: 'users.role_changed', to: user.email, businessId: user.business_id, variables: { recipient_name: user.name, organization_name: org?.name ?? 'MIA', role: body.role.toLowerCase(), previous_role: (user.role ?? 'none').toLowerCase() } });
  }
  if (user.business_id) {
    await notifyBusinessOwners({
      businessId: user.business_id,
      action: 'PLATFORM_ROLE_CHANGED',
      entityId: id,
      reason: body.reason,
      subject: 'MIA support changed a team member role',
      message: `MIA support changed ${user.name}'s role from ${user.role ?? 'none'} to ${body.role}. They were signed out so the change takes effect.`,
    });
  }
  res.json({ ok: true });
});

platformAdminRouter.patch('/users/:id', requirePermission('users:manage'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const body = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().min(6).max(30).nullable().optional(),
    reason: reasonSchema,
  }).parse(req.body);
  const users = AppDataSource.getRepository(User);
  const user = await users.findOne({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const { reason, ...changes } = body;
  const email = changes.email === undefined ? undefined : changes.email?.toLowerCase() ?? null;
  if (email && email !== user.email && await users.findOne({ where: { email } })) {
    res.status(409).json({ error: 'Another account already uses this email.' });
    return;
  }
  const next = { ...changes, ...(email !== undefined ? { email } : {}) };
  const before = Object.fromEntries(Object.keys(next).map((key) => [key, user[key as keyof User]]));
  await users.update(id, { ...next, updated_at: new Date() });
  await recordPlatformAudit({ req, admin: req.admin, action: 'user.profile_changed', targetType: 'user', targetId: id, businessId: user.business_id, reason, metadata: { before, after: next } });
  if (user.business_id) {
    await notifyBusinessOwners({ businessId: user.business_id, action: 'PLATFORM_USER_EDITED', entityId: id, reason, subject: 'MIA support updated a team member', message: `MIA support updated the contact details for ${user.name}.` });
  }
  res.json({ ok: true });
});

platformAdminRouter.post('/users', requirePermission('users:manage'), async (req: PlatformRequest, res) => {
  const body = z.object({
    business_id: uuidSchema,
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
    phone: z.string().trim().min(6).max(30).optional().or(z.literal('').transform(() => undefined)),
    role: z.enum(ASSIGNABLE_ROLES),
    reason: reasonSchema,
  }).refine((value) => value.email || value.phone, 'Enter an email or a phone number').parse(req.body);
  const business = await requireBusiness(body.business_id, res);
  if (!business) return;
  const users = AppDataSource.getRepository(User);
  const email = body.email?.toLowerCase() ?? null;
  if (email && await users.findOne({ where: { email } })) {
    res.status(409).json({ error: 'Another account already uses this email.' });
    return;
  }
  const pin = generateTemporaryPin();
  const now = new Date();
  const user = await users.save(users.create({
    id: randomUUID(),
    business_id: body.business_id,
    name: body.name,
    email,
    phone: body.phone ?? null,
    password_hash: await hashPassword(pin),
    role: body.role,
    must_change_pin: true,
    active: true,
    created_at: now,
    updated_at: now,
  }));
  await recordPlatformAudit({ req, admin: req.admin, action: 'user.created', targetType: 'user', targetId: user.id, businessId: body.business_id, reason: body.reason, metadata: { after: { name: body.name, role: body.role, email, phone: body.phone ?? null } } });
  await notifyAdmins({ permission: 'users:read', exceptAdminId: req.admin!.id, category: 'users', title: `${body.name} was added to ${business.name}`, message: `${req.admin!.name} added a ${body.role.toLowerCase()} account.`, actionUrl: `/platform/users?user=${user.id}`, businessId: body.business_id, resourceType: 'user', resourceId: user.id });
  if (email) void queueTemplateEmail({ template: 'users.invitation', to: email, businessId: body.business_id, idempotencyKey: `invite:${user.id}`, variables: { recipient_name: body.name, organization_name: business.name, role: body.role.toLowerCase() } });
  await notifyBusinessOwners({ businessId: body.business_id, action: 'PLATFORM_USER_CREATED', entityId: user.id, reason: body.reason, subject: 'MIA support added a team member', message: `MIA support added ${body.name} to ${business.name} as ${body.role}. They must choose a new PIN when they first sign in.` });
  res.status(201).json({ user: { id: user.id, name: user.name, role: user.role }, temporary_pin: pin });
});

platformAdminRouter.get('/businesses/:id', requirePermission('businesses:read'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const business = await AppDataSource.getRepository(Business).findOne({ where: { id } });
  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }
  const canSeeUsers = hasPlatformPermission(req.admin!.role, 'users:read');
  const [state, users, [counts], [balance], [plan]] = await Promise.all([
    getBusinessState(id),
    canSeeUsers ? AppDataSource.getRepository(User).find({ where: { business_id: id }, order: { name: 'ASC' } }) : Promise.resolve([]),
    q(`SELECT (SELECT COUNT(*) FROM products WHERE business_id = $1) AS products,
              (SELECT COUNT(*) FROM customers WHERE business_id = $1) AS customers,
              (SELECT COUNT(*) FROM sales WHERE business_id = $1) AS sales,
              (SELECT COUNT(*) FROM users WHERE business_id = $1) AS users`, [id]),
    q(`SELECT COALESCE(SUM(amount), 0) AS open FROM subscription_invoices WHERE business_id = $1 AND status = 'open'`, [id]),
    q(`SELECT p.* FROM subscription_plans p JOIN business_platform_states st ON st.plan = p.code WHERE st.business_id = $1`, [id]),
  ]);
  const subscription = describeSubscription(state, num(balance.open));
  const owner = users.find((user) => user.role === 'OWNER');
  res.json({
    business,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone } : null,
    org_status: organizationStatus(state?.status, subscription),
    state: {
      status: state?.status ?? 'active',
      suspended_reason: state?.suspended_reason ?? null,
      suspended_at: state?.suspended_at ?? null,
      plan: state?.plan ?? 'free',
      subscription_status: state?.subscription_status ?? 'trial',
      trial_ends_at: state?.trial_ends_at ?? null,
      current_period_end: state?.current_period_end ?? null,
    },
    subscription: { ...subscription, plan_name: plan?.name ?? null },
    flags: resolveFlags(state?.feature_flags),
    flag_definitions: FEATURE_FLAGS,
    counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, num(value)])),
    users: users.map((user) => ({
      id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, active: user.active,
      locked_until: user.locked_until, failed_login_attempts: user.failed_login_attempts, last_login_at: user.last_login_at, created_at: user.created_at,
    })),
  });
});

platformAdminRouter.get('/businesses/:id/stats', requirePermission('businesses:read'), async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const range = rangeSchema.parse(req.query.range);
  const granularity = z.enum(['day', 'week', 'month']).optional().parse(req.query.granularity || undefined);
  const business = await requireBusiness(id, res);
  if (!business) return;
  const { now, start, previousStart, bucket } = rangeWindow(range, granularity);
  const params = [id, start, now, previousStart];
  const [[k], roles, trend, [sync], stock] = await Promise.all([
    q(`SELECT
        (SELECT COUNT(*) FROM users WHERE business_id = $1) AS users,
        (SELECT COUNT(*) FROM users WHERE business_id = $1 AND active) AS active_users,
        (SELECT COUNT(DISTINCT user_id) FROM user_login_events WHERE business_id = $1 AND success AND created_at >= now() - interval '30 days') AS signed_in_30d,
        (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= date_trunc('month', now() AT TIME ZONE $5) AT TIME ZONE $5) AS sales_month_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= date_trunc('month', now() AT TIME ZONE $5) AT TIME ZONE $5) AS sales_month_total,
        (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= date_trunc('month', now() AT TIME ZONE $5) AT TIME ZONE $5 - interval '1 month'
                                    AND sale_date < date_trunc('month', now() AT TIME ZONE $5) AT TIME ZONE $5) AS sales_prev_month_count,
        (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= $2 AND sale_date <= $3) AS range_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= $2 AND sale_date <= $3) AS range_total,
        (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= $4 AND sale_date < $2) AS previous_total,
        (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= $4 AND sale_date < $2) AS previous_count,
        (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND voided = false) AS transactions,
        (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND voided) AS voided,
        (SELECT COALESCE(SUM(total_amount), 0) FROM purchases WHERE business_id = $1 AND status <> 'cancelled' AND purchase_date >= $2 AND purchase_date <= $3) AS purchases_total,
        (SELECT COUNT(*) FROM purchases WHERE business_id = $1 AND status <> 'cancelled' AND purchase_date >= $2 AND purchase_date <= $3) AS purchases_count,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE business_id = $1 AND expense_date >= $2 AND expense_date <= $3) AS expenses_total,
        (SELECT COUNT(*) FROM expenses WHERE business_id = $1 AND expense_date >= $2 AND expense_date <= $3) AS expenses_count,
        (SELECT COUNT(*) FROM products WHERE business_id = $1 AND active) AS products,
        (SELECT COUNT(*) FROM customers WHERE business_id = $1) AS customers,
        (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND voided = false AND payment_status <> 'paid') AS unpaid_count,
        (SELECT COALESCE(SUM(total_amount - paid_amount), 0) FROM sales WHERE business_id = $1 AND voided = false AND payment_status <> 'paid') AS unpaid_total,
        (SELECT MIN(sale_date) FROM sales WHERE business_id = $1) AS first_sale`, [...params, business.timezone || 'Africa/Kigali']),
    q(`SELECT COALESCE(role, 'NONE') AS role, COUNT(*) AS count, COUNT(*) FILTER (WHERE active) AS active FROM users WHERE business_id = $1 GROUP BY 1 ORDER BY 2 DESC`, [id]),
    q(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
              COALESCE((SELECT SUM(total_amount) FROM sales s WHERE s.business_id = $3 AND s.voided = false AND date_trunc('${bucket}', s.sale_date) = d), 0) AS total,
              (SELECT COUNT(*) FROM sales s WHERE s.business_id = $3 AND s.voided = false AND date_trunc('${bucket}', s.sale_date) = d) AS count
       FROM ${bucketSeries(bucket, start, now)} ORDER BY d`, [start, now, id]),
    q(`SELECT GREATEST(
          (SELECT MAX(updated_at) FROM sales WHERE business_id = $1), (SELECT MAX(updated_at) FROM stock_movements WHERE business_id = $1),
          (SELECT MAX(updated_at) FROM payments WHERE business_id = $1), (SELECT MAX(updated_at) FROM expenses WHERE business_id = $1)) AS last_received,
        (SELECT COUNT(DISTINCT device_id) FROM sales WHERE business_id = $1 AND updated_at >= now() - interval '30 days') AS devices_30d,
        (SELECT COUNT(*) FROM sales WHERE business_id = $1 AND updated_at >= now() - interval '24 hours') AS records_24h`, [id]),
    stockLevels(id),
  ]);
  const kpi = Object.fromEntries(Object.entries(k).map(([key, value]) => [key, key === 'first_sale' ? value : num(value)])) as Record<string, number> & { first_sale: string | null };
  const historyComplete = Boolean(kpi.first_sale && new Date(kpi.first_sale) <= previousStart) || (Boolean(kpi.first_sale) && new Date(business.created_at) <= previousStart);
  const lowStock = stock.filter((item) => item.active && item.track_inventory && item.stock <= item.reorder_level);
  res.json({
    range,
    bucket,
    currency: business.currency,
    history_complete: historyComplete,
    kpis: {
      ...kpi,
      sales_growth: growth(kpi.range_total, kpi.previous_total, historyComplete),
      count_growth: growth(kpi.range_count, kpi.previous_count, historyComplete),
      month_growth: growth(kpi.sales_month_count, kpi.sales_prev_month_count, Boolean(kpi.first_sale) && new Date(business.created_at) < new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      low_stock: lowStock.length,
      inventory_items: stock.filter((item) => item.active).length,
    },
    roles: roles.map((row) => ({ role: row.role, count: num(row.count), active: num(row.active) })),
    trend: trend.map((row) => ({ day: row.day, total: num(row.total), count: num(row.count) })),
    sync: {
      last_received_at: sync?.last_received ?? null,
      devices_30d: num(sync?.devices_30d),
      records_24h: num(sync?.records_24h),
      pending: null,
      failed: null,
      app_version: null,
      database: 'operational',
    },
  });
});

platformAdminRouter.patch('/businesses/:id/profile', requirePermission('support:access'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const body = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    address: z.string().trim().max(200).nullable().optional(),
    contact_email: z.string().trim().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
    contact_phone: z.string().trim().max(30).nullable().optional(),
    logo_url: z.string().trim().url().max(500).refine((value) => value.startsWith('https://'), 'Use an https:// logo link').nullable().optional().or(z.literal('').transform(() => null)),
    reason: reasonSchema,
  }).parse(req.body);
  const business = await requireBusiness(id, res);
  if (!business) return;
  const { activeGrant } = await import('./platformSupport');
  const grant = await activeGrant(req.admin!.id, id, 3);
  if (!grant) {
    await recordPlatformAudit({ req, admin: req.admin, action: 'business.profile_change_denied', targetType: 'business', targetId: id, businessId: id, reason: body.reason, result: 'denied' });
    res.status(403).json({ error: 'Start a Level 3 (administrative) support session for this business first.', code: 'NO_ACTIVE_GRANT' });
    return;
  }
  const { reason, ...changes } = body;
  const keys = Object.keys(changes) as (keyof typeof changes)[];
  if (keys.length === 0) {
    res.status(400).json({ error: 'Nothing to change' });
    return;
  }
  const before = Object.fromEntries(keys.map((key) => [key, business[key]]));
  await AppDataSource.getRepository(Business).update(id, changes);
  await recordPlatformAudit({ req, admin: req.admin, action: 'business.profile_changed', targetType: 'business', targetId: id, businessId: id, reason, metadata: { before, after: changes, grant_id: grant.id } });
  await notifyBusinessOwners({ businessId: id, action: 'PLATFORM_PROFILE_CHANGED', reason, subject: 'MIA support updated your business profile', message: `Changed: ${keys.join(', ')}.`, template: 'businesses.profile_updated' });
  res.json({ ok: true });
});

platformAdminRouter.get('/plans', requirePermission('businesses:read'), async (_req, res) => {
  const rows = await q(
    `SELECT p.code, p.name, p.description, p.monthly_price, p.currency, p.active, p.updated_at,
            (SELECT COUNT(*) FROM business_platform_states st WHERE st.plan = p.code) AS businesses
     FROM subscription_plans p ORDER BY p.monthly_price, p.name`,
  );
  const [{ unlisted }] = await q(`SELECT COUNT(*) AS unlisted FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id
    WHERE COALESCE(st.plan, 'free') NOT IN (SELECT code FROM subscription_plans)`);
  const inUse = await q(`SELECT DISTINCT COALESCE(st.plan, 'free') AS plan FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id`);
  res.json({ rows: rows.map((row) => ({ ...row, monthly_price: num(row.monthly_price), businesses: num(row.businesses) })), unlisted: num(unlisted), in_use: inUse.map((row) => row.plan) });
});

const planBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  monthly_price: z.number().int().min(0).max(100_000_000),
  active: z.boolean().optional(),
  reason: reasonSchema,
});

platformAdminRouter.post('/plans', requirePermission('billing:write'), async (req: PlatformRequest, res) => {
  const body = planBody.extend({ code: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,40}$/, 'Use 2-40 lowercase letters, numbers, - or _') }).parse(req.body);
  const repo = AppDataSource.getRepository(SubscriptionPlan);
  if (await repo.findOne({ where: { code: body.code } })) {
    res.status(409).json({ error: 'A plan with this code already exists' });
    return;
  }
  const duplicateName = await q(`SELECT 1 FROM subscription_plans WHERE lower(name) = lower($1)`, [body.name]);
  if (duplicateName.length) {
    res.status(409).json({ error: 'A plan with this name already exists' });
    return;
  }
  const now = new Date();
  await repo.insert({ code: body.code, name: body.name, description: body.description ?? null, monthly_price: body.monthly_price, currency: 'RWF', active: body.active ?? true, created_at: now, updated_at: now });
  await recordPlatformAudit({ req, admin: req.admin, action: 'billing.plan_created', targetType: 'plan', targetId: body.code, reason: body.reason, metadata: { after: { name: body.name, monthly_price: body.monthly_price } } });
  res.status(201).json({ ok: true });
});

platformAdminRouter.patch('/plans/:code', requirePermission('billing:write'), async (req: PlatformRequest, res) => {
  const code = z.string().trim().min(1).max(40).parse(req.params.code);
  const body = planBody.partial().extend({ reason: reasonSchema }).parse(req.body);
  const repo = AppDataSource.getRepository(SubscriptionPlan);
  const plan = await repo.findOne({ where: { code } });
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }
  const { reason, ...changes } = body;
  const before = Object.fromEntries(Object.keys(changes).map((key) => [key, plan[key as keyof SubscriptionPlan]]));
  await repo.update(code, { ...changes, updated_at: new Date() });
  await recordPlatformAudit({ req, admin: req.admin, action: 'billing.plan_changed', targetType: 'plan', targetId: code, reason, metadata: { before, after: changes } });
  res.json({ ok: true });
});

platformAdminRouter.get('/billing', requirePermission('billing:read'), async (req, res) => {
  const page = pageSchema.parse(req.query);
  const status = z.enum(['all', 'trial', 'active', 'expiring_soon', 'grace', 'expired', 'pending_payment', 'suspended', 'cancelled']).default('all').parse(req.query.status);
  const plan = z.string().trim().max(40).optional().parse(req.query.plan) || null;
  const expiresWithin = z.coerce.number().int().min(1).max(366).optional().parse(req.query.expires_within || undefined) ?? null;
  const win = await listWindow(req, { name: 'name', paid_until: 'ends_at', expiry: 'ends_at', start: 'subscription_started_at', amount: 'plan_amount', balance: 'open_balance', plan: 'plan', status: 'effective_status', date: 'created_at' }, 'name', 'asc');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const base = `SELECT b.id, b.name, b.business_code, b.currency, b.created_at, COALESCE(st.plan, 'free') AS plan, p.name AS plan_name, p.monthly_price,
      COALESCE(st.subscription_status, 'trial') AS subscription_status, ${SUB_STATUS_SQL} AS effective_status,
      st.trial_ends_at, st.current_period_end, st.billing_period, st.plan_amount, st.subscription_started_at,
      CASE WHEN COALESCE(st.subscription_status, 'trial') = 'trial' THEN COALESCE(st.trial_ends_at, st.current_period_end) ELSE st.current_period_end END AS ends_at,
      (SELECT COALESCE(SUM(amount), 0) FROM subscription_invoices i WHERE i.business_id = b.id AND i.status = 'open') AS open_balance
    FROM businesses b LEFT JOIN business_platform_states st ON st.business_id = b.id
    LEFT JOIN subscription_plans p ON p.code = COALESCE(st.plan, 'free')`;
  const params = [searchTerm(page.q), win.from, win.to, status, plan, expiresWithin];
  const where = `($1::text IS NULL OR name ILIKE $1 OR business_code ILIKE $1) AND ${windowWhere('ends_at', 2)}
    AND ($4 = 'all' OR effective_status = $4) AND ($5::text IS NULL OR plan = $5)
    AND ($6::int IS NULL OR (ends_at >= now() AND ends_at < now() + make_interval(days => $6::int)))`;
  const [rows, [count], [summary]] = await Promise.all([
    q(`SELECT * FROM (${base}) x WHERE ${where} ORDER BY ${win.orderBy}, name LIMIT $7 OFFSET $8`, [...params, page.limit, page.offset]),
    q(`SELECT COUNT(*) AS total FROM (${base}) x WHERE ${where}`, params),
    q(`SELECT
         COUNT(*) FILTER (WHERE effective_status IN ('active', 'expiring_soon', 'pending_payment')) AS active,
         COUNT(*) FILTER (WHERE effective_status = 'expiring_soon') AS expiring_soon,
         COUNT(*) FILTER (WHERE effective_status = 'grace') AS grace,
         COUNT(*) FILTER (WHERE effective_status = 'expired') AS expired,
         COUNT(*) FILTER (WHERE effective_status = 'trial') AS trial,
         COUNT(*) FILTER (WHERE effective_status IN ('suspended', 'cancelled')) AS suspended,
         COUNT(*) FILTER (WHERE ends_at >= now() AND ends_at < now() + interval '7 days') AS expiring_7d,
         (SELECT COUNT(*) FROM subscription_invoices WHERE status = 'open') AS open_invoices,
         (SELECT COALESCE(SUM(amount), 0) FROM subscription_invoices WHERE status = 'open') AS open_amount,
         (SELECT COALESCE(SUM(amount), 0) FROM subscription_invoices WHERE status = 'paid' AND paid_at >= now() - interval '30 days') AS paid_30d,
         (SELECT COALESCE(SUM(amount), 0) FROM subscription_invoices WHERE status = 'paid' AND paid_at >= now() - interval '60 days' AND paid_at < now() - interval '30 days') AS paid_prev_30d,
         (SELECT COUNT(*) FROM subscription_invoices WHERE status = 'paid') AS paid_invoices
       FROM (${base}) x`),
  ]);
  res.json({
    total: num(count.total),
    grace_period_days: GRACE_PERIOD_DAYS,
    summary: { ...Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, num(value)])), pending_payments: num(summary.open_invoices), paid_30d: num(summary.paid_30d) },
    rows: rows.map((row) => ({ ...row, open_balance: num(row.open_balance), plan_amount: row.plan_amount === null ? null : num(row.plan_amount), monthly_price: row.monthly_price === null ? null : num(row.monthly_price) })),
  });
});

platformAdminRouter.get('/billing/trend', requirePermission('billing:read'), async (req, res) => {
  const range = z.enum(['30d', '90d', '6m', '12m']).default('6m').parse(req.query.range);
  const { now, start, bucket } = rangeWindow(range, range === '30d' ? 'day' : range === '90d' ? 'week' : 'month');
  const rows = await q(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            (SELECT COUNT(*) FROM platform_audit_logs a WHERE a.action IN ('subscription.started', 'subscription.plan_changed') AND date_trunc('${bucket}', a.created_at) = d) AS registrations,
            (SELECT COUNT(*) FROM platform_audit_logs a WHERE a.action = 'subscription.renewed' AND date_trunc('${bucket}', a.created_at) = d) AS renewals,
            (SELECT COUNT(*) FROM business_platform_states st
              WHERE COALESCE(st.subscription_status, 'trial') NOT IN ('suspended', 'cancelled')
                AND date_trunc('${bucket}', CASE WHEN st.subscription_status = 'trial' THEN COALESCE(st.trial_ends_at, st.current_period_end) ELSE st.current_period_end END + interval '${GRACE_PERIOD_DAYS} days') = d
                AND (CASE WHEN st.subscription_status = 'trial' THEN COALESCE(st.trial_ends_at, st.current_period_end) ELSE st.current_period_end END) + interval '${GRACE_PERIOD_DAYS} days' <= now()) AS expirations,
            (SELECT COALESCE(SUM(amount), 0) FROM subscription_invoices i WHERE i.status = 'paid' AND date_trunc('${bucket}', i.paid_at) = d) AS revenue
     FROM ${bucketSeries(bucket, start, now)} ORDER BY d`,
    [start, now],
  );
  res.json({ range, bucket, rows: rows.map((row) => ({ day: row.day, registrations: num(row.registrations), renewals: num(row.renewals), expirations: num(row.expirations), revenue: num(row.revenue) })) });
});

platformAdminRouter.get('/businesses/:id/subscription', requirePermission('billing:read'), async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const business = await requireBusiness(id, res);
  if (!business) return;
  const [state, invoices, history] = await Promise.all([
    getBusinessState(id),
    AppDataSource.getRepository(SubscriptionInvoice).find({ where: { business_id: id }, order: { created_at: 'DESC' }, take: 100 }),
    q(`SELECT id, action, admin_email, reason, metadata, created_at FROM platform_audit_logs
       WHERE business_id = $1 AND (action LIKE 'subscription.%' OR action LIKE 'billing.%') ORDER BY created_at DESC LIMIT 100`, [id]),
  ]);
  const openBalance = invoices.filter((invoice) => invoice.status === 'open').reduce((sum, invoice) => sum + invoice.amount, 0);
  const [plan] = state?.plan ? await q(`SELECT * FROM subscription_plans WHERE code = $1`, [state.plan]) : [];
  res.json({
    business: { id: business.id, name: business.name, currency: business.currency },
    subscription: { ...describeSubscription(state, openBalance), plan_name: plan?.name ?? null, plan_monthly_price: plan ? num(plan.monthly_price) : null },
    invoices,
    history,
  });
});

const subscriptionActions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('renew'), months: z.number().int().min(1).max(36), amount: z.number().int().min(0).optional(), reason: reasonSchema }),
  z.object({ action: z.literal('change-plan'), plan: z.string().trim().min(2).max(40), months: z.number().int().min(1).max(36).optional(), amount: z.number().int().min(0).optional(), reason: reasonSchema }),
  z.object({ action: z.literal('extend'), days: z.number().int().min(1).max(365), reason: reasonSchema }),
  z.object({ action: z.literal('suspend'), reason: reasonSchema }),
  z.object({ action: z.literal('reactivate'), reason: reasonSchema }),
]);

function snapshot(state: BusinessPlatformState | null) {
  return {
    plan: state?.plan ?? 'free',
    subscription_status: state?.subscription_status ?? 'trial',
    current_period_end: state?.current_period_end ?? null,
    trial_ends_at: state?.trial_ends_at ?? null,
    billing_period: state?.billing_period ?? null,
    plan_amount: state?.plan_amount ?? null,
  };
}

platformAdminRouter.post('/businesses/:id/subscription', requirePermission('billing:write'), async (req: PlatformRequest, res) => {
  const id = uuidSchema.parse(req.params.id);
  const body = subscriptionActions.parse(req.body);
  const business = await requireBusiness(id, res);
  if (!business) return;
  const state = await getBusinessState(id);
  const before = snapshot(state);
  const now = new Date();
  let changes: Partial<BusinessPlatformState> = {};
  let action = '';
  let invoiceAmount: number | null = null;
  let window: { start: Date; end: Date } | null = null;

  if (body.action === 'renew' || body.action === 'change-plan') {
    const planCode = body.action === 'change-plan' ? body.plan : state?.plan ?? 'free';
    const [plan] = planCode === 'free' ? [null] : await q(`SELECT * FROM subscription_plans WHERE code = $1`, [planCode]);
    if (planCode !== 'free' && (!plan || !plan.active)) {
      res.status(400).json({ error: 'Choose an active plan from the plan catalog.' });
      return;
    }
    if (body.action === 'renew' && planCode === 'free') {
      res.status(400).json({ error: 'Free plans do not renew. Change the plan first.' });
      return;
    }
    const months = body.months ?? (body.action === 'change-plan' && planCode !== 'free' ? 1 : null);
    if (months) {
      window = body.action === 'renew' ? renewalWindow(state, months, now) : { start: now, end: addMonths(now, months) };
      const listPrice = plan ? num(plan.monthly_price) * months : 0;
      invoiceAmount = body.amount ?? listPrice;
      changes = {
        plan: planCode,
        subscription_status: 'active',
        current_period_end: window.end,
        subscription_started_at: body.action === 'renew' && state?.subscription_started_at && renewalWindow(state, months, now).continues ? state.subscription_started_at : window.start,
        billing_period: months === 12 ? 'yearly' : 'monthly',
        plan_amount: invoiceAmount,
      };
    } else {
      changes = { plan: planCode, subscription_status: 'trial', billing_period: null, plan_amount: 0 };
    }
    action = body.action === 'renew' ? 'subscription.renewed' : (before.plan === 'free' && planCode !== 'free' ? 'subscription.started' : 'subscription.plan_changed');
  } else if (body.action === 'extend') {
    const field = (state?.subscription_status ?? 'trial') === 'trial' ? 'trial_ends_at' : 'current_period_end';
    const currentEnd = state?.[field] ?? (field === 'trial_ends_at' ? state?.current_period_end : null) ?? null;
    const base = currentEnd && new Date(currentEnd) > now ? new Date(currentEnd) : now;
    changes = { [field]: new Date(base.getTime() + body.days * 86_400_000) };
    action = 'subscription.extended';
  } else if (body.action === 'suspend') {
    if (state?.subscription_status === 'suspended') {
      res.status(409).json({ error: 'This subscription is already suspended.' });
      return;
    }
    changes = { subscription_status: 'suspended' };
    action = 'subscription.suspended';
  } else {
    if (state?.subscription_status !== 'suspended' && state?.subscription_status !== 'cancelled') {
      res.status(409).json({ error: 'Only suspended or cancelled subscriptions can be reactivated.' });
      return;
    }
    changes = { subscription_status: state?.plan && state.plan !== 'free' ? 'active' : 'trial' };
    action = 'subscription.reactivated';
  }

  await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(BusinessPlatformState);
    const existing = await repo.findOne({ where: { business_id: id } });
    await repo.save(repo.merge(existing ?? repo.create({ business_id: id, status: 'active', plan: 'free', subscription_status: 'trial', feature_flags: {} }), { ...changes, updated_at: now }));
    if (invoiceAmount && invoiceAmount > 0 && window) {
      await manager.getRepository(SubscriptionInvoice).insert({
        id: randomUUID(),
        business_id: id,
        amount: invoiceAmount,
        currency: business.currency,
        period_start: window.start.toISOString().slice(0, 10),
        period_end: window.end.toISOString().slice(0, 10),
        status: 'open',
        created_by: req.admin!.id,
        created_at: now,
      });
    }
  });
  const after = snapshot(await getBusinessState(id));
  await recordPlatformAudit({ req, admin: req.admin, action, targetType: 'business', targetId: id, businessId: id, reason: body.reason, metadata: { before, after, invoice_amount: invoiceAmount } });
  await notifyAdmins({
    permission: 'billing:read',
    exceptAdminId: req.admin!.id,
    category: 'subscriptions',
    priority: action === 'subscription.suspended' ? 'high' : 'normal',
    title: `${business.name}: ${action.replace('subscription.', 'subscription ').replace('_', ' ')}`,
    message: `${req.admin!.name} · plan ${after.plan}${after.current_period_end ? ` · until ${new Date(after.current_period_end).toISOString().slice(0, 10)}` : ''}`,
    actionUrl: `/platform/businesses/${id}/subscriptions`,
    businessId: id,
    resourceType: 'business',
    resourceId: id,
  });
  const planName = async (code: string) => code === 'free' ? 'Free' : ((await q(`SELECT name FROM subscription_plans WHERE code = $1`, [code]))[0]?.name ?? code);
  const priceOf = async (code: string) => code === 'free' ? 0 : num((await q(`SELECT monthly_price FROM subscription_plans WHERE code = $1`, [code]))[0]?.monthly_price);
  const emailTemplate = action === 'subscription.started' ? 'subscription.activated'
    : action === 'subscription.renewed' ? 'subscription.renewed'
      : action === 'subscription.plan_changed' ? ((await priceOf(after.plan)) >= (await priceOf(before.plan)) ? 'subscription.upgraded' : 'subscription.downgraded')
        : action === 'subscription.suspended' ? 'subscription.deactivated'
          : action === 'subscription.reactivated' ? 'subscription.reactivated' : null;
  const expiry = after.current_period_end ?? after.trial_ends_at;
  if (emailTemplate) {
    await emailOwners(id, emailTemplate, {
      subscription_plan: await planName(after.plan),
      previous_plan: await planName(before.plan),
      subscription_expiry: expiry ? new Date(expiry).toISOString().slice(0, 10) : 'no end date',
      amount: invoiceAmount ? `${new Intl.NumberFormat('en-US').format(invoiceAmount)} ${business.currency}` : 'No charge',
      reason: body.reason,
    });
  } else if (action === 'subscription.extended') {
    await emailOwners(id, 'businesses.notice', { title: 'Your MIA subscription was extended', message: `Your subscription now runs until ${expiry ? new Date(expiry).toISOString().slice(0, 10) : 'further notice'}.`, reason: body.reason });
  }
  if (action === 'subscription.suspended' || action === 'subscription.reactivated') {
    await notifyBusinessOwners({
      template: 'none',
      businessId: id,
      action: action === 'subscription.suspended' ? 'PLATFORM_SUBSCRIPTION_SUSPENDED' : 'PLATFORM_SUBSCRIPTION_REACTIVATED',
      reason: body.reason,
      subject: action === 'subscription.suspended' ? 'Your MIA subscription was suspended' : 'Your MIA subscription is active again',
      message: `MIA ${action === 'subscription.suspended' ? 'suspended' : 'reactivated'} the subscription for ${business.name}.`,
    });
  }
  res.json({ ok: true, subscription: describeSubscription(await getBusinessState(id)) });
});

platformAdminRouter.get('/audit/verify', requirePermission('audit:read'), async (req: PlatformRequest, res) => {
  const result = await verifyAuditChain();
  await recordPlatformAudit({ req, admin: req.admin, action: 'audit.verified', metadata: result });
  res.json(result);
});
