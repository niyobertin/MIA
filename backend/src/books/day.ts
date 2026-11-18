import {
  calculateCashVariance,
  calculateExpectedCash,
  calculateGrossProfit,
  calculateNetProfit,
  salesRevenue,
} from '../shared/calculations';
import { audit, BooksError, businessToday, Ctx, newId, num, one, rows } from './core';
import { getOpenSession, requireOpenSession } from './session';
import { stockSnapshot, trackedBalances } from './stock';
import { convertOpenTabsToDebt } from './waiter';

const asMoney = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

/** Mirrors the phone's useStartDay + captureOpeningStock. */
export async function openDay(ctx: Ctx, input: { openingCash: number; notes?: string | null }) {
  if (await getOpenSession(ctx)) throw new BooksError('DAY_ALREADY_OPEN', 409);
  const snapshot = await stockSnapshot(ctx);
  const next = await one<{ n: string }>(ctx, `SELECT COALESCE(MAX(session_number), 0) + 1 AS n FROM daily_closings WHERE business_id = $1`, [ctx.businessId]);
  const id = newId();
  const day = businessToday(ctx.timezone);
  await ctx.tx.query(
    `INSERT INTO daily_closings (id, business_id, business_date, session_number, opening_cash, cash_sales, customer_cash_payments,
       other_cash_income, cash_purchases, cash_expenses, supplier_cash_payments, withdrawals, expected_cash, actual_cash, cash_variance,
       total_sales, cogs, gross_profit, expenses, net_profit, opening_stock_qty, opening_stock_value, closing_stock_qty, closing_stock_value,
       notes, opened_by, opened_at, closed_by, closed_at, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,0,0,0,0,0,0,0,$5,0,0,0,0,0,0,0,$6,$7,0,0,$8,$9,now(),NULL,NULL,'open',now(),now())`,
    [id, ctx.businessId, day, num(next?.n), asMoney(input.openingCash), asMoney(snapshot.quantity), asMoney(snapshot.value), input.notes ?? null, ctx.userId],
  );
  for (const row of await trackedBalances(ctx)) {
    await ctx.tx.query(
      `INSERT INTO daily_stock_lines (id, business_id, daily_closing_id, business_date, product_id, opening_qty, opening_unit_cost,
         closing_qty, closing_unit_cost, counted_qty, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL,now(),now())`,
      [newId(), ctx.businessId, id, day, row.product_id, asMoney(row.balance), asMoney(row.average_cost)],
    );
  }
  await audit(ctx, { action: 'day.open', entity: 'daily_closing', entityId: id, after: { business_date: day, opening_cash: input.openingCash } });
  return { id, business_date: day, session_number: num(next?.n) };
}

async function sum(ctx: Ctx, sql: string, params: unknown[]): Promise<number> {
  const row = await one<{ total: string }>(ctx, sql, params);
  return num(row?.total);
}

