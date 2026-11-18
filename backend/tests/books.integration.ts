import 'reflect-metadata';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import type { AddressInfo } from 'net';

dotenv.config();

const results: { name: string; pass: boolean; detail?: unknown }[] = [];
function check(name: string, pass: boolean, detail?: unknown) {
  results.push({ name, pass, detail });
}

let port = 0;
let ipCounter = 0;
type Res = { status: number; body: any };

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  ipCounter += 1;
  const response = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.2.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!/\/[a-z0-9_]*_test$/.test(databaseUrl)) throw new Error('Refusing to run: DATABASE_URL must end in _test.');

  const { AppDataSource, initDatabase } = await import('../src/data-source');
  const { User, Business } = await import('../src/entities');
  const { hashPassword } = await import('../src/lib/auth');
  const { authRouter } = await import('../src/routes/auth');
  const { dashboardRouter } = await import('../src/routes/dashboard');
  const { calculateExpectedCash, foldAverageCost } = await import('../src/shared/calculations');

  await initDatabase({ synchronize: true });
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/dashboard', dashboardRouter);
  const server = app.listen(0);
  port = (server.address() as AddressInfo).port;

  const now = new Date();
  const ids = { bizA: randomUUID(), bizB: randomUUID(), owner: randomUUID(), cashier: randomUUID(), staff: randomUUID(), ownerB: randomUUID() };
  const base = { timezone: 'Africa/Kigali', currency: 'RWF', country: 'Rwanda', created_at: now, updated_at: now };
  await AppDataSource.getRepository(Business).save([
    { id: ids.bizA, name: 'Bar A', business_code: 'BAR-A', ...base },
    { id: ids.bizB, name: 'Bar B', business_code: 'BAR-B', ...base },
  ]);
  const pin = await hashPassword('7391');
  const user = (id: string, business_id: string, role: string, email: string) => ({ id, business_id, role, email, name: email.split('@')[0], password_hash: pin, active: true, created_at: now, updated_at: now });
  await AppDataSource.getRepository(User).save([
    user(ids.owner, ids.bizA, 'OWNER', 'owner@bar.test'),
    user(ids.cashier, ids.bizA, 'CASHIER', 'cashier@bar.test'),
    user(ids.staff, ids.bizA, 'STAFF', 'waiter@bar.test'),
    user(ids.ownerB, ids.bizB, 'OWNER', 'ownerb@bar.test'),
  ] as any);
  const token = async (email: string) => (await call('POST', '/auth/login', undefined, { email, password: '7391' })).body.token as string;
  const owner = await token('owner@bar.test');
  const cashier = await token('cashier@bar.test');
  const staff = await token('waiter@bar.test');
  const ownerB = await token('ownerb@bar.test');
  check('everyone can sign in', [owner, cashier, staff, ownerB].every(Boolean));

  const q = (sql: string, params: unknown[] = []) => AppDataSource.query(sql, params) as Promise<any[]>;
  const stockOf = async (productId: string) =>
    Number((await q(`SELECT COALESCE(SUM(CASE WHEN type IN ('opening','purchase','return_in','adjustment_in') THEN quantity ELSE -quantity END),0) AS s FROM stock_movements WHERE product_id=$1`, [productId]))[0].s);

  // Lists
  let res = await call('POST', '/dashboard/products', cashier, { name: 'Primus', selling_price: 1000 });
  check('a cashier cannot add products', res.status === 403, res.status);
  res = await call('POST', '/dashboard/products', owner, { name: 'Primus', selling_price: 1000, opening_qty: 10, opening_cost: 500 });
  check('opening stock needs an open day', res.status === 400 && res.body.code === 'DAY_CLOSED', res.body);
  res = await call('POST', '/dashboard/products', owner, { name: 'Primus', selling_price: 1000 });
  const primus = res.body.id as string;
  check('owner adds a product', res.status === 201 && Boolean(primus), res.body);
  res = await call('POST', '/dashboard/products', owner, { name: 'primus', selling_price: 900 });
  check('product names must be unique', res.status === 409, res.status);

  res = await call('POST', '/dashboard/sales', cashier, { payment_method: 'cash', items: [{ product_id: primus, quantity: 1, selling_price: 1000 }] });
  check('no sales before the day is open', res.status === 400 && res.body.code === 'DAY_CLOSED', res.body);
  res = await call('POST', '/dashboard/day/open', staff, { opening_cash: 0 });
  check('staff cannot open the day', res.status === 403, res.status);
  res = await call('POST', '/dashboard/day/open', cashier, { opening_cash: 20000 });
  check('a cashier can open the day', res.status === 201, res.body);
  res = await call('POST', '/dashboard/day/open', owner, { opening_cash: 0 });
  check('only one day can be open', res.status === 409, res.status);

  res = await call('POST', '/dashboard/products', owner, { name: 'Mutzig', selling_price: 1500, opening_qty: 10, opening_cost: 800 });
  const mutzig = res.body.id as string;
  check('product with opening stock', res.status === 201 && (await stockOf(mutzig)) === 10, res.body);
  await call('POST', '/dashboard/stock/adjust', owner, { product_id: primus, kind: 'adjustment_in', quantity: 10, reason: 'Count fix' });

  const supplier = (await call('POST', '/dashboard/suppliers', cashier, { name: 'Bralirwa', phone: '0788000000' })).body.id as string;
  check('a cashier can add a supplier', Boolean(supplier));
  res = await call('POST', '/dashboard/purchases', cashier, { supplier_id: supplier, payment_method: 'cash', items: [{ product_id: mutzig, quantity: 10, unit_cost: 1000 }] });
  check('stock-in for cash', res.status === 201 && res.body.total === 10000, res.body);
  const mutzigCost = Number((await q(`SELECT average_cost FROM products WHERE id=$1`, [mutzig]))[0].average_cost);
  const expectedCost = foldAverageCost([{ type: 'opening', quantity: 10, unit_cost: 800 }, { type: 'purchase', quantity: 10, unit_cost: 1000 }]);
  check('average cost matches the app formula', mutzigCost === expectedCost && mutzigCost === 900, { mutzigCost, expectedCost });
  res = await call('POST', '/dashboard/purchases', owner, { supplier_id: supplier, payment_method: 'credit', items: [{ product_id: mutzig, quantity: 2, unit_cost: 900 }] });
  const creditPurchase = res.body.id as string;
  res = await call('POST', '/dashboard/payments/supplier', owner, { supplier_id: supplier, amount: 1000, method: 'cash' });
  check('supplier payment', res.status === 201 && res.body.remaining === 800, res.body);
  const purchaseRow = (await q(`SELECT paid_amount, status FROM purchases WHERE id=$1`, [creditPurchase]))[0];
  check('supplier payment settles the credit stock-in', Number(purchaseRow.paid_amount) === 1000 && purchaseRow.status === 'pending', purchaseRow);

  // Sales
  res = await call('POST', '/dashboard/sales', staff, { payment_method: 'cash', items: [{ product_id: primus, quantity: 1, selling_price: 1000 }] });
  check('staff cannot sell from the web', res.status === 403, res.status);
  res = await call('POST', '/dashboard/sales', cashier, { payment_method: 'cash', items: [{ product_id: primus, quantity: 3, selling_price: 5 }] });
  const cashSale = res.body;
  check('cashier sale uses the shelf price', res.status === 201 && cashSale.total === 3000, res.body);
  check('cash sale lowers stock', (await stockOf(primus)) === 7);
  const salePay = await q(`SELECT amount, payment_method FROM payments WHERE reference_id=$1 AND type='sale_payment'`, [cashSale.id]);
  check('cash sale records the payment', salePay.length === 1 && Number(salePay[0].amount) === 3000, salePay);
  res = await call('POST', '/dashboard/sales', cashier, { payment_method: 'cash', items: [{ product_id: primus, quantity: 99, selling_price: 1000 }] });
  check('cannot sell more than in stock', res.status === 409 && res.body.code === 'INSUFFICIENT_STOCK', res.body);
  res = await call('POST', '/dashboard/sales', owner, { payment_method: 'cash', items: [{ product_id: mutzig, quantity: 1, selling_price: 500 }] });
  check('below-cost price needs a confirm', res.status === 409 && res.body.code === 'BELOW_COST', res.body);
  res = await call('POST', '/dashboard/sales', owner, { payment_method: 'mobile_money', allow_below_cost: true, items: [{ product_id: mutzig, quantity: 1, selling_price: 500 }] });
  check('owner can confirm a below-cost sale', res.status === 201, res.body);

  res = await call('POST', '/dashboard/sales', cashier, { payment_method: 'credit', items: [{ product_id: primus, quantity: 1, selling_price: 1000 }] });
  check('credit needs a customer', res.body.code === 'CUSTOMER_REQUIRED', res.body);
  const limited = (await call('POST', '/dashboard/customers', owner, { name: 'Jado', credit_limit: 1500 })).body.id as string;
  res = await call('POST', '/dashboard/sales', cashier, { payment_method: 'credit', customer_id: limited, items: [{ product_id: primus, quantity: 2, selling_price: 1000 }] });
  check('credit limit is enforced', res.body.code === 'CREDIT_LIMIT', res.body);
  const grace = (await call('POST', '/dashboard/customers', cashier, { name: 'Grace', phone: '0788111222' })).body.id as string;
  res = await call('PATCH', `/dashboard/customers/${grace}`, cashier, { credit_limit: 99999 });
  check('a cashier cannot change credit limits', res.status === 403, res.status);
  res = await call('POST', '/dashboard/sales', cashier, { payment_method: 'credit', customer_id: grace, items: [{ product_id: primus, quantity: 2, selling_price: 1000 }] });
  const creditSale = res.body.id as string;
  check('credit sale', res.status === 201 && res.body.paid === 0, res.body);
  res = await call('POST', '/dashboard/payments/customer', cashier, { customer_id: grace, amount: 3000, method: 'cash' });
  check('cannot take more than is owed', res.body.code === 'OVERPAYMENT', res.body);
  res = await call('POST', '/dashboard/payments/customer', cashier, { customer_id: grace, amount: 1500, method: 'cash' });
  const graceSale = (await q(`SELECT paid_amount, payment_status FROM sales WHERE id=$1`, [creditSale]))[0];
  check('debt payment settles the sale', res.status === 201 && Number(graceSale.paid_amount) === 1500 && graceSale.payment_status === 'partial', graceSale);

  // Voids and tenancy
  res = await call('POST', `/dashboard/sales/${cashSale.id}/void`, cashier, { reason: 'Mistake' });
  check('a cashier cannot void', res.status === 403, res.status);
  res = await call('POST', `/dashboard/sales/${cashSale.id}/void`, ownerB, { reason: 'Mistake' });
  check('another business cannot void this sale', res.status === 404, res.status);
  res = await call('POST', `/dashboard/sales/${cashSale.id}/void`, owner, { reason: 'Wrong item' });
  check('owner voids a sale and stock comes back', res.status === 200 && (await stockOf(primus)) === 8, res.body);
  res = await call('POST', `/dashboard/sales/${cashSale.id}/void`, owner, { reason: 'Again' });
  check('cannot void twice', res.status === 409, res.status);
  res = await call('PATCH', `/dashboard/products/${primus}`, ownerB, { active: false });
  check('another business cannot edit this product', res.status === 404, res.status);

  // Expenses
  res = await call('POST', '/dashboard/expenses', cashier, { category: 'transport', amount: 700, payment_method: 'cash' });
  const expenseId = res.body.id as string;
  check('cashier records an expense', res.status === 201, res.body);
  res = await call('PATCH', `/dashboard/expenses/${expenseId}`, owner, { amount: 800 });
  const expensePay = (await q(`SELECT amount FROM payments WHERE reference_id=$1 AND type='expense_payment'`, [expenseId]))[0];
  check('editing an expense updates its payment', res.status === 200 && Number(expensePay.amount) === 800, expensePay);

  // Waiter tabs
  res = await call('POST', '/dashboard/waiter-tabs', cashier, { waiter_id: ids.staff, items: [{ product_id: primus, quantity: 1 }] });
  check('a cashier cannot manage waiter tabs', res.status === 403, res.status);
  res = await call('POST', '/dashboard/waiter-tabs', owner, { waiter_id: ids.staff, client_label: 'Table 4', items: [{ product_id: primus, quantity: 2 }] });
  const tabId = res.body.id as string;
  check('issue to a waiter', res.status === 201 && res.body.joinedExisting === false, res.body);
  res = await call('POST', '/dashboard/waiter-tabs', owner, { waiter_id: ids.staff, client_label: 'table 4', items: [{ product_id: mutzig, quantity: 1 }] });
  check('issuing again joins the open tab', res.body.id === tabId && res.body.joinedExisting === true, res.body);
  let tab = (await call('GET', `/dashboard/waiter-tabs/${tabId}`, owner)).body;
  const mutzigLine = tab.items.find((i: any) => i.product_id === mutzig);
  res = await call('POST', `/dashboard/waiter-tabs/${tabId}/payments`, owner, { amount: 1500, method: 'cash', item_ids: [mutzigLine.id] });
  tab = (await call('GET', `/dashboard/waiter-tabs/${tabId}`, owner)).body;
  const paidLine = tab.items.find((i: any) => i.id === mutzigLine.id);
  const primusLine = tab.items.find((i: any) => i.product_id === primus);
  check('ticked item is marked paid', res.status === 200 && paidLine.paid_amount === 1500 && primusLine.paid_amount === 0, tab.items);
  check('tab balance after payment', tab.balance === 2000 && tab.status === 'partial', tab);

  // Close day
  res = await call('POST', '/dashboard/day/close', cashier, { actual_cash: 0 });
  check('a cashier cannot close the day', res.status === 403, res.status);
  const day = (await call('GET', '/dashboard/day', owner)).body;
  const expected = calculateExpectedCash(20000, day.totals.cashSales, day.totals.customerCashPayments, 0, day.totals.cashPurchases, day.totals.cashExpenses, day.totals.supplierCashPayments, 0);
  check('expected cash uses the app formula', day.expectedCash === expected, { expectedCash: day.expectedCash, expected, totals: day.totals });
  check('expected cash adds up by hand', day.expectedCash === 20000 + 0 + 1500 + 1500 - 10000 - 800 - 1000, day.expectedCash);
  res = await call('POST', '/dashboard/day/close', owner, { actual_cash: day.expectedCash - 300 });
  check('owner closes the day', res.status === 200 && res.body.variance === -300, res.body);
  const tabAfter = (await q(`SELECT status, sale_id FROM waiter_tabs WHERE id=$1`, [tabId]))[0];
  check('open waiter tab becomes debt at close', tabAfter.status === 'debt' && Boolean(tabAfter.sale_id), tabAfter);
  const closing = (await q(`SELECT status, expected_cash, actual_cash, cash_variance FROM daily_closings WHERE business_id=$1 ORDER BY session_number DESC LIMIT 1`, [ids.bizA]))[0];
  check('closing row is sealed', closing.status === 'closed' && Number(closing.cash_variance) === -300, closing);
  const sealed = await q(`SELECT COUNT(*) AS n FROM daily_stock_lines WHERE business_id=$1 AND closing_qty IS NOT NULL`, [ids.bizA]);
  check('closing stock lines are sealed', Number(sealed[0].n) >= 2, sealed);
  res = await call('POST', '/dashboard/sales', cashier, { payment_method: 'cash', items: [{ product_id: primus, quantity: 1, selling_price: 1000 }] });
  check('no sales after close', res.body.code === 'DAY_CLOSED', res.body);
  res = await call('POST', `/dashboard/sales/${creditSale}/void`, owner, { reason: 'Late' });
  check('closed days cannot be changed', res.status === 409 || res.status === 400, res.body);
  const audits = await q(`SELECT DISTINCT action FROM audit_logs WHERE business_id=$1`, [ids.bizA]);
  const actions = new Set(audits.map((a) => a.action));
  check('actions are in the activity log', ['sale.create', 'sale.void', 'purchase.create', 'day.open', 'day.close', 'waiter.issue', 'payment.customer'].every((a) => actions.has(a)), [...actions]);
  const leak = await q(`SELECT COUNT(*) AS n FROM sales WHERE business_id=$1`, [ids.bizB]);
  check('nothing was written to the other business', Number(leak[0].n) === 0, leak);

  server.close();
  await AppDataSource.destroy();
  const failed = results.filter((r) => !r.pass);
  for (const f of failed) console.log(`FAIL  ${f.name}  ${JSON.stringify(f.detail) ?? ''}`);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
