import { AppDataSource } from '../data-source';

export type Period = 'today' | 'yesterday' | '7d' | '30d' | '90d';

const q = (sql: string, params: unknown[] = []) => AppDataSource.query(sql, params) as Promise<any[]>;
const num = (value: unknown) => Number(value ?? 0);

export function safeTimezone(timezone: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone ?? 'UTC' });
    return timezone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function periodBounds(period: Period, timezone: string) {
  const [row] = await q(
    `SELECT (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) AS today_start`,
    [timezone],
  );
  const todayStart = new Date(row.today_start);
  const day = 24 * 60 * 60 * 1000;
  const tomorrow = new Date(todayStart.getTime() + day);
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 1;
  if (period === 'yesterday') {
    return { from: new Date(todayStart.getTime() - day), to: todayStart, days };
  }
  const from = new Date(tomorrow.getTime() - days * day);
  return { from, to: tomorrow, days };
}

const STOCK_SQL = `
  SELECT p.id, p.name, p.sku, p.unit, p.selling_price, p.average_cost, p.reorder_level, p.track_inventory, p.active,
         c.name AS category,
         COALESCE(SUM(CASE WHEN m.type IN ('opening','purchase','return_in','adjustment_in') THEN m.quantity
                           WHEN m.id IS NULL THEN 0 ELSE -m.quantity END), 0) AS stock
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id AND c.business_id = p.business_id
  LEFT JOIN stock_movements m ON m.product_id = p.id AND m.business_id = p.business_id
  WHERE p.business_id = $1
  GROUP BY p.id, c.name
  ORDER BY p.name`;

export async function stockLevels(businessId: string) {
  const rows = await q(STOCK_SQL, [businessId]);
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sku: row.sku as string | null,
    unit: row.unit as string,
    category: row.category as string | null,
    selling_price: num(row.selling_price),
    average_cost: num(row.average_cost),
    reorder_level: num(row.reorder_level),
    track_inventory: Boolean(row.track_inventory),
    active: Boolean(row.active),
    stock: num(row.stock),
  }));
}

