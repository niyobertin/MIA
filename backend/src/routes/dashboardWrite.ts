import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import { audit, BooksError, businessToday, inBooks, newId, num, one, WEB_DEVICE } from '../books/core';
import { requireOpenSession } from '../books/session';
import { recordMovement } from '../books/stock';
import { closeDay, daySummary, openDay, recordCount } from '../books/day';
import { adjustStock, createPurchase, createSale, customerPayment, supplierPayment, voidPurchase, voidSale } from '../books/trade';
import { addItems, issueTab, recordTabPayment, returnTabItems } from '../books/waiter';
import { actorOf, can, listWindow, sendError, windowWhere, type DashboardRequest } from './dashboardShared';

export const dashboardWriteRouter = Router();

const q = (sql: string, params: unknown[] = []) => AppDataSource.query(sql, params) as Promise<any[]>;
const money = z.coerce.number().int('Use whole francs').min(0, 'Amount cannot be negative');
const positiveMoney = z.coerce.number().int('Use whole francs').min(1, 'Enter an amount above zero');
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const idParam = (value: unknown) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new BooksError('NOT_FOUND', 404);
  return parsed.data;
};

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(100).optional(),
});
const like = (value?: string) => (value ? `%${value.replace(/[%_\\]/g, '\\$&')}%` : null);

/* ---------- Categories ---------- */

dashboardWriteRouter.get('/categories', can('products'), async (req: DashboardRequest, res) => {
  const rows = await q(
    `SELECT c.id, c.name, c.description, c.active,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.business_id = c.business_id) AS products
     FROM categories c WHERE c.business_id = $1 ORDER BY c.active DESC, c.name`,
    [actorOf(req).businessId],
  );
  res.json({ rows: rows.map((r) => ({ ...r, products: num(r.products) })) });
});

const categorySchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(80), description: optionalText(300) });

