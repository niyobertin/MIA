import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import { Announcement, Business, BusinessPlatformState, SupportAccessGrant, User } from '../entities';
import { requireActiveUser, requireAuth } from '../middleware/auth';
import { bizId, can, listWindow, windowWhere, type DashboardRequest } from './dashboardShared';
import { dashboardWriteRouter } from './dashboardWrite';
import { buildOverview, parsePeriodQuery, periodBounds, safeTimezone, stockLevels } from '../lib/businessData';
import {
  dashboardPermissionsFor,
  hasDashboardPermission,
  resolveFlags,
  type DashboardPermission,
} from '../lib/rbac';

export const dashboardRouter = Router();

const q = (sql: string, params: unknown[] = []) => AppDataSource.query(sql, params) as Promise<any[]>;
const num = (value: unknown) => Number(value ?? 0);


const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(100).optional(),
});

function searchTerm(value: string | undefined) {
  return value ? `%${value.replace(/[%_\\]/g, '\\$&')}%` : null;
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
  const [openDay] = await q(
    `SELECT id, session_number, opened_at, to_char(business_date, 'YYYY-MM-DD') AS business_date
     FROM daily_closings WHERE business_id = $1 AND status = 'open' ORDER BY opened_at DESC NULLS LAST LIMIT 1`,
    [member.business_id],
  );
  res.json({
    user: { id: member.id, name: member.name, email: member.email, role: member.role },
    business: req.business,
    day: openDay ? { open: true, id: openDay.id, session_number: num(openDay.session_number), opened_at: openDay.opened_at, business_date: openDay.business_date } : { open: false },
    permissions: dashboardPermissionsFor(member.role),
    flags: req.flags,
    announcements: announcements.map(({ id, title, body, severity }) => ({ id, title, body, severity })),
  });
});

dashboardRouter.get('/overview', can('overview'), async (req: DashboardRequest, res) => {
  const parsed = parsePeriodQuery(req.query);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json(await buildOverview(bizId(req), req.business!.timezone, parsed.period, parsed.custom));
});

dashboardRouter.get('/sales', can('sales'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const status = z.enum(['all', 'unpaid']).default('all').parse(req.query.status);
  const ownOnly = !hasDashboardPermission(req.member!.role, 'salesAll');
  const customerId = req.query.customer_id ? z.string().uuid().parse(req.query.customer_id) : null;
  const win = await listWindow(req, { date: 's.sale_date', amount: 's.total_amount', customer: 'c.name', reference: 's.reference_number' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params: unknown[] = [bizId(req), status, ownOnly ? req.member!.id : null, searchTerm(page.q), customerId, win.from, win.to];
  const where = `s.business_id = $1
    AND ($2 = 'all' OR (s.voided = false AND s.total_amount > s.paid_amount))
    AND ($3::text IS NULL OR s.created_by::text = $3)
    AND ($4::text IS NULL OR s.reference_number ILIKE $4 OR c.name ILIKE $4)
    AND ($5::text IS NULL OR s.customer_id::text = $5)
    AND ${windowWhere('s.sale_date', 6)}`;
  const from = `FROM sales s LEFT JOIN customers c ON c.id = s.customer_id AND c.business_id = s.business_id
                LEFT JOIN users u ON u.id = s.created_by`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT s.id, s.reference_number, s.total_amount, s.paid_amount, s.payment_status, s.voided, s.sale_date,
              c.name AS customer, u.name AS cashier
       ${from} WHERE ${where} ORDER BY ${win.orderBy}, s.sale_date DESC LIMIT $8 OFFSET $9`,
      [...params, page.limit, page.offset],
    ),
    q(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(s.total_amount) FILTER (WHERE NOT s.voided), 0) AS sales_total,
              COALESCE(SUM(LEAST(s.paid_amount, s.total_amount)) FILTER (WHERE NOT s.voided), 0) AS paid,
              COALESCE(SUM(GREATEST(s.total_amount - s.paid_amount, 0)) FILTER (WHERE NOT s.voided), 0) AS outstanding,
              COUNT(*) FILTER (WHERE NOT s.voided AND s.total_amount > s.paid_amount) AS unpaid_count
       ${from} WHERE ${where}`,
      params,
    ),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, total_amount: num(row.total_amount), paid_amount: num(row.paid_amount) })),
    summary: {
      count: num(count.total),
      total: num(count.sales_total),
      paid: num(count.paid),
      outstanding: num(count.outstanding),
      unpaid_count: num(count.unpaid_count),
    },
    totals: { total_amount: num(count.sales_total), balance: num(count.outstanding) },
  });
});

