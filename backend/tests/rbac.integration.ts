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
type Res = { status: number; body: any; text: string };

async function call(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<Res> {
  ipCounter += 1;
  const response = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  for (const secret of ['password_hash', 'code_hash', 'totp_secret']) {
    if (text.includes(secret)) check(`no ${secret} leaked by ${method} ${path}`, false, text.slice(0, 200));
  }
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, text };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!/\/[a-z0-9_]*_test$/.test(databaseUrl)) {
    throw new Error('Refusing to run: DATABASE_URL must point at a database whose name ends in _test.');
  }
  process.env.PLATFORM_REQUIRE_2FA = 'true';

  const { AppDataSource, initDatabase } = await import('../src/data-source');
  const entities = await import('../src/entities');
  const { hashPassword } = await import('../src/lib/auth');
  const { totpCode, currentTotpStep } = await import('../src/lib/totp');
  const { authRouter } = await import('../src/routes/auth');
  const { syncRouter } = await import('../src/routes/sync');
  const { dashboardRouter } = await import('../src/routes/dashboard');
  const { platformRouter } = await import('../src/routes/platform');
  const { seedPlatformAdmins } = await import('../src/scripts/seedPlatformAdmins');
  const { User, Business, Product, Category, Sale, SaleItem, Expense, Payment, StockMovement, Customer, AuditLog, PlatformAuditLog } = entities;

  await initDatabase({ synchronize: true });
  const log = console.log;
  console.log = () => undefined;
  await seedPlatformAdmins();
  console.log = log;

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/sync', syncRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/platform', platformRouter);
  const server = app.listen(0);
  port = (server.address() as AddressInfo).port;

  const now = new Date();
  const ids = {
    bizA: randomUUID(), bizB: randomUUID(),
    ownerA: randomUUID(), managerA: randomUUID(), cashierA: randomUUID(), staffA: randomUUID(), ownerB: randomUUID(), loner: randomUUID(),
    catA: randomUUID(), prodA: randomUUID(), prodB: randomUUID(), custA: randomUUID(),
  };
  const repo = <T extends object>(entity: new () => T) => AppDataSource.getRepository(entity);
  const pinHash = await hashPassword('7391');
  const base = { timezone: 'Africa/Kigali', currency: 'RWF', country: 'Rwanda', created_at: now, updated_at: now };
  await repo(Business).save([
    { id: ids.bizA, name: 'Shop A', business_code: 'SHOP-A', ...base },
    { id: ids.bizB, name: 'Shop B', business_code: 'SHOP-B', ...base },
  ]);
  const makeUser = (id: string, business_id: string | null, role: any, email: string) => ({
    id, business_id, role, email, name: email, password_hash: pinHash, active: true, created_at: now, updated_at: now,
  });
  await repo(User).save([
    makeUser(ids.ownerA, ids.bizA, 'OWNER', 'owner-a@example.test'),
    makeUser(ids.managerA, ids.bizA, 'MANAGER', 'manager-a@example.test'),
    makeUser(ids.cashierA, ids.bizA, 'CASHIER', 'cashier-a@example.test'),
    makeUser(ids.staffA, ids.bizA, 'STAFF', 'staff-a@example.test'),
    makeUser(ids.ownerB, ids.bizB, 'OWNER', 'owner-b@example.test'),
    makeUser(ids.loner, null, null, 'loner@example.test'),
  ]);
  await repo(Category).save({ id: ids.catA, business_id: ids.bizA, name: 'Drinks', active: true, created_at: now, updated_at: now } as any);
  const product = (id: string, business_id: string, name: string) => ({
    id, business_id, name, category_id: business_id === ids.bizA ? ids.catA : null, unit: 'pcs', selling_price: 1000, average_cost: 600,
    reorder_level: 5, track_inventory: true, active: true, created_at: now, updated_at: now,
  });
  await repo(Product).save([product(ids.prodA, ids.bizA, 'Soda A'), product(ids.prodB, ids.bizB, 'Soda B')] as any);
  await repo(Customer).save({ id: ids.custA, business_id: ids.bizA, name: 'Grace', credit_limit: 0, active: true, created_at: now, updated_at: now } as any);
  const device = 'test';
  const movement = (business_id: string, product_id: string, type: string, quantity: number, created_by: string) => ({
    id: randomUUID(), business_id, product_id, type, quantity, unit_cost: 600, occurred_at: now, previous_quantity: 0, new_quantity: 0,
    created_by, device_id: device, sync_status: 'synced', created_at: now, updated_at: now,
  });
  await repo(StockMovement).save([
    movement(ids.bizA, ids.prodA, 'opening', 20, ids.ownerA),
    movement(ids.bizA, ids.prodA, 'sale', 16, ids.cashierA),
    movement(ids.bizB, ids.prodB, 'opening', 500, ids.ownerB),
  ] as any);
  const sale = (business_id: string, created_by: string, total: number, paid: number, voided = false) => {
    const id = randomUUID();
    return {
      id, business_id, created_by, subtotal: total, discount_amount: 0, tax_amount: 0, total_amount: total, paid_amount: paid, voided,
      customer_id: business_id === ids.bizA ? ids.custA : null, reference_number: `S-${id.slice(0, 4)}`,
      payment_status: paid >= total ? 'paid' : 'partial', sale_date: now, device_id: device, sync_status: 'synced', created_at: now, updated_at: now,
    };
  };
  const saleManager = sale(ids.bizA, ids.managerA, 10000, 10000);
  const saleCashier = sale(ids.bizA, ids.cashierA, 6000, 2000);
  const saleVoid = sale(ids.bizA, ids.cashierA, 99000, 0, true);
  const saleB = sale(ids.bizB, ids.ownerB, 777000, 777000);
  await repo(Sale).save([saleManager, saleCashier, saleVoid, saleB] as any);
  const item = (s: { id: string; business_id: string; total_amount: number }, product_id: string, quantity: number) => ({
    id: randomUUID(), business_id: s.business_id, sale_id: s.id, product_id, quantity, selling_price: 1000, unit_cost: 600,
    discount_amount: 0, tax_amount: 0, total_amount: s.total_amount, created_at: now, updated_at: now,
  });
  await repo(SaleItem).save([item(saleManager, ids.prodA, 10), item(saleCashier, ids.prodA, 6), item(saleB, ids.prodB, 777)] as any);
  await repo(Expense).save({ id: randomUUID(), business_id: ids.bizA, category: 'Rent', amount: 1500, payment_method: 'cash', expense_date: now, created_by: ids.ownerA, device_id: device, sync_status: 'synced', created_at: now, updated_at: now } as any);
  await repo(Payment).save({ id: randomUUID(), business_id: ids.bizA, type: 'sale_payment', payment_method: 'cash', amount: 12000, payment_date: now, created_by: ids.cashierA, device_id: device, sync_status: 'synced', created_at: now, updated_at: now } as any);

  const login = async (email: string, password = '7391') => call('POST', '/auth/login', { body: { email, password } });
  const tokens: Record<string, string> = {};
  for (const [key, email] of Object.entries({ ownerA: 'owner-a', managerA: 'manager-a', cashierA: 'cashier-a', staffA: 'staff-a', ownerB: 'owner-b', loner: 'loner' })) {
    const res = await login(`${email}@example.test`);
    check(`login works for ${key}`, res.status === 200 && Boolean(res.body.token), res.status);
    tokens[key] = res.body.token;
  }
  const roleOf = async (id: string) => (await repo(User).findOneBy({ id }))!;

  // Sync tenant and role protections
  let res = await call('POST', '/sync/users', { token: tokens.cashierA, body: { id: ids.cashierA, name: 'x', email: 'cashier-a@example.test', role: 'OWNER' } });
  check('cashier cannot self-promote through sync', (await roleOf(ids.cashierA)).role === 'CASHIER', res.status);
  res = await call('POST', '/sync/users', { token: tokens.cashierA, body: { id: ids.cashierA, name: 'x', email: 'cashier-a@example.test', role: 'SUPER_ADMIN', business_id: ids.bizB, active: true } });
  const moved = await roleOf(ids.cashierA);
  check('user cannot move self to another business', moved.business_id === ids.bizA && moved.role === 'CASHIER', moved.business_id);
  await repo(User).update(ids.cashierA, { name: 'cashier-a@example.test' });
  res = await call('POST', '/sync/users', { token: tokens.loner, body: { id: ids.loner, name: 'x', email: 'loner@example.test', business_id: ids.bizB } });
  check('user with no business cannot claim one', res.status === 403 && (await roleOf(ids.loner)).business_id === null, res.status);
  res = await call('POST', '/sync/businesses', { token: tokens.loner, body: { id: ids.bizB, name: 'Stolen', business_code: 'SHOP-B' } });
  check('user with no business cannot take over a business', res.status === 403 && (await repo(Business).findOneBy({ id: ids.bizB }))!.name === 'Shop B', res.status);
  res = await call('POST', '/sync/products', { token: tokens.loner, body: { id: randomUUID(), business_id: ids.bizB, name: 'x', unit: 'pcs' } });
  check('user with no business cannot write to a business', res.status === 403, res.status);
  res = await call('POST', '/sync/products', { token: tokens.ownerA, body: { id: randomUUID(), business_id: ids.bizB, name: 'x', unit: 'pcs' } });
  check('owner cannot write to another business', res.status === 403, res.status);
  res = await call('POST', '/sync/products', { token: tokens.ownerA, body: { id: ids.prodB, business_id: ids.bizA, name: 'Hijacked', unit: 'pcs' } });
  check('owner cannot overwrite another business row by id', res.status === 403 && (await repo(Product).findOneBy({ id: ids.prodB }))!.name === 'Soda B', res.status);
  res = await call('POST', '/sync/users', { token: tokens.ownerA, body: { id: ids.ownerB, business_id: ids.bizA, name: 'x', email: 'owner-b@example.test' } });
  check('owner cannot pull a user from another business', res.status === 403 && (await roleOf(ids.ownerB)).business_id === ids.bizB, res.status);
  res = await call('POST', '/sync/users', { token: tokens.ownerA, body: { id: ids.staffA, business_id: ids.bizA, name: 'x', email: 'staff-a@example.test', role: 'SUPER_ADMIN' } });
  check('owner cannot assign SUPER_ADMIN', res.status === 403, res.status);
  res = await call('POST', '/sync/users', { token: tokens.managerA, body: { id: ids.staffA, business_id: ids.bizA, name: 'x', email: 'staff-a@example.test', role: 'MANAGER' } });
  check('manager cannot manage users through sync', res.status === 403, res.status);
  res = await call('POST', '/sync/businesses', { token: tokens.staffA, body: { id: ids.bizA, name: 'Renamed', business_code: 'SHOP-A' } });
  check('staff anchor push is accepted so their sync keeps running', res.status === 200, res.status);
  check('staff cannot change business details', (await repo(Business).findOneBy({ id: ids.bizA }))!.name === 'Shop A');
  res = await call('POST', '/sync/businesses', { token: tokens.cashierA, body: { id: ids.bizA, name: 'Renamed', business_code: 'SHOP-A' } });
  check('cashier anchor push is accepted and changes nothing', res.status === 200 && (await repo(Business).findOneBy({ id: ids.bizA }))!.name === 'Shop A', res.status);
  res = await call('POST', '/sync/users', { token: tokens.cashierA, body: { id: ids.cashierA, business_id: ids.bizA, name: 'cashier-a@example.test', email: 'cashier-a@example.test', role: 'CASHIER' } });
  check('cashier self anchor push is accepted', res.status === 200, res.status);

  // Limited-role sync writes: what the phone allows must keep working
  const cashierAt = new Date().toISOString();
  const syncBase = { business_id: ids.bizA, created_by: ids.cashierA, device_id: device, sync_status: 'synced', created_at: cashierAt, updated_at: cashierAt };
  const cashierPush = (table: string, body: Record<string, unknown>) => call('POST', `/sync/${table}`, { token: tokens.cashierA, body });
  const newId = () => randomUUID();
  const cashierSaleId = newId();
  for (const [table, body] of [
    ['customers', { id: newId(), business_id: ids.bizA, name: 'New customer', active: true, created_at: cashierAt, updated_at: cashierAt }],
    ['suppliers', { id: newId(), business_id: ids.bizA, name: 'New supplier', active: true, created_at: cashierAt, updated_at: cashierAt }],
    ['sales', { ...syncBase, id: cashierSaleId, subtotal: 1000, discount_amount: 0, tax_amount: 0, total_amount: 1000, paid_amount: 1000, voided: false, payment_status: 'paid', sale_date: cashierAt, reference_number: 'OFFLINE-1' }],
    ['stock_movements', { ...syncBase, id: newId(), product_id: ids.prodA, type: 'sale', quantity: 1, unit_cost: 600, occurred_at: cashierAt, previous_quantity: 4, new_quantity: 3 }],
    ['stock_movements', { ...syncBase, id: newId(), product_id: ids.prodA, type: 'purchase', quantity: 1, unit_cost: 600, occurred_at: cashierAt, previous_quantity: 3, new_quantity: 4 }],
    ['expenses', { ...syncBase, id: newId(), category: 'Transport', amount: 100, payment_method: 'cash', expense_date: cashierAt }],
    ['payments', { ...syncBase, id: newId(), type: 'customer_payment', payment_method: 'cash', amount: 100, payment_date: cashierAt }],
    ['audit_logs', { id: newId(), business_id: ids.bizA, user_id: ids.cashierA, role: 'CASHIER', action: 'sale.create', entity: 'sale', created_at: cashierAt }],
  ] as [string, Record<string, unknown>][]) {
    res = await cashierPush(table, body);
    check(`cashier can still sync ${table} (${String(body.type ?? 'row')})`, res.status === 200, res.text.slice(0, 200));
  }
  await AppDataSource.query(`DELETE FROM stock_movements WHERE created_by = $1 AND device_id = $2 AND type IN ('purchase') AND quantity = 1`, [ids.cashierA, device]);
  await AppDataSource.query(`DELETE FROM stock_movements WHERE created_by = $1 AND type = 'sale' AND quantity = 1`, [ids.cashierA]);
  await AppDataSource.query(`DELETE FROM sales WHERE id = $1`, [cashierSaleId]);
  await AppDataSource.query(`DELETE FROM expenses WHERE category = 'Transport'`);
  await AppDataSource.query(`DELETE FROM payments WHERE type = 'customer_payment' AND amount = 100`);
  await AppDataSource.query(`DELETE FROM customers WHERE name = 'New customer'`);

  res = await cashierPush('products', { id: ids.prodA, business_id: ids.bizA, name: 'Renamed by cashier', selling_price: 1, average_cost: 610 });
  const cashierEdited = await repo(Product).findOneBy({ id: ids.prodA });
  check('stock-in by a cashier can update average cost', res.status === 200 && cashierEdited!.average_cost === 610, cashierEdited!.average_cost);
  check('a cashier cannot rename or reprice a product', cashierEdited!.name === 'Soda A' && cashierEdited!.selling_price === 1000, cashierEdited!.name);
  await repo(Product).update(ids.prodA, { average_cost: 600 });
  res = await cashierPush('products', { id: newId(), business_id: ids.bizA, name: 'x', unit: 'pcs' });
  check('a cashier cannot add a product', res.status === 403, res.status);
  res = await cashierPush('categories', { id: newId(), business_id: ids.bizA, name: 'x' });
  check('a cashier cannot add a category', res.status === 403, res.status);
  res = await cashierPush('categories', { id: ids.catA, business_id: ids.bizA, name: 'Renamed' });
  check('a cashier cannot rename a category', res.status === 200 && (await repo(Category).findOneBy({ id: ids.catA }))!.name === 'Drinks', res.status);
  const movementBody = { ...syncBase, product_id: ids.prodA, quantity: 1, unit_cost: 600, occurred_at: cashierAt, previous_quantity: 4, new_quantity: 3 };
  for (const type of ['adjustment_in', 'adjustment_out', 'damaged', 'opening']) {
    res = await cashierPush('stock_movements', { ...movementBody, id: newId(), type, reason: 'test' });
    check(`a cashier cannot record ${type} stock`, res.status === 403, res.status);
  }
  res = await cashierPush('stock_movements', { ...movementBody, id: newId(), type: 'return_in', reversal_of: newId(), reason: 'test' });
  check('a cashier cannot reverse stock', res.status === 403, res.status);
  res = await call('POST', '/sync/stock_movements', { token: tokens.staffA, body: { ...movementBody, id: newId(), type: 'sale', created_by: ids.staffA } });
  check('staff cannot record stock changes', res.status === 403, res.status);
  res = await call('POST', '/sync/stock_movements', { token: tokens.managerA, body: { ...movementBody, id: newId(), type: 'damaged', reason: 'test', created_by: ids.managerA } });
  check('a manager can record damaged stock', res.status === 200, res.text.slice(0, 200));
  await AppDataSource.query(`DELETE FROM stock_movements WHERE type = 'damaged'`);
  res = await cashierPush('sales', { ...saleCashier, voided: true, payment_status: 'paid' });
  check('a cashier cannot void a sale', res.status === 403 && (await repo(Sale).findOneBy({ id: saleCashier.id }))!.voided === false, res.status);
  res = await cashierPush('sales', { ...saleVoid, voided: false, payment_status: 'paid' });
  check('a cashier cannot restore a voided sale', res.status === 403, res.status);
  const purchaseId = newId();
  const purchaseBody = { ...syncBase, id: purchaseId, supplier_id: newId(), total_amount: 500, paid_amount: 0, status: 'unpaid', purchase_date: cashierAt };
  res = await cashierPush('purchases', purchaseBody);
  check('a cashier can record a purchase', res.status === 200, res.text.slice(0, 200));
  res = await cashierPush('purchases', { ...purchaseBody, status: 'cancelled' });
  check('a cashier cannot void a purchase', res.status === 403, res.status);
  res = await call('POST', '/sync/purchases', { token: tokens.managerA, body: { ...purchaseBody, status: 'cancelled' } });
  check('a manager can void a purchase', res.status === 200, res.status);
  await AppDataSource.query(`DELETE FROM purchases WHERE id = $1`, [purchaseId]);
  const closing = { id: newId(), business_id: ids.bizA, business_date: '2026-11-07', session_number: 1, opening_cash: 0, status: 'open', opened_by: ids.ownerA, created_at: cashierAt, updated_at: cashierAt };
  res = await call('POST', '/sync/daily_closings', { token: tokens.ownerA, body: { ...closing, gross_profit: 500, net_profit: 400, cogs: 100 } });
  check('an owner can open a day', res.status === 200, res.text.slice(0, 200));
  res = await cashierPush('daily_closings', { ...closing, status: 'closed', closed_by: ids.cashierA });
  check('a cashier cannot close a day', res.status === 403, res.status);
  res = await cashierPush('daily_closings', { ...closing, id: newId(), status: 'closed' });
  check('a cashier cannot insert a closed day', res.status === 403, res.status);
  res = await cashierPush('waiter_tabs', { ...syncBase, id: newId(), session_id: closing.id, waiter_user_id: ids.staffA, status: 'draft', issued_by: ids.cashierA });
  check('a cashier cannot issue waiter tabs', res.status === 403, res.status);
  const expenseId = newId();
  res = await call('POST', '/sync/expenses', { token: tokens.ownerA, body: { ...syncBase, id: expenseId, created_by: ids.ownerA, category: 'Owner', amount: 1, payment_method: 'cash', expense_date: '2020-01-01T00:00:00Z' } });
  check('an owner can record an expense', res.status === 200, res.text.slice(0, 200));
  res = await cashierPush('expenses', { ...syncBase, id: expenseId, category: 'Changed', amount: 2 });
  check("a cashier cannot change someone else's expense", res.status === 403, res.status);
  res = await call('DELETE', `/sync/expenses/${expenseId}`, { token: tokens.cashierA });
  check("a cashier cannot delete someone else's expense", res.status === 403, res.status);
  const ownExpense = newId();
  await cashierPush('expenses', { ...syncBase, id: ownExpense, category: 'Mine', amount: 1, payment_method: 'cash', expense_date: '2020-01-01T00:00:00Z' });
  res = await call('DELETE', `/sync/expenses/${ownExpense}`, { token: tokens.cashierA });
  check('a cashier can delete their own expense', res.status === 200, res.status);
  res = await call('DELETE', `/sync/expenses/${expenseId}`, { token: tokens.ownerA });
  check('an owner can delete an expense', res.status === 200, res.status);
  for (const [table, id] of [['products', ids.prodA], ['sales', saleManager.id], ['customers', ids.custA], ['categories', ids.catA]]) {
    res = await call('DELETE', `/sync/${table}/${id}`, { token: tokens.ownerA });
    check(`nobody can delete ${table} through sync`, res.status === 403, res.status);
  }

  // Activity log integrity
  res = await cashierPush('audit_logs', { id: newId(), business_id: ids.bizA, user_id: null, role: 'MIA_PLATFORM', action: 'x', entity: 'x', created_at: cashierAt });
  check('nobody can forge MIA staff activity', res.status === 403, res.status);
  res = await cashierPush('audit_logs', { id: newId(), business_id: ids.bizA, action: 'PLATFORM_SUPPORT_ACCESS', entity: 'x', created_at: cashierAt });
  check('platform activity names are reserved', res.status === 403, res.status);
  const forged = newId();
  await cashierPush('audit_logs', { id: forged, business_id: ids.bizA, user_id: ids.cashierA, role: 'OWNER', action: 'sale.create', entity: 'sale', created_at: cashierAt });
  check('activity entries take the real role', (await repo(AuditLog).findOneBy({ id: forged }))!.role === 'CASHIER');
  const outsider = newId();
  await cashierPush('audit_logs', { id: outsider, business_id: ids.bizA, user_id: ids.ownerB, action: 'sale.create', entity: 'sale', created_at: cashierAt });
  check('activity entries cannot name an outsider', (await repo(AuditLog).findOneBy({ id: outsider }))!.user_id === ids.cashierA);
  await cashierPush('audit_logs', { id: forged, business_id: ids.bizA, user_id: ids.cashierA, action: 'rewritten', entity: 'sale', created_at: cashierAt });
  check('activity entries cannot be rewritten', (await repo(AuditLog).findOneBy({ id: forged }))!.action === 'sale.create');
  res = await call('DELETE', `/sync/audit_logs/${forged}`, { token: tokens.ownerA });
  check('activity entries cannot be deleted', res.status === 400, res.status);

  // Pull by role
  await repo(User).update(ids.managerA, { phone: '+250700000001' });
  const cashierPull = await call('GET', '/sync/pull', { token: tokens.cashierA });
  check('cashier pull still returns what the phone needs', cashierPull.status === 200 && cashierPull.body.tables.products.length === 1 && cashierPull.body.tables.sales.length > 0 && cashierPull.body.tables.users.length > 0, cashierPull.status);
  check('cashier pull keeps average cost for offline sales', cashierPull.body.tables.products[0].average_cost === 600);
  check('cashier pull has no activity log', cashierPull.body.tables.audit_logs.length === 0, cashierPull.body.tables.audit_logs.length);
  const pulledClosing = cashierPull.body.tables.daily_closings.find((row: any) => row.id === closing.id);
  check('cashier pull has no day profit figures', pulledClosing && pulledClosing.gross_profit === 0 && pulledClosing.net_profit === 0 && pulledClosing.cogs === 0, pulledClosing);
  check('cashier pull has no teammate phone numbers', !cashierPull.text.includes('+250700000001'));
  const ownerPull = await call('GET', '/sync/pull', { token: tokens.ownerA });
  check('owner pull keeps the activity log', ownerPull.body.tables.audit_logs.length > 0);
  const ownerClosing = ownerPull.body.tables.daily_closings.find((row: any) => row.id === closing.id);
  check('owner pull keeps day profit figures', ownerClosing?.gross_profit === 500, ownerClosing?.gross_profit);
  check('owner pull keeps teammate phone numbers', ownerPull.text.includes('+250700000001'));
  res = await call('GET', `/sync/audit_logs/${forged}`, { token: tokens.cashierA });
  check('cashier cannot fetch an activity entry', res.status === 403, res.status);
  res = await call('GET', `/sync/daily_closings/${closing.id}`, { token: tokens.cashierA });
  check('cashier fetch of a day has no profit figures', res.status === 200 && res.body.data.net_profit === 0, res.body?.data?.net_profit);
  await AppDataSource.query(`DELETE FROM daily_closings WHERE id = $1`, [closing.id]);
  await AppDataSource.query(`DELETE FROM audit_logs`);
  res = await call('GET', `/sync/products/${ids.prodB}`, { token: tokens.ownerA });
  check('owner cannot read another business row', res.status === 403, res.status);
  const pull = await call('GET', '/sync/pull', { token: tokens.ownerA });
  check('sync pull stays inside the business', !pull.text.includes(ids.bizB) && !pull.text.includes('Soda B'));
  check('sync pull still works', pull.status === 200 && pull.body.tables.products.length === 1, pull.status);

  // Onboarding must keep working
  const fresh = await call('POST', '/auth/register', { body: { name: 'New Owner', email: 'new-owner@example.test', password: '7391' } });
  const newBiz = randomUUID();
  res = await call('POST', '/sync/businesses', { token: fresh.body.token, body: { id: newBiz, name: 'New Shop', business_code: 'NEW-SHOP' } });
  check('new user can create a business', res.status === 200, res.body);
  const freshUser = await roleOf(fresh.body.user.id);
  check('business creator becomes owner', freshUser.role === 'OWNER' && freshUser.business_id === newBiz, freshUser.role);
  res = await call('POST', '/sync/users', { token: fresh.body.token, body: { id: fresh.body.user.id, business_id: newBiz, name: 'New Owner', email: 'new-owner@example.test', role: 'OWNER' } });
  check('owner self-sync still works', res.status === 200 && (await roleOf(fresh.body.user.id)).role === 'OWNER', res.status);
  res = await call('POST', '/sync/products', { token: fresh.body.token, body: { id: randomUUID(), business_id: newBiz, name: 'First product', unit: 'pcs' } });
  check('new owner can sync data', res.status === 200, res.body);
  const joiner = await call('POST', '/auth/register', { body: { name: 'Joiner', email: 'joiner@example.test', password: '7391' } });
  res = await call('POST', '/auth/join-business', { token: joiner.body.token, body: { code: 'SHOP-A', role: 'MANAGER' } });
  check('joining cannot choose a higher role', res.status === 200 && res.body.user.role === 'STAFF', res.body?.user?.role);

  // Dashboard RBAC matrix
  const matrix: [string, Record<'ownerA' | 'managerA' | 'cashierA' | 'staffA', number>][] = [
    ['/dashboard/overview', { ownerA: 200, managerA: 200, cashierA: 403, staffA: 403 }],
    ['/dashboard/sales', { ownerA: 200, managerA: 200, cashierA: 200, staffA: 403 }],
    ['/dashboard/payments', { ownerA: 200, managerA: 200, cashierA: 200, staffA: 403 }],
    ['/dashboard/customers', { ownerA: 200, managerA: 200, cashierA: 200, staffA: 403 }],
    ['/dashboard/products', { ownerA: 200, managerA: 200, cashierA: 200, staffA: 200 }],
    ['/dashboard/stock-report', { ownerA: 200, managerA: 200, cashierA: 403, staffA: 403 }],
    ['/dashboard/purchases', { ownerA: 200, managerA: 200, cashierA: 403, staffA: 403 }],
    ['/dashboard/movements', { ownerA: 200, managerA: 200, cashierA: 403, staffA: 403 }],
    ['/dashboard/expenses', { ownerA: 200, managerA: 200, cashierA: 403, staffA: 403 }],
    ['/dashboard/reports/closings', { ownerA: 200, managerA: 200, cashierA: 403, staffA: 403 }],
    ['/dashboard/staff', { ownerA: 200, managerA: 200, cashierA: 403, staffA: 403 }],
    ['/dashboard/audit', { ownerA: 200, managerA: 403, cashierA: 403, staffA: 403 }],
    ['/dashboard/support-access', { ownerA: 200, managerA: 403, cashierA: 403, staffA: 403 }],
    ['/dashboard/me', { ownerA: 200, managerA: 200, cashierA: 200, staffA: 200 }],
  ];
  for (const [path, expected] of matrix) {
    for (const [who, status] of Object.entries(expected)) {
      res = await call('GET', path, { token: tokens[who] });
      check(`${who} GET ${path} is ${status}`, res.status === status, res.status === 500 ? res.text : res.status);
    }
    res = await call('GET', path);
    check(`anonymous GET ${path} is 401`, res.status === 401, res.status);
  }

  const overview = (await call('GET', '/dashboard/overview?period=today', { token: tokens.ownerA })).body;
  const k = overview.kpis;
  check('sales total ignores voided sales and other businesses', k.sales_total === 16000 && k.sales_count === 2, k.sales_total);
  check('cost of goods sold is correct', k.cogs === 9600, k.cogs);
  check('gross profit is correct', k.gross_profit === 6400, k.gross_profit);
  check('net profit is correct', k.net_profit === 4900, k.net_profit);
  check('payments received is correct', k.payments_received === 12000, k.payments_received);
  check('outstanding balance is correct', k.outstanding === 4000, k.outstanding);
  check('low stock uses real movements', k.low_stock_count === 1 && overview.low_stock[0].stock === 4, overview.low_stock);
  check('stock value is correct', k.stock_value === 2400, k.stock_value);
  check('overview contains only this business', !JSON.stringify(overview).includes('Soda B'));
  const salesB = await call('GET', '/dashboard/sales', { token: tokens.ownerB });
  check('tenant B sees only tenant B sales', salesB.body.total === 1 && salesB.body.rows[0].total_amount === 777000, salesB.body.total);

  const cashierSales = await call('GET', '/dashboard/sales', { token: tokens.cashierA });
  check('cashier sees only their own sales', cashierSales.body.rows.every((row: any) => row.id !== saleManager.id) && cashierSales.body.total === 2, cashierSales.body.total);
  const managerSales = await call('GET', '/dashboard/sales', { token: tokens.managerA });
  check('manager sees all sales', managerSales.body.total === 3, managerSales.body.total);
  const cashierProducts = await call('GET', '/dashboard/products', { token: tokens.cashierA });
  check('cashier never receives product costs', !cashierProducts.text.includes('average_cost'));
  const ownerProducts = await call('GET', '/dashboard/products', { token: tokens.ownerA });
  check('owner receives product costs', ownerProducts.text.includes('average_cost'));

  res = await call('PATCH', `/dashboard/staff/${ids.staffA}`, { token: tokens.managerA, body: { role: 'CASHIER' } });
  check('manager cannot change staff', res.status === 403, res.status);
  res = await call('PATCH', `/dashboard/staff/${ids.ownerB}`, { token: tokens.ownerA, body: { role: 'CASHIER' } });
  check('owner cannot change staff in another business', res.status === 404 && (await roleOf(ids.ownerB)).role === 'OWNER', res.status);
  res = await call('PATCH', `/dashboard/staff/${ids.ownerA}`, { token: tokens.ownerA, body: { active: false } });
  check('owner cannot lock themselves out', res.status === 400, res.status);
  res = await call('PATCH', `/dashboard/staff/${ids.staffA}`, { token: tokens.ownerA, body: { role: 'OWNER' } });
  check('owner role cannot be granted from the dashboard', res.status === 400, res.status);
  res = await call('PATCH', `/dashboard/staff/${ids.staffA}`, { token: tokens.ownerA, body: { role: 'CASHIER' } });
  check('owner can change a staff role', res.status === 200 && (await roleOf(ids.staffA)).role === 'CASHIER', res.status);
  res = await call('GET', '/dashboard/sales', { token: tokens.staffA });
  check('role change applies at once to live sessions', res.status === 200, res.status);
  await repo(User).update(ids.staffA, { role: 'STAFF' });
  res = await call('PATCH', `/dashboard/staff/${ids.staffA}`, { token: tokens.ownerA, body: { active: false } });
  res = await call('GET', '/dashboard/me', { token: tokens.staffA });
  check('deactivated staff lose access at once', res.status === 401, res.status);
  res = await call('GET', '/sync/pull', { token: tokens.staffA });
  check('deactivated staff lose sync at once', res.status === 401, res.status);
  await call('PATCH', `/dashboard/staff/${ids.staffA}`, { token: tokens.ownerA, body: { active: true } });
  tokens.staffA = (await login('staff-a@example.test')).body.token;

  // Token separation and platform sign-in
  res = await call('GET', '/platform/overview', { token: tokens.ownerA });
  check('business token cannot reach the platform API', res.status === 401, res.status);
  res = await call('GET', '/platform/overview');
  check('anonymous cannot reach the platform API', res.status === 401, res.status);

  const signIn = async (email: string, password: string) => {
    const first = await call('POST', '/platform/auth/login', { body: { email, password } });
    const setup = await call('POST', '/platform/auth/2fa/setup', { body: { challenge: first.body.challenge } });
    const code = totpCode(setup.body.secret, currentTotpStep());
    const done = await call('POST', '/platform/auth/2fa/verify', { body: { challenge: first.body.challenge, code } });
    return { first, setup, code, done };
  };
  res = await call('POST', '/platform/auth/login', { body: { email: 'superadmin@mia.rw', password: 'wrong-password' } });
  check('wrong platform password is rejected', res.status === 401, res.status);
  res = await call('POST', '/platform/auth/login', { body: { email: 'owner-a@example.test', password: '7391' } });
  check('business owner cannot sign in as platform admin', res.status === 401, res.status);
  const superLogin = await signIn('superadmin@mia.rw', 'SuperAdmin#2026');
  check('password alone gives no session', superLogin.first.body.step === 'enroll' && !superLogin.first.body.token, superLogin.first.body.step);
  const challengeAsToken = await call('GET', '/platform/overview', { token: superLogin.first.body.challenge });
  check('2FA challenge is not a session', challengeAsToken.status === 401, challengeAsToken.status);
  check('2FA enrollment gives a session', superLogin.done.status === 200 && Boolean(superLogin.done.body.token), superLogin.done.body);
  const superToken = superLogin.done.body.token;
  res = await call('GET', '/dashboard/me', { token: superToken });
  check('platform token cannot reach the business dashboard', res.status === 401, res.status);
  res = await call('GET', '/sync/pull', { token: superToken });
  check('platform token cannot reach sync', res.status === 401, res.status);
  const again = await call('POST', '/platform/auth/login', { body: { email: 'superadmin@mia.rw', password: 'SuperAdmin#2026' } });
  check('later sign-ins ask for a code', again.body.step === 'verify', again.body.step);
  res = await call('POST', '/platform/auth/2fa/verify', { body: { challenge: again.body.challenge, code: superLogin.code } });
  check('a used 2FA code cannot be replayed', res.status === 401, res.status);
  res = await call('POST', '/platform/auth/2fa/setup', { body: { challenge: again.body.challenge } });
  check('2FA secret cannot be replaced once enrolled', res.status === 409, res.status);

  const supportToken = (await signIn('support@mia.rw', 'SupportTeam#2026')).done.body.token;
  const financeToken = (await signIn('finance@mia.rw', 'FinanceTeam#2026')).done.body.token;
  const reason = { reason: 'Automated test reason' };

  const platformMatrix: [string, string, { super: number; support: number; finance: number }, unknown?][] = [
    ['GET', '/platform/overview', { super: 200, support: 200, finance: 200 }],
    ['GET', '/platform/businesses', { super: 200, support: 200, finance: 200 }],
    ['GET', '/platform/users', { super: 200, support: 200, finance: 403 }],
    ['GET', '/platform/audit', { super: 200, support: 403, finance: 403 }],
    ['GET', '/platform/sync-health', { super: 200, support: 200, finance: 403 }],
    ['GET', '/platform/alerts', { super: 200, support: 200, finance: 403 }],
    ['GET', '/platform/billing', { super: 200, support: 403, finance: 200 }],
    ['GET', '/platform/support/grants', { super: 200, support: 200, finance: 403 }],
    ['GET', '/platform/data-requests', { super: 200, support: 403, finance: 403 }],
    ['GET', '/platform/backups', { super: 200, support: 403, finance: 403 }],
    ['GET', '/platform/announcements', { super: 200, support: 403, finance: 403 }],
    ['GET', '/platform/admins', { super: 200, support: 403, finance: 403 }],
    ['GET', `/platform/businesses/${ids.bizA}`, { super: 200, support: 200, finance: 200 }],
    ['POST', `/platform/businesses/${ids.bizB}/suspend`, { super: 200, support: 403, finance: 403 }, reason],
    ['POST', `/platform/businesses/${ids.bizB}/reactivate`, { super: 200, support: 403, finance: 403 }, reason],
    ['POST', `/platform/users/${ids.staffA}/unlock`, { super: 200, support: 200, finance: 403 }, reason],
    ['PATCH', `/platform/billing/${ids.bizB}`, { super: 200, support: 403, finance: 200 }, { plan: 'pro', ...reason }],
    ['PATCH', `/platform/businesses/${ids.bizB}/flags`, { super: 200, support: 403, finance: 403 }, { flags: { stock_reports: true }, ...reason }],
  ];
  for (const [method, path, expected, body] of platformMatrix) {
    for (const [who, token] of [['super', superToken], ['support', supportToken], ['finance', financeToken]] as const) {
      res = await call(method, path, { token, body });
      check(`${who} ${method} ${path} is ${expected[who]}`, res.status === expected[who], res.status === 500 ? res.text : res.status);
    }
  }

  res = await call('POST', `/platform/businesses/${ids.bizA}/suspend`, { token: superToken, body: {} });
  check('suspending needs a reason', res.status === 400, res.status);
  const metrics = (await call('GET', '/platform/overview', { token: superToken })).body;
  check('platform metrics count real rows', metrics.totals.businesses === 3 && metrics.volume_30d[0].total === 793000, metrics.totals);

  // Suspension is enforced
  res = await call('POST', `/platform/businesses/${ids.bizA}/suspend`, { token: superToken, body: reason });
  check('super admin can suspend', res.status === 200, res.status);
  res = await login('owner-a@example.test');
  check('suspended business cannot sign in', res.status === 403 && res.body.code === 'BUSINESS_SUSPENDED', res.status);
  res = await call('GET', '/dashboard/me', { token: tokens.ownerA });
  check('suspended business loses dashboard at once', res.status === 403, res.status);
  res = await call('GET', '/sync/pull', { token: tokens.ownerA });
  check('suspended business loses sync at once', res.status === 403, res.status);
  res = await call('GET', '/dashboard/me', { token: tokens.ownerB });
  check('other businesses are unaffected', res.status === 200, res.status);
  res = await call('POST', `/platform/businesses/${ids.bizA}/reactivate`, { token: superToken, body: reason });
  res = await call('GET', '/dashboard/me', { token: tokens.ownerA });
  check('reactivating restores access', res.status === 200, res.status);

  // Feature flags are enforced
  await call('PATCH', `/platform/businesses/${ids.bizA}/flags`, { token: superToken, body: { flags: { stock_reports: false }, ...reason } });
  res = await call('GET', '/dashboard/stock-report', { token: tokens.ownerA });
  check('stock report flag is enforced', res.status === 403, res.status);
  await call('PATCH', `/platform/businesses/${ids.bizA}/flags`, { token: superToken, body: { flags: { stock_reports: true, web_dashboard: false }, ...reason } });
  res = await call('GET', '/dashboard/me', { token: tokens.ownerA });
  check('web dashboard flag is enforced', res.status === 403, res.status);
  await call('PATCH', `/platform/businesses/${ids.bizA}/flags`, { token: superToken, body: { flags: { web_dashboard: true }, ...reason } });

  // Support access
  res = await call('GET', `/platform/support/${ids.bizA}/overview`, { token: supportToken });
  check('support cannot view a business without a session', res.status === 403 && res.body.code === 'NO_ACTIVE_GRANT', res.status);
  res = await call('POST', '/platform/support/grants', { token: supportToken, body: { business_id: ids.bizA, minutes: 600, reason: reason.reason } });
  check('support sessions cannot exceed 60 minutes', res.status === 400, res.status);
  res = await call('POST', '/platform/support/grants', { token: supportToken, body: { business_id: ids.bizA, minutes: 30, reason: reason.reason } });
  const grantId = res.body.grant?.id;
  check('support can start a session', res.status === 201, res.status);
  res = await call('GET', `/platform/support/${ids.bizA}/overview`, { token: supportToken });
  check('support can read during a session', res.status === 200 && res.body.overview.kpis.sales_total >= 0, res.status);
  res = await call('GET', `/platform/support/${ids.bizB}/overview`, { token: supportToken });
  check('a session covers only its own business', res.status === 403, res.status);
  res = await call('GET', `/platform/support/${ids.bizA}/overview`, { token: superToken });
  check('a session covers only the admin who started it', res.status === 403, res.status);
  const visible = await call('GET', '/dashboard/support-access', { token: tokens.ownerA });
  check('owner can see support access', (visible.body.rows ?? []).some((row: any) => row.id === grantId), visible.text.slice(0, 200));
  const ownerAudit = await repo(AuditLog).findBy({ business_id: ids.bizA, action: 'PLATFORM_SUPPORT_ACCESS' });
  check('support access is written to the business audit log', ownerAudit.length === 1, ownerAudit.length);
  await repo(entities.SupportAccessGrant).update(grantId, { expires_at: new Date(Date.now() - 1000) });
  res = await call('GET', `/platform/support/${ids.bizA}/overview`, { token: supportToken });
  check('expired support sessions stop working', res.status === 403, res.status);

  // Accounts, export and audit
  const beforeHash = (await roleOf(ids.staffA)).password_hash;
  res = await call('POST', `/platform/users/${ids.staffA}/force-signout`, { token: supportToken, body: reason });
  res = await call('GET', '/dashboard/me', { token: tokens.staffA });
  check('force sign-out ends live sessions', res.status === 401, res.status);
  check('support actions do not change the PIN', (await roleOf(ids.staffA)).password_hash === beforeHash);
  res = await call('POST', `/platform/users/${ids.staffA}/send-pin-reset`, { token: supportToken, body: reason });
  check('send PIN reset works without exposing a code', res.status === 200 && !res.text.includes('code'), res.text);
  res = await call('GET', `/platform/businesses/${ids.bizA}/export?reason=Owner%20asked%20for%20a%20copy`, { token: superToken });
  check('export contains the business data', res.status === 200 && res.body.tables.sales.length === 3, res.status);
  check('export stays inside the business', !res.text.includes('Soda B'));
  res = await call('GET', `/platform/businesses/${ids.bizA}/export`, { token: superToken });
  check('export needs a reason', res.status === 400, res.status);
  const logged = await repo(PlatformAuditLog).find();
  for (const action of ['business.suspended', 'business.reactivated', 'business.flags_changed', 'support.access_started', 'user.signed_out', 'business.exported', 'admin.login', 'admin.2fa_enrolled']) {
    check(`audit log records ${action}`, logged.some((row) => row.action === action));
  }
  const auditRoutes = await call('DELETE', `/platform/audit/${logged[0].id}`, { token: superToken });
  check('audit log cannot be deleted', auditRoutes.status === 404, auditRoutes.status);

  // Admin management
  res = await call('POST', '/platform/admins', { token: supportToken, body: { name: 'Nope', email: 'nope@example.test', role: 'SUPER_ADMIN' } });
  check('support cannot create admins', res.status === 403, res.status);
  res = await call('POST', '/platform/admins', { token: superToken, body: { name: 'New Support', email: 'new-support@example.test', role: 'SUPPORT' } });
  check('super admin can create admins', res.status === 201 && Boolean(res.body.temporary_password), res.status);
  const created = await signIn('new-support@example.test', res.body.temporary_password);
  const createdId = created.done.body.admin.id;
  res = await call('GET', '/platform/businesses', { token: created.done.body.token });
  check('temporary password must be changed first', res.status === 403 && res.body.code === 'PASSWORD_CHANGE_REQUIRED', res.status);
  res = await call('POST', '/platform/auth/change-password', { token: created.done.body.token, body: { current: 'bad', password: 'short' } });
  check('weak new password is rejected', res.status === 400, res.status);
  const superId = superLogin.done.body.admin.id;
  res = await call('POST', `/platform/admins/${superId}/deactivate`, { token: superToken, body: reason });
  check('super admin cannot deactivate themselves', res.status === 400, res.status);
  res = await call('POST', `/platform/admins/${createdId}/deactivate`, { token: superToken, body: reason });
  res = await call('GET', '/platform/auth/me', { token: created.done.body.token });
  check('deactivated admin loses access at once', res.status === 401, res.status);

  // Announcements reach the right businesses
  await call('POST', '/platform/announcements', { token: superToken, body: { title: 'For A only', body: 'Message for A', business_id: ids.bizA } });
  await call('POST', '/platform/announcements', { token: superToken, body: { title: 'For everyone', body: 'Message for all' } });
  const meA = (await call('GET', '/dashboard/me', { token: tokens.ownerA })).body;
  const meB = (await call('GET', '/dashboard/me', { token: tokens.ownerB })).body;
  check('announcements are targeted', meA.announcements.length === 2 && meB.announcements.length === 1, [meA.announcements.length, meB.announcements.length]);

  // PIN reset ends old sessions
  await AppDataSource.query(`DELETE FROM pin_reset_codes`);
  const mailLog: string[] = [];
  console.log = (...args: unknown[]) => { mailLog.push(args.join(' ')); };
  await call('POST', '/auth/forgot-pin', { body: { email: 'manager-a@example.test' } });
  for (let i = 0; i < 50 && !mailLog.some((line) => line.includes('reset code is')); i += 1) await new Promise((r) => setTimeout(r, 100));
  console.log = log;
  const code = /reset code is (\d{6})/.exec(mailLog.join('\n'))?.[1];
  res = await call('POST', '/auth/reset-pin', { body: { email: 'manager-a@example.test', code, pin: '8264' } });
  check('PIN reset works', res.status === 200, res.body);
  res = await call('GET', '/dashboard/me', { token: tokens.managerA });
  check('PIN reset ends old sessions', res.status === 401, res.status);
  res = await login('manager-a@example.test', '8264');
  check('new PIN gives a working session', res.status === 200 && (await call('GET', '/dashboard/me', { token: res.body.token })).status === 200, res.status);

  server.close();
  await AppDataSource.destroy();

  const failed = results.filter((result) => !result.pass);
  for (const failure of failed) console.log(`FAIL  ${failure.name}  ${JSON.stringify(failure.detail) ?? ''}`);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