export async function salesTotals(businessId: string, from: Date, to: Date) {
  const [row] = await q(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
     FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= $2 AND sale_date < $3`,
    [businessId, from, to],
  );
  return { count: num(row.count), total: num(row.total) };
}

export async function buildOverview(businessId: string, timezone: string, period: Period) {
  const tz = safeTimezone(timezone);
  const { from, to, days } = await periodBounds(period, tz);
  const spanMs = to.getTime() - from.getTime();
  const previousFrom = new Date(from.getTime() - spanMs);
  const params = [businessId, from, to];

  const [sales, previousSales, cogsRow, expenseRow, receivedRow, outstandingRow, stock] = await Promise.all([
    salesTotals(businessId, from, to),
    salesTotals(businessId, previousFrom, from),
    q(
      `SELECT COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id AND s.business_id = si.business_id
       WHERE si.business_id = $1 AND s.voided = false AND s.sale_date >= $2 AND s.sale_date < $3`,
      params,
    ),
    q(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
       WHERE business_id = $1 AND expense_date >= $2 AND expense_date < $3`,
      params,
    ),
    q(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
       WHERE business_id = $1 AND type IN ('customer_payment', 'sale_payment')
         AND payment_date >= $2 AND payment_date < $3`,
      params,
    ),
    q(
      `SELECT COALESCE(SUM(total_amount - paid_amount), 0) AS total FROM sales
       WHERE business_id = $1 AND voided = false AND total_amount > paid_amount`,
      [businessId],
    ),
    stockLevels(businessId),
  ]);

  const cogs = num(cogsRow[0].cogs);
  const expenses = num(expenseRow[0].total);
  const grossProfit = sales.total - cogs;
  const tracked = stock.filter((item) => item.active && item.track_inventory);
  const lowStock = tracked
    .filter((item) => item.stock <= item.reorder_level)
    .sort((a, b) => a.stock - a.reorder_level - (b.stock - b.reorder_level));

  const [trendRows, categoryRows, unpaid, transactions, movements] = await Promise.all([
    q(
      `SELECT to_char(sale_date AT TIME ZONE $4, 'YYYY-MM-DD') AS day, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
       FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= $2 AND sale_date < $3
       GROUP BY day ORDER BY day`,
      [...params, tz],
    ),
    q(
      `SELECT COALESCE(c.name, 'Uncategorized') AS category, COALESCE(SUM(si.total_amount), 0) AS total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.business_id = si.business_id
       JOIN products p ON p.id = si.product_id AND p.business_id = si.business_id
       LEFT JOIN categories c ON c.id = p.category_id AND c.business_id = si.business_id
       WHERE si.business_id = $1 AND s.voided = false AND s.sale_date >= $2 AND s.sale_date < $3
       GROUP BY 1 ORDER BY total DESC`,
      params,
    ),
    q(
      `SELECT s.id, s.reference_number, s.total_amount, s.paid_amount, s.payment_status, s.sale_date, c.name AS customer
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id AND c.business_id = s.business_id
       WHERE s.business_id = $1 AND s.voided = false AND s.total_amount > s.paid_amount
       ORDER BY s.sale_date DESC LIMIT 5`,
      [businessId],
    ),
    q(
      `SELECT * FROM (
         SELECT 'Sale' AS kind, id, COALESCE(reference_number, 'Sale') AS description, total_amount AS amount, sale_date AS at
           FROM sales WHERE business_id = $1 AND voided = false
         UNION ALL
         SELECT 'Payment', id, type, amount, payment_date FROM payments WHERE business_id = $1
         UNION ALL
         SELECT 'Expense', id, category, amount, expense_date FROM expenses WHERE business_id = $1
         UNION ALL
         SELECT 'Purchase', id, COALESCE(reference_number, 'Purchase'), total_amount, purchase_date FROM purchases WHERE business_id = $1
       ) t ORDER BY at DESC LIMIT 6`,
      [businessId],
    ),
    q(
      `SELECT m.id, m.occurred_at, m.type, m.quantity, p.name AS product, u.name AS user_name
       FROM stock_movements m
       LEFT JOIN products p ON p.id = m.product_id AND p.business_id = m.business_id
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.business_id = $1 ORDER BY m.occurred_at DESC LIMIT 6`,
      [businessId],
    ),
  ]);

  const byDay = new Map(trendRows.map((row) => [row.day as string, num(row.total)]));
  const dayMs = 24 * 60 * 60 * 1000;
  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(from.getTime() + index * dayMs + 12 * 60 * 60 * 1000);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
    return { day, total: byDay.get(day) ?? 0 };
  });

  return {
    period,
    range: { from, to },
    kpis: {
      sales_total: sales.total,
      sales_count: sales.count,
      previous_sales_total: previousSales.total,
      cogs,
      gross_profit: grossProfit,
      expenses,
      net_profit: grossProfit - expenses,
      payments_received: num(receivedRow[0].total),
      outstanding: num(outstandingRow[0].total),
      low_stock_count: lowStock.length,
      stock_value: tracked.reduce((sum, item) => sum + item.average_cost * Math.max(item.stock, 0), 0),
    },
    trend,
    categories: categoryRows.map((row) => ({ category: row.category as string, total: num(row.total) })),
    unpaid: unpaid.map((row) => ({
      id: row.id,
      reference: row.reference_number,
      customer: row.customer,
      total: num(row.total_amount),
      paid: num(row.paid_amount),
      status: row.payment_status,
      at: row.sale_date,
    })),
    transactions: transactions.map((row) => ({
      id: row.id,
      kind: row.kind,
      description: row.description,
      amount: num(row.amount),
      at: row.at,
    })),
    low_stock: lowStock.slice(0, 5).map(({ id, name, unit, stock: qty, reorder_level }) => ({ id, name, unit, stock: qty, reorder_level })),
    movements: movements.map((row) => ({
      id: row.id,
      at: row.occurred_at,
      type: row.type,
      quantity: num(row.quantity),
      product: row.product,
      user: row.user_name,
    })),
  };
}
