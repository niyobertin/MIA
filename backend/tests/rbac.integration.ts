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
  delete process.env.SMTP_HOST;
  const { devOutbox } = await import('../src/lib/mailer');
  const codeFor = (email: string) => {
    const mail = [...devOutbox].reverse().find((m) => m.to === email && m.subject.includes('sign-in code'));
    return mail?.text.match(/\b(\d{6})\b/)?.[1] ?? '';
  };
  const { authRouter } = await import('../src/routes/auth');
  const { syncRouter } = await import('../src/routes/sync');
  const { dashboardRouter } = await import('../src/routes/dashboard');
  const { reportsRouter } = await import('../src/routes/reports');
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
  app.use('/dashboard/reports', reportsRouter);
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
  const ownerPushUser = (body: Record<string, unknown>) => call('POST', '/sync/users', { token: tokens.ownerA, body });
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
    ['/dashboard/reports/summary', { ownerA: 200, managerA: 200, cashierA: 403, staffA: 403 }],
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
  const summary = (await call('GET', '/dashboard/reports/summary?period=today', { token: tokens.ownerA })).body;
  const sk = summary.kpis;
  check('report summary matches the overview', sk.sales_total === 16000 && sk.gross_profit === 6400 && sk.net_profit === 4900 && sk.cash_collected === 12000 && sk.outstanding_debt === 4000, sk);
  check('report summary contains only this business', !JSON.stringify(summary).includes('Soda B'));
  res = await call('GET', '/dashboard/reports/summary?period=custom&from=2026-05-02&to=2026-05-01', { token: tokens.ownerA });
  check('report summary rejects a backwards range', res.status === 400, res.status);
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
    const code = codeFor(email);
    const done = await call('POST', '/platform/auth/2fa/verify', { body: { challenge: first.body.challenge, code } });
    return { first, code, done };
  };
  res = await call('POST', '/platform/auth/login', { body: { email: 'superadmin@mia.rw', password: 'wrong-password' } });
  check('wrong platform password is rejected', res.status === 401, res.status);
  res = await call('POST', '/platform/auth/login', { body: { email: 'owner-a@example.test', password: '7391' } });
  check('business owner cannot sign in as platform admin', res.status === 401, res.status);
  const superLogin = await signIn('superadmin@mia.rw', 'SuperAdmin#2026');
  check('password alone gives no session', superLogin.first.body.step === 'verify' && !superLogin.first.body.token, superLogin.first.body.step);
  check('sign-in code is sent by email', superLogin.first.body.channel === 'email' && /^\d{6}$/.test(superLogin.code), superLogin.first.body);
  check('email address is masked in the response', typeof superLogin.first.body.sent_to === 'string' && !superLogin.first.body.sent_to.includes('superadmin@'), superLogin.first.body.sent_to);
  const challengeAsToken = await call('GET', '/platform/overview', { token: superLogin.first.body.challenge });
  check('2FA challenge is not a session', challengeAsToken.status === 401, challengeAsToken.status);
  check('email code gives a session', superLogin.done.status === 200 && Boolean(superLogin.done.body.token), superLogin.done.body);
  const superToken = superLogin.done.body.token;
  res = await call('GET', '/dashboard/me', { token: superToken });
  check('platform token cannot reach the business dashboard', res.status === 401, res.status);
  res = await call('GET', '/sync/pull', { token: superToken });
  check('platform token cannot reach sync', res.status === 401, res.status);
  const again = await call('POST', '/platform/auth/login', { body: { email: 'superadmin@mia.rw', password: 'SuperAdmin#2026' } });
  check('every sign-in asks for a new code', again.body.step === 'verify' && codeFor('superadmin@mia.rw') !== superLogin.code, again.body.step);
  res = await call('POST', '/platform/auth/2fa/verify', { body: { challenge: again.body.challenge, code: superLogin.code } });
  check('a used code cannot be replayed', res.status === 401, res.status);
  res = await call('POST', '/platform/auth/2fa/resend', { body: { challenge: again.body.challenge } });
  check('a new code cannot be requested within a minute', res.status === 429, res.status);
  res = await call('POST', '/platform/auth/2fa/setup', { body: { challenge: again.body.challenge } });
  check('authenticator setup is gone', res.status === 404 || res.status === 401, res.status);
  for (let i = 0; i < 5; i += 1) {
    await call('POST', '/platform/auth/2fa/verify', { body: { challenge: again.body.challenge, code: '000000' } });
  }
  res = await call('POST', '/platform/auth/2fa/verify', { body: { challenge: again.body.challenge, code: codeFor('superadmin@mia.rw') } });
  check('five wrong codes cancel the code', res.status === 401 || res.status === 423, res.status);
  await repo(entities.PlatformAdmin).update({ email: 'superadmin@mia.rw' }, { locked_until: null, failed_attempts: 0 });

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
  for (const action of ['business.suspended', 'business.reactivated', 'business.flags_changed', 'support.access_started', 'user.signed_out', 'business.exported', 'admin.login', 'admin.code_sent', 'admin.2fa_failed']) {
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

  // Sign up and sign in with a phone number
  res = await call('POST', '/auth/register', { body: { name: 'Phone Only', phone: '0788 555 111', password: '7391' } });
  check('sign up with only a phone number works', res.status === 201 && res.body.user.phone === '+250788555111' && res.body.user.email === null, res.body);
  const phoneUserId = res.body?.user?.id as string;
  res = await call('POST', '/auth/register', { body: { name: 'Copy Cat', phone: '+250 788-555-111', password: '7391' } });
  check('the same phone number cannot sign up twice', res.status === 409 && res.body.code === 'PHONE_TAKEN', res.body);
  res = await call('POST', '/auth/register', { body: { name: 'Nobody', password: '7391' } });
  check('sign up needs an email or a phone', res.status === 400 && res.body.code === 'IDENTIFIER_REQUIRED', res.body);
  res = await call('POST', '/auth/register', { body: { name: 'Both Ways', email: 'both@example.test', phone: '0788555222', password: '7391' } });
  check('sign up with email and phone works', res.status === 201, res.body);
  res = await call('POST', '/auth/login', { body: { identifier: '0788555111', password: '7391' } });
  check('sign in with a local phone number works', res.status === 200 && Boolean(res.body.token), res.status);
  res = await call('POST', '/auth/login', { body: { identifier: '+250788555222', password: '7391' } });
  check('sign in with phone works for an account that also has email', res.status === 200, res.status);
  res = await call('POST', '/auth/login', { body: { identifier: 'both@example.test', password: '7391' } });
  check('sign in with email still works', res.status === 200, res.status);
  res = await call('POST', '/auth/login', { body: { identifier: '0788555111', password: '1593' } });
  check('wrong PIN with a phone number is refused', res.status === 401, res.status);
  res = await call('POST', '/auth/login', { body: { identifier: 'not valid', password: '7391' } });
  check('a made-up sign-in name is refused', res.status === 400 && res.body.code === 'IDENTIFIER_INVALID', res.body);

  // Owners can add a team member with only a phone number
  res = await ownerPushUser({ id: newId(), business_id: ids.bizA, name: 'Waiter Phone', phone: '0788 555 333', role: 'STAFF', password_hash: pinHash, active: true });
  check('owner can add a team member with only a phone', res.status === 200, res.text.slice(0, 200));
  res = await ownerPushUser({ id: newId(), business_id: ids.bizA, name: 'Clash', phone: '0788555111', role: 'STAFF', password_hash: pinHash, active: true });
  check('a team member cannot take someone else\'s phone number', res.status === 409, res.status);
  res = await ownerPushUser({ id: newId(), business_id: ids.bizA, name: 'No Contact', role: 'STAFF', password_hash: pinHash, active: true });
  check('a team member needs an email or phone', res.status === 400, res.status);

  // PIN help through MIA support
  res = await call('POST', '/auth/pin-help', { body: { identifier: '0788555111', name: 'Phone Only' } });
  check('anyone can ask MIA support for PIN help', res.status === 200, res.status);
  res = await call('POST', '/auth/pin-help', { body: { identifier: '0788999999', name: 'Stranger' } });
  check('PIN help for an unknown number looks the same', res.status === 200, res.status);
  res = await call('GET', '/platform/pin-help', { token: financeToken });
  check('finance cannot see PIN help requests', res.status === 403, res.status);
  res = await call('GET', '/platform/pin-help', { token: supportToken });
  const helpRows = (res.body?.rows ?? []) as any[];
  const helpRow = helpRows.find((row) => row.user_id === phoneUserId);
  const strangerRow = helpRows.find((row) => row.identifier === '+250788999999');
  check('support sees open PIN help requests', res.status === 200 && Boolean(helpRow) && helpRow.contact_phone === '+250788555111', res.body);
  res = await call('POST', `/platform/pin-help/${strangerRow?.id}/temporary-pin`, { token: supportToken, body: reason });
  check('no temporary PIN without a matching account', res.status === 400, res.status);
  res = await call('POST', `/platform/pin-help/${helpRow?.id}/temporary-pin`, { token: supportToken, body: reason });
  const tempPin = res.body?.pin as string;
  check('support can give a temporary PIN', res.status === 200 && /^\d{4}$/.test(tempPin ?? ''), res.body);
  res = await call('POST', '/auth/login', { body: { identifier: '0788555111', password: '7391' } });
  check('the old PIN stops working after a temporary PIN', res.status === 401, res.status);
  res = await call('POST', '/auth/login', { body: { identifier: '0788555111', password: tempPin } });
  check('temporary PIN signs in and asks for a new PIN', res.status === 200 && res.body.pin_setup_required === true, res.body?.pin_setup_required);
  res = await call('POST', `/platform/pin-help/${helpRow?.id}/temporary-pin`, { token: supportToken, body: reason });
  check('a resolved request cannot issue another PIN', res.status === 404, res.status);
  res = await call('POST', `/platform/pin-help/${strangerRow?.id}/close`, { token: supportToken, body: reason });
  check('support can close a request', res.status === 200, res.status);
  const pinAudit = await repo(PlatformAuditLog).findOneBy({ action: 'user.temporary_pin_issued', target_id: phoneUserId });
  check('temporary PINs are in the audit log', Boolean(pinAudit));

  // Super admin console: dashboards, organizations, subscriptions, support levels, audit chain, notifications, email
  const newMatrix: [string, string, { super: number; support: number; finance: number }, unknown?][] = [
    ['GET', '/platform/overview?range=12m', { super: 200, support: 200, finance: 200 }],
    ['GET', '/platform/health', { super: 200, support: 200, finance: 200 }],
    ['GET', '/platform/activity', { super: 200, support: 200, finance: 200 }],
    ['GET', '/platform/alerts/summary', { super: 200, support: 200, finance: 200 }],
    ['GET', `/platform/businesses/${ids.bizA}/stats?range=90d`, { super: 200, support: 200, finance: 200 }],
    ['GET', `/platform/businesses/${ids.bizA}/subscription`, { super: 200, support: 403, finance: 200 }],
    ['GET', '/platform/plans', { super: 200, support: 200, finance: 200 }],
    ['GET', '/platform/billing/trend?range=6m', { super: 200, support: 403, finance: 200 }],
    ['GET', `/platform/users/${ids.staffA}`, { super: 200, support: 200, finance: 403 }],
    ['GET', '/platform/email/templates', { super: 200, support: 403, finance: 403 }],
    ['GET', '/platform/email/messages', { super: 200, support: 403, finance: 403 }],
    ['GET', '/platform/notifications', { super: 200, support: 200, finance: 200 }],
    ['GET', '/platform/search?q=Shop', { super: 200, support: 200, finance: 200 }],
    ['GET', '/platform/audit/verify', { super: 200, support: 403, finance: 403 }],
  ];
  for (const [method, path, expected, body] of newMatrix) {
    for (const [who, token] of [['super', superToken], ['support', supportToken], ['finance', financeToken]] as const) {
      res = await call(method, path, { token, body });
      check(`${who} ${method} ${path} -> ${expected[who]}`, res.status === expected[who], res.status);
    }
  }
  res = await call('GET', '/platform/search?q=Shop', { token: financeToken });
  check('finance search shows no user results', !res.body.results.some((row: any) => row.type === 'user'), res.body.results);

  const statsA = (await call('GET', `/platform/businesses/${ids.bizA}/stats?range=30d`, { token: superToken })).body;
  const statsB = (await call('GET', `/platform/businesses/${ids.bizB}/stats?range=30d`, { token: superToken })).body;
  const [{ a: usersInA, b: usersInB }] = await AppDataSource.query(`SELECT (SELECT COUNT(*)::int FROM users WHERE business_id = $1) AS a, (SELECT COUNT(*)::int FROM users WHERE business_id = $2) AS b`, [ids.bizA, ids.bizB]);
  check('organization stats are scoped to one business', statsA.kpis.users === usersInA && statsB.kpis.users === usersInB && usersInA !== usersInB && statsA.kpis.range_total !== statsB.kpis.range_total, { a: statsA.kpis.users, b: statsB.kpis.users, usersInA, usersInB });
  res = await call('GET', `/platform/users?business_id=${ids.bizA}&limit=50`, { token: superToken });
  check('organization user list never includes other businesses', res.status === 200 && res.body.rows.length === usersInA && res.body.rows.every((row: any) => row.business_id === ids.bizA), res.body.rows?.length);
  res = await call('GET', `/platform/activity?business_id=${ids.bizB}`, { token: superToken });
  check('organization activity is scoped', res.status === 200 && res.body.rows.every((row: any) => row.business_id === ids.bizB), res.body.rows);

  res = await call('POST', '/platform/plans', { token: supportToken, body: { code: 'essential', name: 'Essential', monthly_price: 40000, reason: reason.reason } });
  check('support cannot create plans', res.status === 403, res.status);
  res = await call('POST', '/platform/plans', { token: financeToken, body: { code: 'essential', name: 'Essential', monthly_price: 40000, reason: reason.reason } });
  check('finance creates a plan', res.status === 201, res.body);
  res = await call('POST', '/platform/plans', { token: financeToken, body: { code: 'essential2', name: 'essential', monthly_price: 1, reason: reason.reason } });
  check('duplicate plan names are refused', res.status === 409, res.status);
  res = await call('POST', `/platform/businesses/${ids.bizA}/subscription`, { token: supportToken, body: { action: 'extend', days: 5, reason: reason.reason } });
  check('support cannot change subscriptions', res.status === 403, res.status);
  res = await call('POST', `/platform/businesses/${ids.bizA}/subscription`, { token: superToken, body: { action: 'change-plan', plan: 'ghost', months: 1, reason: reason.reason } });
  check('unknown plans are refused', res.status === 400, res.status);
  const beforeChange = Date.now();
  res = await call('POST', `/platform/businesses/${ids.bizA}/subscription`, { token: financeToken, body: { action: 'change-plan', plan: 'essential', months: 1, reason: reason.reason } });
  const firstEnd = new Date(res.body?.subscription?.ends_at ?? 0);
  const monthLater = new Date(beforeChange); monthLater.setUTCMonth(monthLater.getUTCMonth() + 1);
  check('a paid plan runs for the chosen months', res.status === 200 && res.body.subscription.status === 'active' && Math.abs(firstEnd.getTime() - monthLater.getTime()) < 86_400_000 * 2, res.body);
  const subA = (await call('GET', `/platform/businesses/${ids.bizA}/subscription`, { token: financeToken })).body;
  check('starting a paid plan creates one unpaid invoice at list price', subA.invoices.length === 1 && subA.invoices[0].amount === 40000 && subA.invoices[0].status === 'open', subA.invoices);
  check('subscription history records before and after', subA.history.some((row: any) => row.action === 'subscription.started' && row.metadata?.before?.plan === 'free' && row.metadata?.after?.plan === 'essential'), subA.history);
  res = await call('POST', `/platform/businesses/${ids.bizA}/subscription`, { token: financeToken, body: { action: 'renew', months: 3, reason: reason.reason } });
  const renewedEnd = new Date(res.body?.subscription?.ends_at ?? 0);
  const expectedRenew = new Date(firstEnd); expectedRenew.setUTCMonth(expectedRenew.getUTCMonth() + 3);
  check('renewing extends from the current expiry', res.status === 200 && Math.abs(renewedEnd.getTime() - expectedRenew.getTime()) < 86_400_000, { renewedEnd, expectedRenew });
  const { BusinessPlatformState } = entities;
  await repo(BusinessPlatformState).update({ business_id: ids.bizA }, { current_period_end: new Date(Date.now() - 86_400_000) });
  let subNow = (await call('GET', `/platform/businesses/${ids.bizA}/subscription`, { token: financeToken })).body.subscription;
  check('one day after expiry is the grace period', subNow.status === 'grace' && subNow.grace_days_remaining === 2 && subNow.grace_period_days === 3, subNow);
  let orgA = (await call('GET', `/platform/businesses/${ids.bizA}`, { token: superToken })).body;
  check('grace keeps the organization active', orgA.org_status === 'active', orgA.org_status);
  await repo(BusinessPlatformState).update({ business_id: ids.bizA }, { current_period_end: new Date(Date.now() - 4 * 86_400_000) });
  subNow = (await call('GET', `/platform/businesses/${ids.bizA}/subscription`, { token: financeToken })).body.subscription;
  orgA = (await call('GET', `/platform/businesses/${ids.bizA}`, { token: superToken })).body;
  check('after the 3-day grace period the subscription is expired', subNow.status === 'expired' && orgA.org_status === 'expired', { subNow, org: orgA.org_status });
  res = await call('GET', '/platform/billing?status=expired', { token: financeToken });
  check('billing list filters expired subscriptions', res.status === 200 && res.body.rows.length === 1 && res.body.rows[0].id === ids.bizA, res.body.rows);
  const { runSubscriptionLifecycle } = await import('../src/lib/lifecycle');
  await runSubscriptionLifecycle();
  await runSubscriptionLifecycle();
  const expiryNotes = await AppDataSource.query(`SELECT recipient_admin_id FROM notifications WHERE dedupe_key LIKE 'expired:${ids.bizA}:%'`);
  const billingAdmins = (await repo(entities.PlatformAdmin).find({ where: { active: true } })).filter((admin) => ['SUPER_ADMIN', 'FINANCE'].includes(admin.role)).length;
  check('expiry notifies billing admins once each, even when the job reruns', expiryNotes.length === billingAdmins && new Set(expiryNotes.map((row: any) => row.recipient_admin_id)).size === billingAdmins, { notes: expiryNotes.length, billingAdmins });
  const expiryEmails = await AppDataSource.query(`SELECT COUNT(*)::int AS n FROM email_messages WHERE template_key = 'subscription.expired' AND to_email = 'owner-a@example.test'`);
  check('expiry emails the owner once', expiryEmails[0].n === 1, expiryEmails[0]);
  res = await call('POST', `/platform/businesses/${ids.bizA}/subscription`, { token: financeToken, body: { action: 'suspend', reason: reason.reason } });
  check('subscriptions can be suspended', res.status === 200 && res.body.subscription.status === 'suspended', res.body);
  res = await call('POST', `/platform/businesses/${ids.bizA}/subscription`, { token: financeToken, body: { action: 'suspend', reason: reason.reason } });
  check('suspending twice is refused', res.status === 409, res.status);
  res = await call('POST', `/platform/businesses/${ids.bizA}/subscription`, { token: financeToken, body: { action: 'reactivate', reason: reason.reason } });
  check('suspended subscriptions can be reactivated', res.status === 200 && res.body.subscription.stored_status === 'active', res.body);

  res = await call('POST', '/platform/support/grants', { token: supportToken, body: { business_id: ids.bizA, level: 3, minutes: 15, reason: reason.reason } });
  check('support staff cannot start level 3 access', res.status === 403, res.status);
  res = await call('POST', '/platform/support/grants', { token: supportToken, body: { business_id: ids.bizA, level: 2, minutes: 15, reason: reason.reason } });
  check('support starts level 2 access', res.status === 201 && res.body.grant.level === 2, res.body);
  res = await call('GET', `/platform/support/${ids.bizA}/sales`, { token: supportToken });
  const maskedNames = (res.body.rows ?? []).map((row: any) => row.customer_name).filter(Boolean);
  check('level 2 masks customer names', res.status === 200 && res.body.masked === true && maskedNames.length > 0 && maskedNames.every((name: string) => name !== 'Grace' && name.startsWith('G')), maskedNames);
  res = await call('GET', `/platform/support/${ids.bizB}/sales`, { token: supportToken });
  check('a grant for one business does not open another', res.status === 403, res.status);
  res = await call('PATCH', `/platform/businesses/${ids.bizA}/profile`, { token: superToken, body: { address: 'Kigali, Rwanda', reason: reason.reason } });
  check('profile edits need a level 3 session', res.status === 403 && res.body.code === 'NO_ACTIVE_GRANT', res.body);
  res = await call('POST', '/platform/support/grants', { token: superToken, body: { business_id: ids.bizA, level: 4, minutes: 15, reason: reason.reason } });
  check('emergency access needs the admin password', res.status === 401, res.status);
  res = await call('POST', '/platform/support/grants', { token: superToken, body: { business_id: ids.bizA, level: 4, minutes: 30, password: 'SuperAdmin#2026', reason: reason.reason } });
  check('emergency access is capped at 15 minutes', res.status === 400, res.status);
  res = await call('POST', '/platform/support/grants', { token: superToken, body: { business_id: ids.bizA, level: 4, minutes: 15, password: 'SuperAdmin#2026', reason: reason.reason } });
  const emergencyId = res.body?.grant?.id;
  check('super admin starts emergency access with password', res.status === 201, res.body);
  res = await call('GET', `/platform/support/${ids.bizA}/sales`, { token: superToken });
  check('emergency access unmasks customers and is logged', res.status === 200 && res.body.masked === false && res.body.rows.some((row: any) => row.customer_name === 'Grace'), res.body.masked);
  res = await call('PATCH', `/platform/businesses/${ids.bizA}/profile`, { token: superToken, body: { address: 'Kigali, Rwanda', contact_email: 'hello@shop-a.test', reason: reason.reason } });
  check('profile edits work inside an elevated session', res.status === 200, res.body);
  const profileAudit = await repo(PlatformAuditLog).findOneBy({ action: 'business.profile_changed', business_id: ids.bizA });
  check('profile edits record previous and new values and the grant', (profileAudit?.metadata as any)?.before?.address === null && (profileAudit?.metadata as any)?.after?.address === 'Kigali, Rwanda' && (profileAudit?.metadata as any)?.grant_id === emergencyId, profileAudit?.metadata);
  const supportNotes = (await call('GET', '/platform/notifications', { token: superToken })).body;
  check('elevated access does not notify the admin who started it', !supportNotes.rows.some((row: any) => row.category === 'support' && row.resource_id === emergencyId), supportNotes.rows.length);
  res = await call('GET', '/platform/support/grants', { token: superToken });
  check('grants count logged actions', res.body.rows.find((row: any) => row.id === emergencyId)?.actions >= 2, res.body.rows[0]);
  res = await call('POST', `/platform/support/grants/${emergencyId}/revoke`, { token: superToken });
  res = await call('GET', `/platform/support/${ids.bizA}/sales`, { token: superToken });
  check('ending access closes it immediately', res.status === 403, res.status);

  res = await call('POST', `/platform/users/${ids.ownerA}/role`, { token: supportToken, body: { role: 'MANAGER', reason: reason.reason } });
  check('owner roles cannot be changed by MIA', res.status === 400, res.status);
  res = await call('POST', `/platform/users/${ids.managerA}/role`, { token: financeToken, body: { role: 'CASHIER', reason: reason.reason } });
  check('finance cannot change roles', res.status === 403, res.status);
  res = await call('POST', `/platform/users/${ids.managerA}/role`, { token: supportToken, body: { role: 'CASHIER', reason: reason.reason } });
  const roleAudit = await repo(PlatformAuditLog).findOneBy({ action: 'user.role_changed', target_id: ids.managerA });
  check('role changes are audited with before and after', res.status === 200 && (roleAudit?.metadata as any)?.before?.role === 'MANAGER' && (roleAudit?.metadata as any)?.after?.role === 'CASHIER', roleAudit?.metadata);
  await call('POST', `/platform/users/${ids.managerA}/role`, { token: supportToken, body: { role: 'MANAGER', reason: reason.reason } });
  res = await call('POST', '/platform/users', { token: supportToken, body: { business_id: ids.bizB, name: 'New Cashier', email: 'new-cashier@example.test', role: 'CASHIER', reason: reason.reason } });
  check('support adds a user with a one-time temporary PIN', res.status === 201 && /^\d{4}$/.test(res.body.temporary_pin), res.body);
  res = await call('POST', '/platform/users', { token: supportToken, body: { business_id: ids.bizB, name: 'Bad Owner', email: 'bad-owner@example.test', role: 'OWNER', reason: reason.reason } });
  check('MIA cannot create owners', res.status === 400, res.status);
  res = await call('GET', `/platform/users/${ids.staffA}`, { token: supportToken });
  check('user details never include secrets', res.status === 200 && !res.text.includes('password_hash') && Array.isArray(res.body.logins) && Array.isArray(res.body.permissions), Object.keys(res.body ?? {}));

  res = await call('POST', `/platform/businesses/${ids.bizB}/suspend`, { token: superToken, body: reason });
  const supportInbox = (await call('GET', '/platform/notifications', { token: supportToken })).body;
  const suspendNote = supportInbox.rows.find((row: any) => row.category === 'businesses' && row.business_id === ids.bizB);
  check('suspending notifies other admins in-app', Boolean(suspendNote) && supportInbox.unread >= 1, supportInbox.rows.map((row: any) => row.title));
  res = await call('POST', `/platform/notifications/${suspendNote?.id}/read`, { token: financeToken });
  check('admins cannot touch another admin’s notifications', res.status === 404, res.status);
  res = await call('POST', `/platform/notifications/${suspendNote?.id}/read`, { token: supportToken });
  check('marking read lowers the unread count', res.status === 200 && res.body.unread === supportInbox.unread - 1, res.body);
  res = await call('POST', '/platform/notifications/read-all', { token: supportToken });
  check('mark all as read clears the count', res.status === 200 && (await call('GET', '/platform/notifications/unread-count', { token: supportToken })).body.unread === 0, res.body);
  await call('POST', `/platform/businesses/${ids.bizB}/reactivate`, { token: superToken, body: reason });

  res = await call('GET', '/platform/audit/verify', { token: superToken });
  check('the audit chain verifies', res.status === 200 && res.body.ok === true && res.body.checked > 20, res.body);
  let tamperBlocked = false;
  try {
    await AppDataSource.query(`UPDATE platform_audit_logs SET reason = 'tampered' WHERE id = (SELECT id FROM platform_audit_logs LIMIT 1)`);
  } catch {
    tamperBlocked = true;
  }
  check('the database refuses to edit audit entries', tamperBlocked);
  let deleteBlocked = false;
  try {
    await AppDataSource.query(`DELETE FROM platform_audit_logs WHERE id = (SELECT id FROM platform_audit_logs LIMIT 1)`);
  } catch {
    deleteBlocked = true;
  }
  check('the database refuses to delete audit entries', deleteBlocked);
  res = await call('GET', `/platform/audit?business_id=${ids.bizB}&limit=200`, { token: superToken });
  check('audit can be filtered to one organization', res.status === 200 && res.body.rows.length > 0 && res.body.rows.every((row: any) => row.business_name === 'Shop B'), res.body.rows?.length);
  res = await call('GET', '/platform/audit?result=denied', { token: superToken });
  check('denied attempts are recorded as denied', res.status === 200 && res.body.rows.some((row: any) => row.action === 'business.profile_change_denied'), res.body.rows?.map((row: any) => row.action));

  res = await call('GET', '/platform/email/templates', { token: superToken });
  check('every required email template exists', res.status === 200 && res.body.rows.length >= 35 && ['auth.sign_in_code', 'subscription.grace', 'businesses.suspended', 'users.invitation', 'platform.maintenance'].every((key) => res.body.rows.some((row: any) => row.key === key)), res.body.rows?.length);
  res = await call('PUT', '/platform/email/templates/subscription.grace', { token: superToken, body: { locale: 'en', subject: 'Grace {{secret_token}}', heading: 'x', body: 'y', active: true, reason: reason.reason } });
  check('unknown template variables are refused', res.status === 400, res.body);
  res = await call('PUT', '/platform/email/templates/auth.sign_in_code', { token: superToken, body: { locale: 'en', subject: 'Code', heading: 'Code', body: 'Here: {{verification_code}} for {{expiration_time}}', active: false, reason: reason.reason } });
  check('security code emails cannot be turned off', res.status === 400, res.body);
  const loginMail = await AppDataSource.query(`SELECT html, text, sensitive FROM email_messages WHERE template_key = 'auth.sign_in_code' LIMIT 1`);
  check('sign-in code emails are logged without their body', loginMail.length === 1 && loginMail[0].sensitive === true && loginMail[0].html === null && loginMail[0].text === null, loginMail[0]);
  res = await call('POST', '/platform/email/audience/preview', { token: superToken, body: { audience: { type: 'organizations', business_ids: [ids.bizA], recipients: 'owners' } } });
  check('audience preview counts real owners', res.status === 200 && res.body.recipients === 1 && res.body.organizations === 1, res.body);
  res = await call('POST', '/platform/email/campaigns', { token: superToken, body: { audience: { type: 'all', recipients: 'owners' }, subject: 'Hello all', heading: 'Hello', body: 'Body text here', reason: reason.reason } });
  check('emailing every organization needs confirmation', res.status === 400 && res.body.code === 'CONFIRM_ALL_REQUIRED', res.body);
  res = await call('POST', '/platform/email/campaigns', { token: superToken, body: { audience: { type: 'organizations', business_ids: [ids.bizA, ids.bizB], recipients: 'all_users' }, subject: 'Maintenance tonight', heading: 'Maintenance', body: 'Hello {{recipient_name}} at {{organization_name}}', reason: reason.reason } });
  const campaignId = res.body?.id;
  check('campaigns resolve real recipients', res.status === 201 && res.body.recipients >= 5 && res.body.organizations === 2, res.body);
  const { dispatchCampaign } = await import('../src/lib/campaigns');
  for (let i = 0; i < 50; i += 1) {
    const [state] = await AppDataSource.query(`SELECT status FROM email_campaigns WHERE id = $1`, [campaignId]);
    if (state?.status === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check('dispatching an already-sent campaign again does nothing', (await dispatchCampaign(campaignId)) === 0);
  const campaignRows = await AppDataSource.query(`SELECT to_email, html FROM email_messages WHERE campaign_id = $1`, [campaignId]);
  check('campaigns queue one email per person and never twice', campaignRows.length === res.body.recipients && new Set(campaignRows.map((row: any) => row.to_email)).size === campaignRows.length, campaignRows.length);
  check('campaign emails are personalised and escaped', campaignRows.some((row: any) => row.to_email === 'owner-b@example.test' && row.html.includes('Shop B')), campaignRows.length);
  res = await call('POST', '/platform/email/campaigns', { token: supportToken, body: { audience: { type: 'organizations', business_ids: [ids.bizA], recipients: 'owners' }, subject: 'Nope', heading: 'Nope', body: 'Nope body', reason: reason.reason } });
  check('support cannot send campaigns', res.status === 403, res.status);
  res = await call('POST', '/webhooks/email', { body: { message_id: randomUUID(), event: 'delivered' } });
  check('email webhooks are closed until a secret is configured', res.status === 404 || res.status === 503, res.status);

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
