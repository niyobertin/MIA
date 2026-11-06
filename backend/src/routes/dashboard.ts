import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import { Announcement, Business, BusinessPlatformState, SupportAccessGrant, User } from '../entities';
import { AuthedRequest, requireActiveUser, requireAuth } from '../middleware/auth';
import { buildOverview, stockLevels, type Period } from '../lib/businessData';
import {
  dashboardPermissionsFor,
  hasDashboardPermission,
  resolveFlags,
  type DashboardPermission,
} from '../lib/rbac';

export const dashboardRouter = Router();

const q = (sql: string, params: unknown[] = []) => AppDataSource.query(sql, params) as Promise<any[]>;
const num = (value: unknown) => Number(value ?? 0);

type DashboardRequest = AuthedRequest & { business?: Business; flags?: Record<string, boolean> };

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(100).optional(),
});
const periodSchema = z.enum(['today', 'yesterday', '7d', '30d', '90d']).default('7d');

function can(permission: DashboardPermission) {
  return (req: DashboardRequest, res: Response, next: NextFunction) => {
    if (!hasDashboardPermission(req.member?.role, permission)) {
      res.status(403).json({ error: 'Your role does not have access to this', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

function searchTerm(value: string | undefined) {
  return value ? `%${value.replace(/[%_\\]/g, '\\$&')}%` : null;
}

function bizId(req: DashboardRequest) {
  return req.member!.business_id as string;
}

dashboardRouter.use(requireAuth, requireActiveUser, async (req: DashboardRequest, res, next) => {
  const member = req.member!;
  if (!member.business_id) {
    res.status(403).json({ error: 'This account is not linked to a business yet.', code: 'NO_BUSINESS' });
    return;
  }
  const business = await AppDataSource.getRepository(Business).findOne({ where: { id: member.business_id } });
  if (!business) {
    res.status(403).json({ error: 'Business not found', code: 'NO_BUSINESS' });
    return;
  }
  const state = await AppDataSource.getRepository(BusinessPlatformState).findOne({ where: { business_id: business.id } });
  const flags = resolveFlags(state?.feature_flags);
  if (!flags.web_dashboard) {
    res.status(403).json({ error: 'The web dashboard is turned off for this business.', code: 'FEATURE_DISABLED' });
    return;
  }
  req.business = business;
  req.flags = flags;
  next();
});

dashboardRouter.get('/me', async (req: DashboardRequest, res) => {
  const member = req.member!;
  const now = new Date();
  const announcements = await AppDataSource.getRepository(Announcement)
    .createQueryBuilder('a')
    .where('a.active = true AND a.starts_at <= :now AND (a.ends_at IS NULL OR a.ends_at > :now)', { now })
    .andWhere('(a.business_id IS NULL OR a.business_id = :business)', { business: member.business_id })
    .orderBy('a.starts_at', 'DESC')
    .getMany();
  res.json({
    user: { id: member.id, name: member.name, email: member.email, role: member.role },
    business: req.business,
    permissions: dashboardPermissionsFor(member.role),
    flags: req.flags,
    announcements: announcements.map(({ id, title, body, severity }) => ({ id, title, body, severity })),
  });
});

dashboardRouter.get('/overview', can('overview'), async (req: DashboardRequest, res) => {
  const period = periodSchema.parse(req.query.period) as Period;
  res.json(await buildOverview(bizId(req), req.business!.timezone, period));
});

dashboardRouter.get('/sales', can('sales'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const status = z.enum(['all', 'unpaid']).default('all').parse(req.query.status);
  const ownOnly = !hasDashboardPermission(req.member!.role, 'salesAll');
  const params: unknown[] = [bizId(req), status, ownOnly ? req.member!.id : null, searchTerm(page.q)];
  const where = `s.business_id = $1
    AND ($2 = 'all' OR (s.voided = false AND s.total_amount > s.paid_amount))
    AND ($3::text IS NULL OR s.created_by::text = $3)
    AND ($4::text IS NULL OR s.reference_number ILIKE $4 OR c.name ILIKE $4)`;
  const from = `FROM sales s LEFT JOIN customers c ON c.id = s.customer_id AND c.business_id = s.business_id
                LEFT JOIN users u ON u.id = s.created_by`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT s.id, s.reference_number, s.total_amount, s.paid_amount, s.payment_status, s.voided, s.sale_date,
              c.name AS customer, u.name AS cashier
       ${from} WHERE ${where} ORDER BY s.sale_date DESC LIMIT $5 OFFSET $6`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, total_amount: num(row.total_amount), paid_amount: num(row.paid_amount) })),
  });
});

dashboardRouter.get('/payments', can('payments'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const ownOnly = !hasDashboardPermission(req.member!.role, 'paymentsAll');
  const params = [bizId(req), ownOnly ? req.member!.id : null];
  const where = `p.business_id = $1 AND ($2::text IS NULL OR p.created_by::text = $2)`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT p.id, p.type, p.payment_method, p.amount, p.payment_date, p.notes, u.name AS recorded_by
       FROM payments p LEFT JOIN users u ON u.id = p.created_by
       WHERE ${where} ORDER BY p.payment_date DESC LIMIT $3 OFFSET $4`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM payments p WHERE ${where}`, params),
  ]);
  res.json({ total: num(count.total), rows: rows.map((row) => ({ ...row, amount: num(row.amount) })) });
});

dashboardRouter.get('/customers', can('customers'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const params = [bizId(req), searchTerm(page.q)];
  const where = `c.business_id = $1 AND ($2::text IS NULL OR c.name ILIKE $2 OR c.phone ILIKE $2)`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT c.id, c.name, c.phone, c.email, c.credit_limit, c.active,
              COALESCE((SELECT SUM(s.total_amount - s.paid_amount) FROM sales s
                        WHERE s.customer_id = c.id AND s.business_id = c.business_id
                          AND s.voided = false AND s.total_amount > s.paid_amount), 0) AS balance
       FROM customers c WHERE ${where} ORDER BY c.name LIMIT $3 OFFSET $4`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM customers c WHERE ${where}`, params),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, credit_limit: num(row.credit_limit), balance: num(row.balance) })),
  });
});

dashboardRouter.get('/products', can('products'), async (req: DashboardRequest, res) => {
  const showCosts = hasDashboardPermission(req.member!.role, 'costs');
  const rows = await stockLevels(bizId(req));
  res.json({
    total: rows.length,
    rows: rows.map(({ average_cost, ...row }) => (showCosts ? { ...row, average_cost } : row)),
  });
});

dashboardRouter.get('/stock-report', can('stockReport'), async (req: DashboardRequest, res) => {
  if (!req.flags?.stock_reports) {
    res.status(403).json({ error: 'Stock reports are turned off for this business.', code: 'FEATURE_DISABLED' });
    return;
  }
  const rows = (await stockLevels(bizId(req))).filter((row) => row.track_inventory);
  const items = rows.map((row) => ({
    ...row,
    stock_value: row.average_cost * Math.max(row.stock, 0),
    low: row.active && row.stock <= row.reorder_level,
  }));
  res.json({
    total_value: items.reduce((sum, row) => sum + row.stock_value, 0),
    low_count: items.filter((row) => row.low).length,
    rows: items,
  });
});

dashboardRouter.get('/purchases', can('purchases'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const params = [bizId(req)];
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT p.id, p.reference_number, p.total_amount, p.paid_amount, p.status, p.purchase_date, s.name AS supplier
       FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.business_id = p.business_id
       WHERE p.business_id = $1 ORDER BY p.purchase_date DESC LIMIT $2 OFFSET $3`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM purchases WHERE business_id = $1`, params),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, total_amount: num(row.total_amount), paid_amount: num(row.paid_amount) })),
  });
});

dashboardRouter.get('/movements', can('movements'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const params = [bizId(req)];
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT m.id, m.occurred_at, m.type, m.quantity, m.previous_quantity, m.new_quantity, m.reason,
              p.name AS product, u.name AS user_name
       FROM stock_movements m
       LEFT JOIN products p ON p.id = m.product_id AND p.business_id = m.business_id
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.business_id = $1 ORDER BY m.occurred_at DESC LIMIT $2 OFFSET $3`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM stock_movements WHERE business_id = $1`, params),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({
      ...row,
      quantity: num(row.quantity),
      previous_quantity: num(row.previous_quantity),
      new_quantity: num(row.new_quantity),
    })),
  });
});

dashboardRouter.get('/expenses', can('expenses'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const params = [bizId(req)];
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT id, category, amount, payment_method, description, expense_date FROM expenses
       WHERE business_id = $1 ORDER BY expense_date DESC LIMIT $2 OFFSET $3`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM expenses WHERE business_id = $1`, params),
  ]);
  res.json({ total: num(count.total), rows: rows.map((row) => ({ ...row, amount: num(row.amount) })) });
});

dashboardRouter.get('/reports/closings', can('reports'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const params = [bizId(req)];
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT id, business_date, session_number, status, total_sales, cogs, gross_profit, expenses, net_profit,
              expected_cash, actual_cash, cash_variance
       FROM daily_closings WHERE business_id = $1
       ORDER BY business_date DESC, session_number DESC LIMIT $2 OFFSET $3`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM daily_closings WHERE business_id = $1`, params),
  ]);
  const money = ['total_sales', 'cogs', 'gross_profit', 'expenses', 'net_profit', 'expected_cash', 'actual_cash', 'cash_variance'];
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, ...Object.fromEntries(money.map((key) => [key, num(row[key])])) })),
  });
});

dashboardRouter.get('/staff', can('staff'), async (req: DashboardRequest, res) => {
  const staff = await AppDataSource.getRepository(User).find({
    where: { business_id: bizId(req) },
    order: { name: 'ASC' },
  });
  res.json({
    rows: staff.map(({ id, name, email, phone, role, active, locked_until }) => ({
      id, name, email, phone, role, active, locked: Boolean(locked_until && locked_until > new Date()),
    })),
  });
});

const staffChangeSchema = z
  .object({
    role: z.enum(['MANAGER', 'CASHIER', 'STAFF']).optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => body.role !== undefined || body.active !== undefined, 'Nothing to change');

dashboardRouter.patch('/staff/:id', can('staffManage'), async (req: DashboardRequest, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = staffChangeSchema.parse(req.body);
  if (id === req.member!.id) {
    res.status(400).json({ error: 'You cannot change your own role or access.' });
    return;
  }
  const users = AppDataSource.getRepository(User);
  const target = await users.findOne({ where: { id, business_id: bizId(req) } });
  if (!target) {
    res.status(404).json({ error: 'Staff member not found' });
    return;
  }
  if (target.role === 'OWNER') {
    res.status(403).json({ error: 'Another owner cannot be changed here.' });
    return;
  }
  await users.update(id, {
    ...(body.role ? { role: body.role } : {}),
    ...(body.active !== undefined ? { active: body.active, token_version: (target.token_version ?? 0) + 1 } : {}),
    updated_at: new Date(),
  });
  res.json({ ok: true });
});

dashboardRouter.get('/audit', can('audit'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const params = [bizId(req)];
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.reason, a.role, a.created_at, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.business_id = $1 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM audit_logs WHERE business_id = $1`, params),
  ]);
  res.json({ total: num(count.total), rows });
});

dashboardRouter.get('/support-access', can('supportAccess'), async (req: DashboardRequest, res) => {
  const grants = await AppDataSource.getRepository(SupportAccessGrant).find({
    where: { business_id: bizId(req) },
    order: { created_at: 'DESC' },
    take: 50,
  });
  res.json({ rows: grants.map(({ id, admin_name, reason, expires_at, revoked_at, created_at }) => ({ id, admin_name, reason, expires_at, revoked_at, created_at })) });
});

dashboardRouter.use((error: unknown, _req: DashboardRequest, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Could not load this data' });
});