/** The same session totals the phone works out in calculateSessionFinancials and calculateCashReconciliationForSession. */
export async function sessionTotals(ctx: Ctx, sessionId: string) {
  const p = [ctx.businessId, sessionId];
  const payType = (type: string) =>
    sum(ctx, `SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE business_id=$1 AND session_id=$2 AND type='${type}' AND payment_method='cash'`, p);
  const inOrder = async <T extends unknown[]>(tasks: { [K in keyof T]: () => Promise<T[K]> }): Promise<T> => {
    const out: unknown[] = [];
    for (const task of tasks) out.push(await task());
    return out as T;
  };
  const [totalSales, tax, cogs, expenses, inventoryLoss, split, customerCash, otherCash, cashPurchases, cashExpenses, supplierCash, withdrawals] =
    await inOrder<[number, number, number, number, number, { cash: string; mobile_money: string; bank: string; credit: string } | null, number, number, number, number, number, number]>([
      () => sum(ctx, `SELECT COALESCE(SUM(total_amount),0) AS total FROM sales WHERE business_id=$1 AND voided=false AND session_id=$2`, p),
      () => sum(ctx, `SELECT COALESCE(SUM(tax_amount),0) AS total FROM sales WHERE business_id=$1 AND voided=false AND session_id=$2`, p),
      () => sum(ctx, `SELECT COALESCE(SUM(i.quantity * i.unit_cost),0) AS total FROM sale_items i JOIN sales s ON s.id=i.sale_id AND s.business_id=i.business_id
                WHERE s.business_id=$1 AND s.voided=false AND s.session_id=$2`, p),
      () => sum(ctx, `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE business_id=$1 AND session_id=$2`, p),
      () => sum(ctx, `SELECT COALESCE(SUM(CASE WHEN type IN ('damaged','adjustment_out') THEN quantity*unit_cost ELSE 0 END),0)
                     - COALESCE(SUM(CASE WHEN type='adjustment_in' THEN quantity*unit_cost ELSE 0 END),0) AS total
                FROM stock_movements WHERE business_id=$1 AND session_id=$2`, p),
      () => one<{ cash: string; mobile_money: string; bank: string; credit: string }>(
        ctx,
        `SELECT COALESCE(SUM(cash),0) AS cash, COALESCE(SUM(mobile_money),0) AS mobile_money, COALESCE(SUM(bank),0) AS bank,
                COALESCE(SUM(GREATEST(total_amount - cash - mobile_money - bank, 0)),0) AS credit
         FROM (SELECT s.total_amount,
                      COALESCE(SUM(CASE WHEN p.payment_method='cash' THEN p.amount ELSE 0 END),0) AS cash,
                      COALESCE(SUM(CASE WHEN p.payment_method='mobile_money' THEN p.amount ELSE 0 END),0) AS mobile_money,
                      COALESCE(SUM(CASE WHEN p.payment_method='bank' THEN p.amount ELSE 0 END),0) AS bank
               FROM sales s LEFT JOIN payments p ON p.business_id=s.business_id AND p.type='sale_payment' AND p.reference_type='sale' AND p.reference_id=s.id
               WHERE s.business_id=$1 AND s.voided=false AND s.session_id=$2 GROUP BY s.id) t`,
        p,
      ),
      () => payType('customer_payment'),
      () => payType('other_income'),
      () => sum(ctx, `SELECT COALESCE(SUM(pay.amount),0) AS total FROM purchases pr JOIN payments pay ON pay.reference_type='purchase' AND pay.reference_id=pr.id AND pay.business_id=pr.business_id
                WHERE pr.business_id=$1 AND pr.session_id=$2 AND pr.status<>'cancelled' AND pay.type='purchase_payment' AND pay.payment_method='cash'`, p),
      () => sum(ctx, `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE business_id=$1 AND session_id=$2 AND payment_method='cash'`, p),
      () => payType('supplier_payment'),
      () => payType('withdrawal'),
    ]);
  const revenue = salesRevenue(totalSales, tax);
  const grossProfit = calculateGrossProfit(revenue, cogs);
  return {
    totalSales,
    cogs,
    grossProfit,
    expenses,
    netProfit: calculateNetProfit(grossProfit, expenses, inventoryLoss),
    cashSales: num(split?.cash),
    momoSales: num(split?.mobile_money),
    bankSales: num(split?.bank),
    creditSales: num(split?.credit),
    customerCashPayments: customerCash,
    otherCashIncome: otherCash,
    cashPurchases,
    cashExpenses,
    supplierCashPayments: supplierCash,
    withdrawals,
  };
}

export async function daySummary(ctx: Ctx) {
  const session = await getOpenSession(ctx);
  if (!session) return { open: false as const };
  const closing = await one<{ opening_cash: string }>(ctx, `SELECT opening_cash FROM daily_closings WHERE id = $1`, [session.id]);
  const openingCash = num(closing?.opening_cash);
  const totals = await sessionTotals(ctx, session.id);
  const expectedCash = calculateExpectedCash(
    openingCash, totals.cashSales, totals.customerCashPayments, totals.otherCashIncome,
    totals.cashPurchases, totals.cashExpenses, totals.supplierCashPayments, totals.withdrawals,
  );
  const openTabs = await one<{ n: string }>(ctx, `SELECT COUNT(*) AS n FROM waiter_tabs WHERE business_id=$1 AND session_id=$2 AND status IN ('draft','partial')`, [ctx.businessId, session.id]);
  const lines = await rows<{ product_id: string; name: string; unit: string; opening_qty: string; counted_qty: string | null }>(
    ctx,
    `SELECT l.product_id, p.name, p.unit, l.opening_qty, l.counted_qty FROM daily_stock_lines l
     JOIN products p ON p.id = l.product_id AND p.business_id = l.business_id
     WHERE l.business_id = $1 AND l.daily_closing_id = $2 ORDER BY p.name`,
    [ctx.businessId, session.id],
  );
  const live = new Map((await trackedBalances(ctx)).map((row) => [row.product_id, row]));
  return {
    open: true as const,
    session: { ...session, opening_cash: openingCash },
    totals,
    expectedCash,
    openWaiterTabs: num(openTabs?.n),
    stock: lines.map((line) => ({
      product_id: line.product_id,
      name: line.name,
      unit: line.unit,
      opening_qty: num(line.opening_qty),
      book_qty: live.get(line.product_id)?.balance ?? num(line.opening_qty),
      unit_cost: live.get(line.product_id)?.average_cost ?? 0,
      counted_qty: line.counted_qty == null ? null : num(line.counted_qty),
    })),
  };
}