dashboardRouter.get('/sales/:id', can('sales'), async (req: DashboardRequest, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(404).json({ error: 'Sale not found' });
    return;
  }
  const ownOnly = !hasDashboardPermission(req.member!.role, 'salesAll');
  const [sale] = await q(
    `SELECT s.id, s.reference_number, s.total_amount, s.paid_amount, s.discount_amount, s.payment_status, s.voided,
            s.sale_date, s.notes, c.name AS customer, u.name AS cashier
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.business_id = s.business_id
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.business_id = $1 AND s.id = $2 AND ($3::text IS NULL OR s.created_by::text = $3)`,
    [bizId(req), id.data, ownOnly ? req.member!.id : null],
  );
  if (!sale) {
    res.status(404).json({ error: 'Sale not found' });
    return;
  }
  const items = await q(
    `SELECT i.id, i.quantity, i.selling_price, i.discount_amount, i.total_amount, p.name AS product, p.unit
     FROM sale_items i LEFT JOIN products p ON p.id = i.product_id AND p.business_id = i.business_id
     WHERE i.business_id = $1 AND i.sale_id = $2 ORDER BY p.name`,
    [bizId(req), id.data],
  );
  res.json({
    ...sale,
    total_amount: num(sale.total_amount),
    paid_amount: num(sale.paid_amount),
    discount_amount: num(sale.discount_amount),
    items: items.map((item) => ({
      ...item,
      quantity: num(item.quantity),
      selling_price: num(item.selling_price),
      discount_amount: num(item.discount_amount),
      total_amount: num(item.total_amount),
    })),
  });
});

dashboardRouter.get('/payments', can('payments'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const ownOnly = !hasDashboardPermission(req.member!.role, 'paymentsAll');
  const win = await listWindow(req, { date: 'p.payment_date', amount: 'p.amount' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [bizId(req), ownOnly ? req.member!.id : null, win.from, win.to];
  const where = `p.business_id = $1 AND ($2::text IS NULL OR p.created_by::text = $2) AND ${windowWhere('p.payment_date', 3)}`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT p.id, p.type, p.payment_method, p.amount, p.payment_date, p.notes, u.name AS recorded_by
       FROM payments p LEFT JOIN users u ON u.id = p.created_by
       WHERE ${where} ORDER BY ${win.orderBy}, p.payment_date DESC LIMIT $5 OFFSET $6`,
      [...params, page.limit, page.offset],
    ),
    q(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(p.amount), 0) AS amount,
              COALESCE(SUM(p.amount) FILTER (WHERE p.type IN ('sale_payment', 'customer_payment', 'other_income')), 0) AS money_in,
              COALESCE(SUM(p.amount) FILTER (WHERE p.type IN ('supplier_payment', 'purchase_payment', 'expense_payment', 'withdrawal')), 0) AS money_out
       FROM payments p WHERE ${where}`,
      params,
    ),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, amount: num(row.amount) })),
    summary: { count: num(count.total), money_in: num(count.money_in), money_out: num(count.money_out) },
    totals: { amount: num(count.amount) },
  });
});