dashboardWriteRouter.post('/categories', can('productsWrite'), async (req: DashboardRequest, res) => {
  try {
    const body = categorySchema.parse(req.body);
    const created = await inBooks(actorOf(req), async (ctx) => {
      const id = newId();
      await ctx.tx.query(
        `INSERT INTO categories (id, business_id, name, description, active, created_at, updated_at) VALUES ($1,$2,$3,$4,true,now(),now())`,
        [id, ctx.businessId, body.name, body.description],
      );
      await audit(ctx, { action: 'category.create', entity: 'category', entityId: id, after: body });
      return { id, ...body, active: true };
    });
    res.status(201).json(created);
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.patch('/categories/:id', can('productsWrite'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = categorySchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    await inBooks(actorOf(req), async (ctx) => {
      const before = await one(ctx, `SELECT name, description, active FROM categories WHERE business_id = $1 AND id = $2`, [ctx.businessId, id]);
      if (!before) throw new BooksError('NOT_FOUND', 404);
      await ctx.tx.query(
        `UPDATE categories SET name = COALESCE($3, name), description = CASE WHEN $4::boolean THEN $5 ELSE description END,
           active = COALESCE($6, active), updated_at = now() WHERE business_id = $1 AND id = $2`,
        [ctx.businessId, id, body.name ?? null, body.description !== undefined, body.description ?? null, body.active ?? null],
      );
      await audit(ctx, { action: 'category.update', entity: 'category', entityId: id, before, after: body });
    });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

/* ---------- Products ---------- */

const productSchema = z.object({
  name: z.string().trim().min(1, 'Enter a product name').max(120),
  sku: optionalText(60),
  barcode: optionalText(60),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  selling_price: money,
  reorder_level: z.coerce.number().int().min(0).default(0),
  track_inventory: z.boolean().default(true),
  category_id: z.string().uuid().optional().nullable(),
  preferred_supplier_id: z.string().uuid().optional().nullable(),
});

dashboardWriteRouter.post('/products', can('productsWrite'), async (req: DashboardRequest, res) => {
  try {
    const body = productSchema
      .extend({ opening_qty: z.coerce.number().int().min(0).default(0), opening_cost: money.default(0) })
      .parse(req.body);
    const created = await inBooks(actorOf(req), async (ctx) => {
      const duplicate = await one(ctx, `SELECT id FROM products WHERE business_id = $1 AND lower(name) = lower($2)`, [ctx.businessId, body.name]);
      if (duplicate) throw new BooksError('NAME_TAKEN', 409);
      const id = newId();
      await ctx.tx.query(
        `INSERT INTO products (id, business_id, category_id, preferred_supplier_id, name, sku, barcode, unit, selling_price, average_cost,
           reorder_level, track_inventory, active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,true,now(),now())`,
        [id, ctx.businessId, body.category_id ?? null, body.preferred_supplier_id ?? null, body.name, body.sku, body.barcode, body.unit,
          body.selling_price, body.reorder_level, body.track_inventory],
      );
      if (body.track_inventory && body.opening_qty > 0) {
        const session = await requireOpenSession(ctx);
        await recordMovement(ctx, {
          productId: id, type: 'opening', quantity: body.opening_qty, unitCost: body.opening_cost,
          sessionId: session.id, referenceType: 'adjustment', referenceId: null, reason: 'Opening stock',
        });
      }
      await audit(ctx, { action: 'product.create', entity: 'product', entityId: id, after: body });
      return { id };
    });
    res.status(201).json(created);
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.patch('/products/:id', can('productsWrite'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = productSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    await inBooks(actorOf(req), async (ctx) => {
      const before = await one(ctx, `SELECT * FROM products WHERE business_id = $1 AND id = $2`, [ctx.businessId, id]);
      if (!before) throw new BooksError('NOT_FOUND', 404);
      if (body.name) {
        const duplicate = await one(ctx, `SELECT id FROM products WHERE business_id = $1 AND lower(name) = lower($2) AND id <> $3`, [ctx.businessId, body.name, id]);
        if (duplicate) throw new BooksError('NAME_TAKEN', 409);
      }
      const fields: [string, unknown][] = [];
      for (const key of ['name', 'sku', 'barcode', 'unit', 'selling_price', 'reorder_level', 'track_inventory', 'category_id', 'preferred_supplier_id', 'active'] as const) {
        if (body[key] !== undefined) fields.push([key, body[key]]);
      }
      if (fields.length === 0) return;
      const sets = fields.map(([key], i) => `${key} = $${i + 3}`).join(', ');
      await ctx.tx.query(`UPDATE products SET ${sets}, updated_at = now() WHERE business_id = $1 AND id = $2`, [ctx.businessId, id, ...fields.map(([, v]) => v)]);
      await audit(ctx, {
        action: body.active === false ? 'product.deactivate' : body.active === true ? 'product.reactivate' : 'product.update',
        entity: 'product', entityId: id, before, after: body,
      });
    });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

/* ---------- Customers ---------- */

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  phone: optionalText(30),
  email: z.string().trim().email('Enter a valid email').max(200).optional().nullable().or(z.literal('').transform(() => null)),
  address: optionalText(300),
  credit_limit: money.default(0),
});

dashboardWriteRouter.post('/customers', can('customersWrite'), async (req: DashboardRequest, res) => {
  try {
    const body = customerSchema.parse(req.body);
    const created = await inBooks(actorOf(req), async (ctx) => {
      const id = newId();
      await ctx.tx.query(
        `INSERT INTO customers (id, business_id, name, phone, email, address, credit_limit, active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,now(),now())`,
        [id, ctx.businessId, body.name, body.phone, body.email ?? null, body.address, body.credit_limit],
      );
      await audit(ctx, { action: 'customer.create', entity: 'customer', entityId: id, after: body });
      return { id };
    });
    res.status(201).json(created);
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.patch('/customers/:id', can('customersWrite'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = customerSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    const actor = actorOf(req);
    if ((body.active !== undefined || body.credit_limit !== undefined) && actor.role === 'CASHIER') {
      throw new BooksError('FORBIDDEN', 403);
    }
    await inBooks(actor, async (ctx) => {
      const before = await one(ctx, `SELECT * FROM customers WHERE business_id = $1 AND id = $2`, [ctx.businessId, id]);
      if (!before) throw new BooksError('NOT_FOUND', 404);
      const fields = (['name', 'phone', 'email', 'address', 'credit_limit', 'active'] as const)
        .filter((key) => body[key] !== undefined)
        .map((key) => [key, body[key]] as const);
      if (fields.length === 0) return;
      const sets = fields.map(([key], i) => `${key} = $${i + 3}`).join(', ');
      await ctx.tx.query(`UPDATE customers SET ${sets}, updated_at = now() WHERE business_id = $1 AND id = $2`, [ctx.businessId, id, ...fields.map(([, v]) => v)]);
      await audit(ctx, { action: body.active === false ? 'customer.deactivate' : 'customer.update', entity: 'customer', entityId: id, before, after: body });
    });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

/* ---------- Suppliers ---------- */

dashboardWriteRouter.get('/suppliers', can('suppliers'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const win = await listWindow(req, { name: 's.name', date: 's.created_at', balance: 'balance' }, 'name', 'asc');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [actorOf(req).businessId, like(page.q), win.from, win.to];
  const where = `s.business_id = $1 AND ($2::text IS NULL OR s.name ILIKE $2 OR s.phone ILIKE $2) AND ${windowWhere('s.created_at', 3)}`;
  const [rows, [count], [summary]] = await Promise.all([
    q(
      `SELECT s.id, s.name, s.phone, s.email, s.address, s.active, s.created_at,
              COALESCE((SELECT SUM(p.total_amount - p.paid_amount) FROM purchases p
                        WHERE p.supplier_id = s.id AND p.business_id = s.business_id AND p.status <> 'cancelled'
                          AND p.total_amount > p.paid_amount), 0) AS balance
       FROM suppliers s WHERE ${where} ORDER BY s.active DESC, ${win.orderBy}, s.name LIMIT $5 OFFSET $6`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM suppliers s WHERE ${where}`, params),
    q(
      `SELECT COUNT(*) FILTER (WHERE active) AS active_count,
              COALESCE((SELECT SUM(total_amount - paid_amount) FROM purchases WHERE business_id = $1 AND status <> 'cancelled' AND total_amount > paid_amount), 0) AS owed
       FROM suppliers WHERE business_id = $1`,
      [params[0]],
    ),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((r) => ({ ...r, balance: num(r.balance) })),
    summary: { active: num(summary.active_count), owed: num(summary.owed) },
  });
});

const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  phone: optionalText(30),
  email: z.string().trim().email('Enter a valid email').max(200).optional().nullable().or(z.literal('').transform(() => null)),
  address: optionalText(300),
});

dashboardWriteRouter.post('/suppliers', can('suppliersWrite'), async (req: DashboardRequest, res) => {
  try {
    const body = supplierSchema.parse(req.body);
    const created = await inBooks(actorOf(req), async (ctx) => {
      const id = newId();
      await ctx.tx.query(
        `INSERT INTO suppliers (id, business_id, name, phone, email, address, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,true,now(),now())`,
        [id, ctx.businessId, body.name, body.phone, body.email ?? null, body.address],
      );
      await audit(ctx, { action: 'supplier.create', entity: 'supplier', entityId: id, after: body });
      return { id };
    });
    res.status(201).json(created);
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.patch('/suppliers/:id', can('suppliersWrite'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = supplierSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    const actor = actorOf(req);
    if (body.active !== undefined && actor.role === 'CASHIER') throw new BooksError('FORBIDDEN', 403);
    await inBooks(actor, async (ctx) => {
      const before = await one(ctx, `SELECT * FROM suppliers WHERE business_id = $1 AND id = $2`, [ctx.businessId, id]);
      if (!before) throw new BooksError('NOT_FOUND', 404);
      const fields = (['name', 'phone', 'email', 'address', 'active'] as const)
        .filter((key) => body[key] !== undefined)
        .map((key) => [key, body[key]] as const);
      if (fields.length === 0) return;
      const sets = fields.map(([key], i) => `${key} = $${i + 3}`).join(', ');
      await ctx.tx.query(`UPDATE suppliers SET ${sets}, updated_at = now() WHERE business_id = $1 AND id = $2`, [ctx.businessId, id, ...fields.map(([, v]) => v)]);
      await audit(ctx, { action: body.active === false ? 'supplier.deactivate' : 'supplier.update', entity: 'supplier', entityId: id, before, after: body });
    });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

/* ---------- Expenses ---------- */

export const EXPENSE_CATEGORIES = ['transport', 'rent', 'electricity', 'water', 'food', 'salary', 'communication', 'maintenance', 'tax', 'other'] as const;
const payMethod = z.enum(['cash', 'mobile_money', 'bank']);
const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: positiveMoney,
  payment_method: payMethod,
  description: optionalText(300),
  reference_number: optionalText(60),
});

/** Same rows as the phone: the expense plus an expense_payment, inside the open day. */
dashboardWriteRouter.post('/expenses', can('expensesWrite'), async (req: DashboardRequest, res) => {
  try {
    const body = expenseSchema.parse(req.body);
    const created = await inBooks(actorOf(req), async (ctx) => {
      const session = await requireOpenSession(ctx);
      const day = businessToday(ctx.timezone);
      const id = newId();
      await ctx.tx.query(
        `INSERT INTO expenses (id, business_id, session_id, category, amount, payment_method, description, expense_date, reference_number,
           created_by, device_id, sync_status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'synced',now(),now())`,
        [id, ctx.businessId, session.id, body.category, body.amount, body.payment_method, body.description, day, body.reference_number, ctx.userId, WEB_DEVICE],
      );
      await ctx.tx.query(
        `INSERT INTO payments (id, business_id, session_id, type, payment_method, amount, reference_type, reference_id, party_id, payment_date,
           notes, created_by, device_id, sync_status, created_at, updated_at)
         VALUES ($1,$2,$3,'expense_payment',$4,$5,'expense',$6,NULL,$7,NULL,$8,$9,'synced',now(),now())`,
        [newId(), ctx.businessId, session.id, body.payment_method, body.amount, id, day, ctx.userId, WEB_DEVICE],
      );
      await audit(ctx, { action: 'expense.create', entity: 'expense', entityId: id, after: { amount: body.amount, category: body.category } });
      return { id };
    });
    res.status(201).json(created);
  } catch (error) {
    sendError(res, error);
  }
});

/** Edit an expense while its day is still open; cashiers only their own, like the phone. */
dashboardWriteRouter.patch('/expenses/:id', can('expensesWrite'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = expenseSchema.partial().parse(req.body);
    await inBooks(actorOf(req), async (ctx) => {
      const before = await one<{ created_by: string; session_id: string | null; amount: string; payment_method: string }>(
        ctx, `SELECT created_by::text AS created_by, session_id::text AS session_id, amount, payment_method, category, description FROM expenses WHERE business_id = $1 AND id = $2`,
        [ctx.businessId, id],
      );
      if (!before) throw new BooksError('NOT_FOUND', 404);
      if (ctx.role === 'CASHIER' && before.created_by !== ctx.userId) throw new BooksError('FORBIDDEN', 403);
      const session = await requireOpenSession(ctx);
      if (before.session_id !== session.id) throw new BooksError('HISTORY_LOCKED', 409);
      const fields = (['category', 'amount', 'payment_method', 'description', 'reference_number'] as const)
        .filter((key) => body[key] !== undefined)
        .map((key) => [key, body[key]] as const);
      if (fields.length === 0) return;
      const sets = fields.map(([key], i) => `${key} = $${i + 3}`).join(', ');
      await ctx.tx.query(`UPDATE expenses SET ${sets}, updated_at = now() WHERE business_id = $1 AND id = $2`, [ctx.businessId, id, ...fields.map(([, v]) => v)]);
      await ctx.tx.query(
        `UPDATE payments SET amount = COALESCE($3, amount), payment_method = COALESCE($4, payment_method), updated_at = now()
         WHERE business_id = $1 AND reference_type = 'expense' AND reference_id = $2 AND type = 'expense_payment'`,
        [ctx.businessId, id, body.amount ?? null, body.payment_method ?? null],
      );
      await audit(ctx, { action: 'expense.update', entity: 'expense', entityId: id, before, after: body });
    });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

/* ---------- Day ---------- */

dashboardWriteRouter.get('/day', async (req: DashboardRequest, res) => {
  try {
    const summary = await inBooks(actorOf(req), (ctx) => daySummary(ctx));
    const seeMoney = ['OWNER', 'MANAGER'].includes(String(req.member?.role));
    if (!summary.open || seeMoney) {
      res.json(summary);
      return;
    }
    res.json({ open: true, session: { id: summary.session.id, session_number: summary.session.session_number, opened_at: summary.session.opened_at, business_date: summary.session.business_date } });
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/day/open', can('dayOpen'), async (req: DashboardRequest, res) => {
  try {
    const body = z.object({ opening_cash: money, notes: optionalText(300) }).parse(req.body);
    res.status(201).json(await inBooks(actorOf(req), (ctx) => openDay(ctx, { openingCash: body.opening_cash, notes: body.notes })));
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/day/count', can('stockAdjust'), async (req: DashboardRequest, res) => {
  try {
    const body = z.object({ product_id: z.string().uuid(), counted_qty: z.coerce.number().int().min(0) }).parse(req.body);
    await inBooks(actorOf(req), (ctx) => recordCount(ctx, body.product_id, body.counted_qty));
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/day/close', can('dayClose'), async (req: DashboardRequest, res) => {
  try {
    const body = z.object({ actual_cash: money, notes: optionalText(500) }).parse(req.body);
    res.json(await inBooks(actorOf(req), (ctx) => closeDay(ctx, { actualCash: body.actual_cash, notes: body.notes })));
  } catch (error) {
    sendError(res, error);
  }
});

/* ---------- Payments and stock ---------- */

dashboardWriteRouter.post('/payments/customer', can('paymentsWrite'), async (req: DashboardRequest, res) => {
  try {
    const body = z.object({ customer_id: z.string().uuid(), amount: positiveMoney, method: payMethod, notes: optionalText(300) }).parse(req.body);
    res.status(201).json(await inBooks(actorOf(req), (ctx) => customerPayment(ctx, { customerId: body.customer_id, amount: body.amount, method: body.method, notes: body.notes })));
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/payments/supplier', can('paymentsWrite'), async (req: DashboardRequest, res) => {
  try {
    const body = z.object({ supplier_id: z.string().uuid(), amount: positiveMoney, method: payMethod, notes: optionalText(300) }).parse(req.body);
    res.status(201).json(await inBooks(actorOf(req), (ctx) => supplierPayment(ctx, { supplierId: body.supplier_id, amount: body.amount, method: body.method, notes: body.notes })));
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/stock/adjust', can('stockAdjust'), async (req: DashboardRequest, res) => {
  try {
    const body = z.object({
      product_id: z.string().uuid(),
      kind: z.enum(['adjustment_in', 'adjustment_out', 'damaged']),
      quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
      reason: z.string().trim().min(3, 'Give a reason').max(300),
    }).parse(req.body);
    res.status(201).json(await inBooks(actorOf(req), (ctx) => adjustStock(ctx, { productId: body.product_id, kind: body.kind, quantity: body.quantity, reason: body.reason })));
  } catch (error) {
    sendError(res, error);
  }
});

/* ---------- Sales and stock-in ---------- */

const saleSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  payment_method: z.enum(['cash', 'mobile_money', 'bank', 'credit']),
  notes: optionalText(300),
  allow_below_cost: z.boolean().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.coerce.number().int().min(1),
    selling_price: z.coerce.number().int().min(1),
    discount_amount: z.coerce.number().int().min(0).optional(),
  })).min(1, 'Add at least one item').max(200),
});

dashboardWriteRouter.post('/sales', can('salesCreate'), async (req: DashboardRequest, res) => {
  try {
    const body = saleSchema.parse(req.body);
    const sale = await inBooks(actorOf(req), (ctx) =>
      createSale(ctx, {
        customerId: body.customer_id ?? null,
        paymentMethod: body.payment_method,
        notes: body.notes,
        allowBelowCost: body.allow_below_cost,
        items: body.items.map((i) => ({ productId: i.product_id, quantity: i.quantity, sellingPrice: i.selling_price, discountAmount: i.discount_amount })),
      }),
    );
    res.status(201).json(sale);
  } catch (error) {
    sendError(res, error);
  }
});

const reasonBody = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

dashboardWriteRouter.post('/sales/:id/void', can('salesVoid'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = reasonBody.parse(req.body);
    await inBooks(actorOf(req), (ctx) => voidSale(ctx, id, body.reason));
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/purchases', can('purchasesCreate'), async (req: DashboardRequest, res) => {
  try {
    const body = z.object({
      supplier_id: z.string().uuid({ message: 'Choose a supplier' }),
      payment_method: z.enum(['cash', 'mobile_money', 'bank', 'credit']),
      reference_number: optionalText(60),
      notes: optionalText(300),
      items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.coerce.number().int().min(1), unit_cost: money })).min(1, 'Add at least one item').max(200),
    }).parse(req.body);
    const purchase = await inBooks(actorOf(req), (ctx) =>
      createPurchase(ctx, {
        supplierId: body.supplier_id,
        paymentMethod: body.payment_method,
        referenceNumber: body.reference_number,
        notes: body.notes,
        items: body.items.map((i) => ({ productId: i.product_id, quantity: i.quantity, unitCost: i.unit_cost })),
      }),
    );
    res.status(201).json(purchase);
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/purchases/:id/void', can('purchasesVoid'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = reasonBody.parse(req.body);
    await inBooks(actorOf(req), (ctx) => voidPurchase(ctx, id, body.reason));
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

/* ---------- Waiter tabs ---------- */

dashboardWriteRouter.get('/waiters', can('waiterTabs'), async (req: DashboardRequest, res) => {
  const rows = await q(
    `SELECT id, name, role FROM users WHERE business_id = $1 AND active = true AND role IN ('STAFF','CASHIER') ORDER BY name`,
    [actorOf(req).businessId],
  );
  res.json({ rows });
});

dashboardWriteRouter.get('/waiter-tabs', can('waiterTabs'), async (req: DashboardRequest, res) => {
  const page = pageSchema.parse(req.query);
  const status = z.enum(['open', 'debt', 'paid', 'all']).default('open').parse(req.query.status);
  const statuses = status === 'open' ? ['draft', 'partial'] : status === 'all' ? ['draft', 'partial', 'debt', 'paid', 'cancelled'] : [status];
  const win = await listWindow(req, { date: 't.created_at', total: 'total', waiter: 'u.name' }, 'date');
  if ('error' in win) {
    res.status(400).json({ error: win.error });
    return;
  }
  const params = [actorOf(req).businessId, statuses, win.from, win.to];
  const where = `t.business_id = $1 AND t.status = ANY($2::text[]) AND ${windowWhere('t.created_at', 3)}`;
  const [rows, [count]] = await Promise.all([
    q(
      `SELECT t.id, t.status, t.client_label, t.paid_amount, t.created_at, u.name AS waiter,
              COALESCE((SELECT SUM(i.quantity_outstanding * i.selling_price) FROM waiter_tab_items i WHERE i.tab_id = t.id), 0) AS total
       FROM waiter_tabs t LEFT JOIN users u ON u.id = t.waiter_user_id
       WHERE ${where} ORDER BY ${win.orderBy}, t.created_at DESC LIMIT $5 OFFSET $6`,
      [...params, page.limit, page.offset],
    ),
    q(`SELECT COUNT(*) AS total FROM waiter_tabs t WHERE ${where}`, params),
  ]);
  res.json({
    total: num(count.total),
    rows: rows.map((r) => ({ ...r, paid_amount: num(r.paid_amount), total: num(r.total), balance: Math.max(0, num(r.total) - num(r.paid_amount)) })),
  });
});

dashboardWriteRouter.get('/waiter-tabs/:id', can('waiterTabs'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const businessId = actorOf(req).businessId;
    const [tab] = await q(
      `SELECT t.id, t.status, t.client_label, t.paid_amount, t.created_at, t.notes, u.name AS waiter
       FROM waiter_tabs t LEFT JOIN users u ON u.id = t.waiter_user_id WHERE t.business_id = $1 AND t.id = $2`,
      [businessId, id],
    );
    if (!tab) throw new BooksError('NOT_FOUND', 404);
    const items = await q(
      `SELECT i.id, i.product_id, p.name AS product, i.quantity, i.quantity_outstanding, i.selling_price, i.paid_amount, i.created_at
       FROM waiter_tab_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.business_id = $1 AND i.tab_id = $2 ORDER BY i.created_at`,
      [businessId, id],
    );
    const lines = items.map((i) => ({
      ...i, quantity: num(i.quantity), quantity_outstanding: num(i.quantity_outstanding), selling_price: num(i.selling_price), paid_amount: num(i.paid_amount),
    }));
    const total = lines.reduce((s, i) => s + i.quantity_outstanding * i.selling_price, 0);
    res.json({ ...tab, paid_amount: num(tab.paid_amount), total, balance: Math.max(0, total - num(tab.paid_amount)), items: lines });
  } catch (error) {
    sendError(res, error);
  }
});

const tabLines = z.array(z.object({ product_id: z.string().uuid(), quantity: z.coerce.number().int().min(1), selling_price: z.coerce.number().int().min(1).optional() }))
  .min(1, 'Add at least one item').max(100);

dashboardWriteRouter.post('/waiter-tabs', can('waiterTabs'), async (req: DashboardRequest, res) => {
  try {
    const body = z.object({ waiter_id: z.string().uuid({ message: 'Choose a waiter' }), client_label: optionalText(60), notes: optionalText(300), items: tabLines }).parse(req.body);
    const result = await inBooks(actorOf(req), (ctx) =>
      issueTab(ctx, { waiterId: body.waiter_id, clientLabel: body.client_label, notes: body.notes, lines: body.items.map((i) => ({ productId: i.product_id, quantity: i.quantity, sellingPrice: i.selling_price })) }),
    );
    res.status(201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/waiter-tabs/:id/items', can('waiterTabs'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = z.object({ items: tabLines }).parse(req.body);
    await inBooks(actorOf(req), (ctx) => addItems(ctx, id, body.items.map((i) => ({ productId: i.product_id, quantity: i.quantity, sellingPrice: i.selling_price }))));
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/waiter-tabs/:id/payments', can('waiterTabs'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = z.object({ amount: positiveMoney, method: payMethod, notes: optionalText(300), item_ids: z.array(z.string().uuid()).max(200).optional() }).parse(req.body);
    res.json(await inBooks(actorOf(req), (ctx) => recordTabPayment(ctx, id, { amount: body.amount, method: body.method, notes: body.notes, itemIds: body.item_ids })));
  } catch (error) {
    sendError(res, error);
  }
});

dashboardWriteRouter.post('/waiter-tabs/:id/returns', can('waiterTabs'), async (req: DashboardRequest, res) => {
  try {
    const id = idParam(req.params.id);
    const body = z.object({ reason: optionalText(300), returns: z.array(z.object({ item_id: z.string().uuid(), quantity: z.coerce.number().int().min(1) })).min(1) }).parse(req.body);
    await inBooks(actorOf(req), (ctx) => returnTabItems(ctx, id, body.returns.map((r) => ({ itemId: r.item_id, quantity: r.quantity })), body.reason));
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});