/** Physical count by owner/manager; like the phone it never changes the movement ledger by itself. */
export async function recordCount(ctx: Ctx, productId: string, counted: number) {
  if (!Number.isInteger(counted) || counted < 0) throw new BooksError('INVALID_QUANTITY');
  const session = await requireOpenSession(ctx);
  const line = await one<{ id: string; opening_qty: string; closing_qty: string | null }>(
    ctx,
    `SELECT id, opening_qty, closing_qty FROM daily_stock_lines WHERE business_id=$1 AND daily_closing_id=$2 AND product_id=$3`,
    [ctx.businessId, session.id, productId],
  );
  if (!line) throw new BooksError('NOT_FOUND', 404);
  await ctx.tx.query(`UPDATE daily_stock_lines SET counted_qty=$3, updated_at=now() WHERE business_id=$1 AND id=$2`, [ctx.businessId, line.id, counted]);
  await audit(ctx, { action: 'stock.count', entity: 'daily_stock_line', entityId: line.id, before: { book_qty: num(line.closing_qty ?? line.opening_qty) }, after: { counted_qty: counted } });
}

/** Mirrors the phone's useCloseDay: open waiter tabs become debt, then cash, profit and stock are sealed. */
export async function closeDay(ctx: Ctx, input: { actualCash: number; notes?: string | null }) {
  const session = await requireOpenSession(ctx);
  await convertOpenTabsToDebt(ctx, session.id);
  const closing = await one<{ opening_cash: string; opening_stock_qty: string | null; opening_stock_value: string | null; opened_by: string | null }>(
    ctx, `SELECT opening_cash, opening_stock_qty, opening_stock_value, opened_by FROM daily_closings WHERE id=$1`, [session.id],
  );
  const openingCash = num(closing?.opening_cash);
  const totals = await sessionTotals(ctx, session.id);
  const expectedCash = calculateExpectedCash(
    openingCash, totals.cashSales, totals.customerCashPayments, totals.otherCashIncome,
    totals.cashPurchases, totals.cashExpenses, totals.supplierCashPayments, totals.withdrawals,
  );
  const variance = calculateCashVariance(input.actualCash, expectedCash);
  const snapshot = await stockSnapshot(ctx);

  const balances = await trackedBalances(ctx);
  const known = new Set(
    (await rows<{ product_id: string }>(ctx, `SELECT product_id FROM daily_stock_lines WHERE business_id=$1 AND daily_closing_id=$2`, [ctx.businessId, session.id]))
      .map((r) => r.product_id),
  );
  for (const row of balances) {
    if (known.has(row.product_id)) {
      await ctx.tx.query(
        `UPDATE daily_stock_lines SET closing_qty=$4, closing_unit_cost=$5, updated_at=now()
         WHERE business_id=$1 AND daily_closing_id=$2 AND product_id=$3 AND closing_qty IS NULL`,
        [ctx.businessId, session.id, row.product_id, asMoney(row.balance), asMoney(row.average_cost)],
      );
    } else {
      await ctx.tx.query(
        `INSERT INTO daily_stock_lines (id, business_id, daily_closing_id, business_date, product_id, opening_qty, opening_unit_cost, closing_qty, closing_unit_cost, counted_qty, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,0,$6,$7,$6,NULL,now(),now())`,
        [newId(), ctx.businessId, session.id, session.business_date, row.product_id, asMoney(row.average_cost), asMoney(row.balance)],
      );
    }
  }
  await ctx.tx.query(
    `UPDATE daily_closings SET opening_cash=$3, cash_sales=$4, customer_cash_payments=$5, other_cash_income=$6, cash_purchases=$7,
       cash_expenses=$8, supplier_cash_payments=$9, withdrawals=$10, expected_cash=$11, actual_cash=$12, cash_variance=$13,
       total_sales=$14, cogs=$15, gross_profit=$16, expenses=$17, net_profit=$18,
       opening_stock_qty=COALESCE(opening_stock_qty,$19), opening_stock_value=COALESCE(opening_stock_value,$20),
       closing_stock_qty=$19, closing_stock_value=$20, notes=$21, closed_by=$22, closed_at=now(),
       opened_by=COALESCE(opened_by,$22), opened_at=COALESCE(opened_at,now()), status='closed', updated_at=now()
     WHERE business_id=$1 AND id=$2`,
    [
      ctx.businessId, session.id, asMoney(openingCash), asMoney(totals.cashSales), asMoney(totals.customerCashPayments),
      asMoney(totals.otherCashIncome), asMoney(totals.cashPurchases), asMoney(totals.cashExpenses), asMoney(totals.supplierCashPayments),
      asMoney(totals.withdrawals), asMoney(expectedCash), asMoney(input.actualCash), asMoney(variance), asMoney(totals.totalSales),
      asMoney(totals.cogs), asMoney(totals.grossProfit), asMoney(totals.expenses), asMoney(totals.netProfit),
      asMoney(snapshot.quantity), asMoney(snapshot.value), input.notes ?? null, ctx.userId,
    ],
  );
  await audit(ctx, {
    action: 'day.close', entity: 'daily_closing', entityId: session.id,
    after: { expected_cash: asMoney(expectedCash), actual_cash: asMoney(input.actualCash), cash_variance: asMoney(variance), net_profit: asMoney(totals.netProfit) },
  });
  return { id: session.id, expectedCash, actualCash: input.actualCash, variance, totals };
}