dashboardRouter.get('/customers', can('customers'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const win = await listWindow(req, { name: 'c.name', date: 'c.created_at', balance: 'balance' }, 'name', 'asc');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [bizId(req), searchTerm(page.q), win.from, win.to];
  const where = `c.business_id = $1 AND ($2::text IS NULL OR c.name ILIKE $2 OR c.phone ILIKE $2) AND ${windowWhere('c.created_at', 3)}`;
  const [rows, [count], [summary]] = await Promise.all([
    q(
      `SELECT c.id, c.name, c.phone, c.email, c.address, c.credit_limit, c.active, c.created_at,
              COALESCE((SELECT SUM(s.total_amount - s.paid_amount) FROM sales s
                        WHERE s.customer_id = c.id AND s.business_id = c.business_id
                          AND s.voided = false AND s.total_amount > s.paid_amount), 0) AS balance
       FROM customers c WHERE ${where} ORDER BY ${win.orderBy}, c.name LIMIT $5 OFFSET $6`,
      [...params, page.limit, page.offset],
    ),
    q(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM((SELECT SUM(s.total_amount - s.paid_amount) FROM sales s
                            WHERE s.customer_id = c.id AND s.business_id = c.business_id
                              AND s.voided = false AND s.total_amount > s.paid_amount)), 0) AS balance
       FROM customers c WHERE ${where}`,
      params,
    ),
    q(
      `SELECT COUNT(*) FILTER (WHERE c.active) AS active_count,
              COALESCE(SUM(d.owed), 0) AS owed, COUNT(*) FILTER (WHERE d.owed > 0) AS debtors
       FROM customers c
       LEFT JOIN LATERAL (SELECT COALESCE(SUM(s.total_amount - s.paid_amount), 0) AS owed FROM sales s
                          WHERE s.customer_id = c.id AND s.business_id = c.business_id AND s.voided = false AND s.total_amount > s.paid_amount) d ON true
       WHERE c.business_id = $1`,
      [params[0]],
    ),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, credit_limit: num(row.credit_limit), balance: num(row.balance) })),
    totals: { balance: num(count.balance) },
    summary: { active: num(summary.active_count), owed: num(summary.owed), debtors: num(summary.debtors) },
  });
});

dashboardRouter.get('/products', can('products'), async (req: DashboardRequest, res) => {
  const showCosts = hasDashboardPermission(req.member!.role, 'costs');
  const rows = await stockLevels(bizId(req));
  const tracked = rows.filter((row) => row.active && row.track_inventory);
  res.json({
    total: rows.length,
    rows: rows.map(({ average_cost, ...row }) => (showCosts ? { ...row, average_cost } : row)),
    summary: {
      active: rows.filter((row) => row.active).length,
      low_stock: tracked.filter((row) => row.stock <= row.reorder_level).length,
      out_of_stock: tracked.filter((row) => row.stock <= 0).length,
      stock_sale_value: tracked.reduce((sum, row) => sum + Math.max(row.stock, 0) * row.selling_price, 0),
      ...(showCosts ? { stock_value: tracked.reduce((sum, row) => sum + Math.max(row.stock, 0) * row.average_cost, 0) } : {}),
    },
  });
});

dashboardRouter.get('/stock-report', can('stockReport'), async (req: DashboardRequest, res) => {
  if (!req.flags?.stock_reports) {
    res.status(403).json({ error: 'Stock reports are turned off for this business.', code: 'FEATURE_DISABLED' });
    return;
  }
  const rawPeriod = typeof req.query.period === 'string' ? req.query.period : 'all';
  let rows = (await stockLevels(bizId(req))).filter((row) => row.track_inventory);
  let window: { from: Date; to: Date } | null = null;
  const moved = new Map<string, { opening: number; qty_in: number; qty_out: number }>();
  if (rawPeriod !== 'all') {
    const parsed = parsePeriodQuery(req.query as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const bounds = await periodBounds(parsed.period, safeTimezone(req.business?.timezone ?? 'Africa/Kigali'), parsed.custom);
    window = { from: bounds.from, to: bounds.to };
    const incoming = `m.type IN ('opening','purchase','return_in','adjustment_in')`;
    const [later, newer] = await Promise.all([
      q(
        `SELECT m.product_id,
                COALESCE(SUM(CASE WHEN ${incoming} THEN m.quantity ELSE -m.quantity END), 0) AS after_from,
                COALESCE(SUM(CASE WHEN m.occurred_at >= $3 THEN (CASE WHEN ${incoming} THEN m.quantity ELSE -m.quantity END) ELSE 0 END), 0) AS after_to,
                COALESCE(SUM(CASE WHEN m.occurred_at < $3 AND ${incoming} THEN m.quantity ELSE 0 END), 0) AS qty_in,
                COALESCE(SUM(CASE WHEN m.occurred_at < $3 AND NOT (${incoming}) THEN m.quantity ELSE 0 END), 0) AS qty_out
         FROM stock_movements m WHERE m.business_id = $1 AND m.occurred_at >= $2 GROUP BY m.product_id`,
        [bizId(req), bounds.from, bounds.to],
      ),
      q(`SELECT id FROM products WHERE business_id = $1 AND created_at >= $2`, [bizId(req), bounds.to]),
    ]);
    const notYetAdded = new Set(newer.map((row) => String(row.id)));
    const byProduct = new Map(later.map((row) => [String(row.product_id), row]));
    rows = rows
      .filter((row) => !notYetAdded.has(row.id))
      .map((row) => {
        const m = byProduct.get(row.id);
        const closing = row.stock - num(m?.after_to);
        moved.set(row.id, { opening: row.stock - num(m?.after_from), qty_in: num(m?.qty_in), qty_out: num(m?.qty_out) });
        return { ...row, stock: closing };
      });
  }
  const items = rows.map((row) => ({
    ...row,
    opening: moved.get(row.id)?.opening ?? row.stock,
    qty_in: moved.get(row.id)?.qty_in ?? 0,
    qty_out: moved.get(row.id)?.qty_out ?? 0,
    stock_value: row.average_cost * Math.max(row.stock, 0),
    sale_value: row.selling_price * Math.max(row.stock, 0),
    low: row.active && row.stock <= row.reorder_level,
  }));
  res.json({
    period: window ? { from: window.from, to: window.to } : null,
    total_value: items.reduce((sum, row) => sum + row.stock_value, 0),
    total_sale_value: items.reduce((sum, row) => sum + row.sale_value, 0),
    low_count: items.filter((row) => row.low).length,
    qty_in: items.reduce((sum, row) => sum + row.qty_in, 0),
    qty_out: items.reduce((sum, row) => sum + row.qty_out, 0),
    rows: items,
  });
});

dashboardRouter.get('/purchases', can('purchases'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const win = await listWindow(req, { date: 'p.purchase_date', amount: 'p.total_amount', supplier: 's.name' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [bizId(req), win.from, win.to, searchTerm(page.q)];
  const where = `p.business_id = $1 AND ${windowWhere('p.purchase_date', 2)}
    AND ($4::text IS NULL OR p.reference_number ILIKE $4 OR s.name ILIKE $4)`;
  const from = `FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.business_id = p.business_id`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT p.id, p.reference_number, p.total_amount, p.paid_amount, p.status, p.purchase_date, s.name AS supplier
       ${from} WHERE ${where} ORDER BY ${win.orderBy}, p.purchase_date DESC LIMIT $5 OFFSET $6`,
      [...params, page.limit, page.offset],
    ),
    q(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(p.total_amount) FILTER (WHERE p.status <> 'cancelled'), 0) AS purchases_total,
              COALESCE(SUM(LEAST(p.paid_amount, p.total_amount)) FILTER (WHERE p.status <> 'cancelled'), 0) AS paid,
              COALESCE(SUM(GREATEST(p.total_amount - p.paid_amount, 0)) FILTER (WHERE p.status <> 'cancelled'), 0) AS owed
       ${from} WHERE ${where}`,
      params,
    ),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, total_amount: num(row.total_amount), paid_amount: num(row.paid_amount) })),
    summary: { count: num(count.total), total: num(count.purchases_total), paid: num(count.paid), owed: num(count.owed) },
    totals: { total_amount: num(count.purchases_total), paid_amount: num(count.paid) },
  });
});

dashboardRouter.get('/purchases/:id', can('purchases'), async (req: DashboardRequest, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(404).json({ error: 'Purchase not found' });
    return;
  }
  const [purchase] = await q(
    `SELECT p.id, p.reference_number, p.total_amount, p.paid_amount, p.status, p.purchase_date, s.name AS supplier
     FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.business_id = p.business_id
     WHERE p.business_id = $1 AND p.id = $2`,
    [bizId(req), id.data],
  );
  if (!purchase) {
    res.status(404).json({ error: 'Purchase not found' });
    return;
  }
  const items = await q(
    `SELECT i.id, i.quantity, i.unit_cost, i.total_cost, pr.name AS product, pr.unit
     FROM purchase_items i LEFT JOIN products pr ON pr.id = i.product_id AND pr.business_id = i.business_id
     WHERE i.business_id = $1 AND i.purchase_id = $2 ORDER BY pr.name`,
    [bizId(req), id.data],
  );
  res.json({
    ...purchase,
    total_amount: num(purchase.total_amount),
    paid_amount: num(purchase.paid_amount),
    items: items.map((item) => ({ ...item, quantity: num(item.quantity), unit_cost: num(item.unit_cost), total_cost: num(item.total_cost) })),
  });
});

dashboardRouter.get('/movements', can('movements'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const productId = req.query.product_id ? z.string().uuid().parse(req.query.product_id) : null;
  const win = await listWindow(req, { date: 'm.occurred_at', quantity: 'm.quantity', product: 'p.name' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [bizId(req), productId, win.from, win.to, searchTerm(page.q)];
  const where = `m.business_id = $1 AND ($2::text IS NULL OR m.product_id::text = $2) AND ${windowWhere('m.occurred_at', 3)}
    AND ($5::text IS NULL OR p.name ILIKE $5)`;
  const from = `FROM stock_movements m
       LEFT JOIN products p ON p.id = m.product_id AND p.business_id = m.business_id
       LEFT JOIN users u ON u.id = m.created_by`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT m.id, m.occurred_at, m.type, m.quantity, m.previous_quantity, m.new_quantity, m.reason,
              p.name AS product, u.name AS user_name
       ${from} WHERE ${where}
       ORDER BY ${win.orderBy}, m.occurred_at DESC LIMIT $6 OFFSET $7`,
      [...params, page.limit, page.offset],
    ),
    q(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(m.new_quantity - m.previous_quantity) FILTER (WHERE m.new_quantity > m.previous_quantity), 0) AS qty_in,
              COALESCE(SUM(m.previous_quantity - m.new_quantity) FILTER (WHERE m.new_quantity < m.previous_quantity), 0) AS qty_out,
              COUNT(DISTINCT m.product_id) AS products
       ${from} WHERE ${where}`,
      params,
    ),
  ]);
  res.json({
    total: num(count.total),
    summary: { count: num(count.total), qty_in: num(count.qty_in), qty_out: num(count.qty_out), products: num(count.products) },
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
  const win = await listWindow(req, { date: 'e.expense_date', amount: 'e.amount', category: 'e.category' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const listParams = [bizId(req), win.from, win.to, searchTerm(page.q)];
  const where = `e.business_id = $1 AND ${windowWhere('e.expense_date', 2)}
    AND ($4::text IS NULL OR e.description ILIKE $4 OR e.category ILIKE $4)`;
  const [rows, [count], [summary]] = await Promise.all([
    q(
      `SELECT e.id, e.category, e.amount, e.payment_method, e.description, e.reference_number, e.expense_date, e.created_at,
              (e.session_id IS NOT NULL AND e.session_id = (SELECT id FROM daily_closings WHERE business_id = $1 AND status = 'open' LIMIT 1)) AS editable,
              u.name AS recorded_by
       FROM expenses e LEFT JOIN users u ON u.id = e.created_by
       WHERE ${where} ORDER BY ${win.orderBy}, e.created_at DESC LIMIT $5 OFFSET $6`,
      [...listParams, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total, COALESCE(SUM(e.amount), 0) AS amount FROM expenses e WHERE ${where}`, listParams),
    q(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE session_id = (SELECT id FROM daily_closings WHERE business_id = $1 AND status = 'open' LIMIT 1)), 0) AS today,
              COALESCE(SUM(amount) FILTER (WHERE expense_date >= date_trunc('month', now())), 0) AS month,
              COALESCE(SUM(amount), 0) AS all_time
       FROM expenses WHERE business_id = $1`,
      params,
    ),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((row) => ({ ...row, amount: num(row.amount) })),
    totals: { amount: num(count.amount) },
    summary: { today: num(summary.today), month: num(summary.month), all_time: num(summary.all_time) },
  });
});

dashboardRouter.get('/reports/closings', can('reports'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const win = await listWindow(req, { date: 'business_date', sales: 'total_sales', profit: 'net_profit' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [bizId(req), win.from, win.to];
  const where = `business_id = $1 AND ${windowWhere('business_date::timestamp', 2)}`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT id, business_date, session_number, status, total_sales, cogs, gross_profit, expenses, net_profit,
              expected_cash, actual_cash, cash_variance
       FROM daily_closings WHERE ${where}
       ORDER BY ${win.orderBy}, business_date DESC, session_number DESC LIMIT $4 OFFSET $5`,
      [...params, page.limit, page.offset],
    ),
    q(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(total_sales) FILTER (WHERE status = 'closed'), 0) AS sales,
              COALESCE(SUM(net_profit) FILTER (WHERE status = 'closed'), 0) AS profit,
              COALESCE(SUM(cash_variance) FILTER (WHERE status = 'closed'), 0) AS variance,
              COUNT(*) FILTER (WHERE status = 'closed' AND cash_variance <> 0) AS short_days
       FROM daily_closings WHERE ${where}`,
      params,
    ),
  ]);
  const money = ['total_sales', 'cogs', 'gross_profit', 'expenses', 'net_profit', 'expected_cash', 'actual_cash', 'cash_variance'];
  res.json({
    total: num(count.total),
    summary: { count: num(count.total), sales: num(count.sales), profit: num(count.profit), variance: num(count.variance), short_days: num(count.short_days) },
    rows: rows.map((row) => ({ ...row, ...Object.fromEntries(money.map((key) => [key, num(row[key])])) })),
  });
});

dashboardRouter.get('/staff', can('staff'), async (req: DashboardRequest, res) => {
  const staff = await AppDataSource.getRepository(User).find({
    where: { business_id: bizId(req) },
    order: { name: 'ASC' },
  });
  res.json({
    rows: staff.map(({ id, name, email, phone, role, active, locked_until, created_at }) => ({
      id, name, email, phone, role, active, created_at, locked: Boolean(locked_until && locked_until > new Date()),
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
  const win = await listWindow(req, { date: 'a.created_at', action: 'a.action', user: 'u.name' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [bizId(req), win.from, win.to, searchTerm(page.q)];
  const where = `a.business_id = $1 AND ${windowWhere('a.created_at', 2)}
    AND ($4::text IS NULL OR a.action ILIKE $4 OR a.entity ILIKE $4 OR u.name ILIKE $4)`;
  const from = `FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.reason, a.role, a.created_at, u.name AS user_name
       ${from} WHERE ${where} ORDER BY ${win.orderBy}, a.created_at DESC LIMIT $5 OFFSET $6`,
      [...params, page.limit, page.offset],
    ),
    q(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT a.user_id) AS people,
              COUNT(*) FILTER (WHERE a.action ILIKE '%void%' OR a.action ILIKE '%delete%' OR a.action ILIKE '%cancel%') AS reversals
       ${from} WHERE ${where}`,
      params,
    ),
  ]);
  res.json({
    total: num(count.total),
    rows,
    summary: { count: num(count.total), people: num(count.people), reversals: num(count.reversals) },
  });
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

dashboardRouter.use(dashboardWriteRouter);
