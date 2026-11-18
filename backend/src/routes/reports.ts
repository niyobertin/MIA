import { Router, type NextFunction, type Response } from 'express';
import { AppDataSource } from '../data-source';
import { Business, BusinessPlatformState } from '../entities';
import { AuthedRequest, requireActiveUser, requireAuth } from '../middleware/auth';
import { parsePeriodQuery, periodBounds, safeTimezone } from '../lib/businessData';
import { hasDashboardPermission, resolveFlags } from '../lib/rbac';

export const reportsRouter = Router();

const q = (sql: string, params: unknown[] = []) => AppDataSource.query(sql, params) as Promise<any[]>;
const num = (value: unknown) => Number(value ?? 0);

type ReportsRequest = AuthedRequest & { business?: Business };

async function loadBusiness(req: ReportsRequest, res: Response, next: NextFunction) {
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
  if (!resolveFlags(state?.feature_flags).web_dashboard) {
    res.status(403).json({ error: 'The web dashboard is turned off for this business.', code: 'FEATURE_DISABLED' });
    return;
  }
  req.business = business;
  next();
}

function canReadReports(req: ReportsRequest, res: Response, next: NextFunction) {
  if (!hasDashboardPermission(req.member?.role, 'reports')) {
    res.status(403).json({ error: 'Your role does not have access to this', code: 'FORBIDDEN' });
    return;
  }
  next();
}

reportsRouter.get('/summary', requireAuth, requireActiveUser, loadBusiness, canReadReports, async (req: ReportsRequest, res) => {
  const parsed = parsePeriodQuery(req.query as Record<string, unknown>);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const businessId = req.member!.business_id as string;
  const tz = safeTimezone(req.business?.timezone);
  const { from, to, days } = await periodBounds(parsed.period, tz, parsed.custom);
  const params = [businessId, from, to];
  const dayParams = [...params, tz];

  const [salesRow, cogsRow, expenseRow, collectedRow, outstandingRow, salesDays, expenseDays, methods, products, categories, closings] = await Promise.all([
    q(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
       FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= $2 AND sale_date < $3`,
      params,
    ),
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
    q(
      `SELECT to_char(sale_date AT TIME ZONE $4, 'YYYY-MM-DD') AS day, COALESCE(SUM(total_amount), 0) AS total
       FROM sales WHERE business_id = $1 AND voided = false AND sale_date >= $2 AND sale_date < $3
       GROUP BY day`,
      dayParams,
    ),
    q(
      `SELECT to_char(expense_date AT TIME ZONE $4, 'YYYY-MM-DD') AS day, COALESCE(SUM(amount), 0) AS total
       FROM expenses WHERE business_id = $1 AND expense_date >= $2 AND expense_date < $3
       GROUP BY day`,
      dayParams,
    ),
    q(
      `SELECT COALESCE(NULLIF(payment_method, ''), 'other') AS method, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE business_id = $1 AND type IN ('customer_payment', 'sale_payment')
         AND payment_date >= $2 AND payment_date < $3
       GROUP BY 1 ORDER BY total DESC`,
      params,
    ),
    q(
      `SELECT COALESCE(p.name, 'Unknown product') AS product, COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.total_amount), 0) AS total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.business_id = si.business_id
       LEFT JOIN products p ON p.id = si.product_id AND p.business_id = si.business_id
       WHERE si.business_id = $1 AND s.voided = false AND s.sale_date >= $2 AND s.sale_date < $3
       GROUP BY 1 ORDER BY total DESC LIMIT 10`,
      params,
    ),
    q(
      `SELECT COALESCE(c.name, 'Uncategorized') AS category, COALESCE(SUM(si.total_amount), 0) AS total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.business_id = si.business_id
       LEFT JOIN products p ON p.id = si.product_id AND p.business_id = si.business_id
       LEFT JOIN categories c ON c.id = p.category_id AND c.business_id = si.business_id
       WHERE si.business_id = $1 AND s.voided = false AND s.sale_date >= $2 AND s.sale_date < $3
       GROUP BY 1 ORDER BY total DESC`,
      params,
    ),
    q(
      `SELECT id, to_char(business_date, 'YYYY-MM-DD') AS business_date, session_number, status, total_sales, gross_profit,
              expenses, net_profit, expected_cash, actual_cash, cash_variance
       FROM daily_closings
       WHERE business_id = $1
         AND business_date >= ($2::timestamptz AT TIME ZONE $4)::date
         AND business_date < ($3::timestamptz AT TIME ZONE $4)::date
       ORDER BY business_date DESC, session_number DESC LIMIT 400`,
      dayParams,
    ),
  ]);

  const salesTotal = num(salesRow[0].total);
  const cogs = num(cogsRow[0].cogs);
  const expenses = num(expenseRow[0].total);
  const grossProfit = salesTotal - cogs;

  const salesByDay = new Map(salesDays.map((row) => [row.day as string, num(row.total)]));
  const expensesByDay = new Map(expenseDays.map((row) => [row.day as string, num(row.total)]));
  const dayMs = 24 * 60 * 60 * 1000;
  const daily = Array.from({ length: days }, (_, index) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(from.getTime() + index * dayMs + 12 * 60 * 60 * 1000));
    return { day, sales: salesByDay.get(day) ?? 0, expenses: expensesByDay.get(day) ?? 0 };
  });

  const closingMoney = ['total_sales', 'gross_profit', 'expenses', 'net_profit', 'expected_cash', 'actual_cash', 'cash_variance'];
  res.json({
    period: parsed.period,
    range: { from, to, days, timezone: tz },
    kpis: {
      sales_total: salesTotal,
      sales_count: num(salesRow[0].count),
      cogs,
      gross_profit: grossProfit,
      expenses,
      net_profit: grossProfit - expenses,
      cash_collected: num(collectedRow[0].total),
      outstanding_debt: num(outstandingRow[0].total),
    },
    daily,
    payment_methods: methods.map((row) => ({ method: row.method as string, count: num(row.count), total: num(row.total) })),
    products: products.map((row) => ({ product: row.product as string, quantity: num(row.quantity), total: num(row.total) })),
    categories: categories.map((row) => ({ category: row.category as string, total: num(row.total) })),
    closings: closings.map((row) => ({
      ...row,
      session_number: num(row.session_number),
      ...Object.fromEntries(closingMoney.map((key) => [key, num(row[key])])),
    })),
  });
});
