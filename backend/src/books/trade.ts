import { belowCostLines, calculateSaleTotal, outstandingBalance } from '../shared/calculations';
import { audit, BooksError, businessToday, Ctx, newId, num, one, reference, rows, WEB_DEVICE } from './core';
import { getOpenSession, requireOpenSession } from './session';
import { settleCustomer, settleSupplier } from './settle';
import { recordMovement, stockBalance } from './stock';

export type PayMethod = 'cash' | 'mobile_money' | 'bank' | 'credit';
const manager = (ctx: Ctx) => ctx.role === 'OWNER' || ctx.role === 'MANAGER';

type ProductRow = { id: string; name: string; selling_price: string; average_cost: string; track_inventory: boolean; active: boolean };

async function product(ctx: Ctx, id: string): Promise<ProductRow> {
  const found = await one<ProductRow>(
    ctx, `SELECT id, name, selling_price, average_cost, track_inventory, active FROM products WHERE business_id=$1 AND id=$2`, [ctx.businessId, id],
  );
  if (!found) throw new BooksError('PRODUCT_NOT_FOUND', 404);
  return found;
}

async function customerPosition(ctx: Ctx, customerId: string) {
  const owed = await one<{ total: string }>(ctx, `SELECT COALESCE(SUM(total_amount),0) AS total FROM sales WHERE business_id=$1 AND customer_id=$2 AND voided=false`, [ctx.businessId, customerId]);
  const checkout = await one<{ total: string }>(
    ctx,
    `SELECT COALESCE(SUM(p.amount),0) AS total FROM payments p JOIN sales s ON s.id=p.reference_id AND s.business_id=p.business_id
     WHERE p.business_id=$1 AND p.type='sale_payment' AND p.reference_type='sale' AND s.customer_id=$2 AND s.voided=false`,
    [ctx.businessId, customerId],
  );
  const later = await one<{ total: string }>(ctx, `SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE business_id=$1 AND type='customer_payment' AND party_id=$2`, [ctx.businessId, customerId]);
  const paid = num(checkout?.total) + num(later?.total);
  return { owed: num(owed?.total), paid, outstanding: outstandingBalance(num(owed?.total), paid) };
}

async function supplierPosition(ctx: Ctx, supplierId: string) {
  const owed = await one<{ total: string }>(ctx, `SELECT COALESCE(SUM(total_amount),0) AS total FROM purchases WHERE business_id=$1 AND supplier_id=$2 AND status<>'cancelled'`, [ctx.businessId, supplierId]);
  const checkout = await one<{ total: string }>(
    ctx,
    `SELECT COALESCE(SUM(p.amount),0) AS total FROM payments p JOIN purchases pr ON pr.id=p.reference_id AND pr.business_id=p.business_id
     WHERE p.business_id=$1 AND p.type='purchase_payment' AND p.reference_type='purchase' AND pr.supplier_id=$2 AND pr.status<>'cancelled'`,
    [ctx.businessId, supplierId],
  );
  const later = await one<{ total: string }>(ctx, `SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE business_id=$1 AND type='supplier_payment' AND party_id=$2`, [ctx.businessId, supplierId]);
  const paid = num(checkout?.total) + num(later?.total);
  return { owed: num(owed?.total), paid, outstanding: outstandingBalance(num(owed?.total), paid) };
}

export type SaleLine = { productId: string; quantity: number; sellingPrice: number; discountAmount?: number };

/** Mirrors the phone's useCreateSale + assertSaleAllowed: stock, price, below-cost and credit-limit checks, then sale, items, stock and payment. */
export async function createSale(ctx: Ctx, input: { items: SaleLine[]; paymentMethod: PayMethod; customerId: string | null; notes?: string | null; allowBelowCost?: boolean }) {
  if (ctx.role === 'STAFF') throw new BooksError('FORBIDDEN', 403);
  if (!input.items.length) throw new BooksError('ITEMS_REQUIRED');
  const session = await requireOpenSession(ctx);
  if (input.paymentMethod === 'credit' && !input.customerId) throw new BooksError('CUSTOMER_REQUIRED');
  if (input.customerId) {
    const customer = await one(ctx, `SELECT id FROM customers WHERE business_id=$1 AND id=$2`, [ctx.businessId, input.customerId]);
    if (!customer) throw new BooksError('NOT_FOUND', 404);
  }
  const priced: (SaleLine & { product: ProductRow; unitCost: number })[] = [];
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new BooksError('INVALID_QUANTITY');
    const found = await product(ctx, item.productId);
    if (!found.active) throw new BooksError('PRODUCT_NOT_FOUND', 404);
    const price = manager(ctx) ? item.sellingPrice : num(found.selling_price);
    const discount = manager(ctx) ? Math.max(0, item.discountAmount ?? 0) : 0;
    if (!Number.isInteger(price) || price < 1 || item.quantity * price - discount < 1) throw new BooksError('INVALID_PRICE', 400, { productName: found.name });
    if (found.track_inventory && item.quantity > (await stockBalance(ctx, item.productId))) {
      throw new BooksError('INSUFFICIENT_STOCK', 409, { productName: found.name });
    }
    priced.push({ ...item, sellingPrice: price, discountAmount: discount, product: found, unitCost: found.track_inventory ? num(found.average_cost) : 0 });
  }
  const cheap = belowCostLines(
    priced.filter((p) => p.unitCost > 0).map((p) => ({ productId: p.productId, quantity: p.quantity, sellingPrice: p.sellingPrice, discountAmount: p.discountAmount, unitCost: p.unitCost })),
  );
  if (cheap.length > 0 && !(manager(ctx) && input.allowBelowCost)) {
    const shortfall = cheap.reduce((s, l) => s + l.shortfallPerUnit * l.quantity, 0);
    const name = priced.find((p) => p.productId === cheap[0].productId)?.product.name;
    throw new BooksError('BELOW_COST', 409, { productName: name, shortfall, canOverride: manager(ctx) });
  }
  const subtotal = priced.reduce((s, p) => s + p.quantity * p.sellingPrice, 0);
  const discountTotal = priced.reduce((s, p) => s + (p.discountAmount ?? 0), 0);
  const total = calculateSaleTotal(subtotal, discountTotal, 0);
  if (input.paymentMethod === 'credit' && input.customerId) {
    const limit = await one<{ credit_limit: string }>(ctx, `SELECT credit_limit FROM customers WHERE id=$1`, [input.customerId]);
    if (num(limit?.credit_limit) > 0) {
      const position = await customerPosition(ctx, input.customerId);
      if (position.outstanding + total > num(limit?.credit_limit)) throw new BooksError('CREDIT_LIMIT', 409, { outstanding: position.outstanding });
    }
  }

  const saleId = newId();
  const day = businessToday(ctx.timezone);
  const paid = input.paymentMethod === 'credit' ? 0 : total;
  const ref = reference('SALE');
  await ctx.tx.query(
    `INSERT INTO sales (id, business_id, customer_id, session_id, reference_number, subtotal, discount_amount, tax_amount, total_amount, paid_amount, voided,
       payment_status, sale_date, notes, created_by, device_id, sync_status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,false,$10,$11,$12,$13,$14,'synced',now(),now())`,
    [saleId, ctx.businessId, input.customerId, session.id, ref, subtotal, discountTotal, total, paid, input.paymentMethod === 'credit' ? 'credit' : 'paid', day, input.notes ?? null, ctx.userId, WEB_DEVICE],
  );
  for (const p of priced) {
    await ctx.tx.query(
      `INSERT INTO sale_items (id, business_id, sale_id, product_id, quantity, selling_price, unit_cost, discount_amount, tax_amount, total_amount, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,now(),now())`,
      [newId(), ctx.businessId, saleId, p.productId, p.quantity, p.sellingPrice, p.unitCost, p.discountAmount ?? 0, p.quantity * p.sellingPrice - (p.discountAmount ?? 0)],
    );
    if (p.product.track_inventory) {
      await recordMovement(ctx, { productId: p.productId, type: 'sale', quantity: p.quantity, unitCost: p.unitCost, sessionId: session.id, referenceType: 'sale', referenceId: saleId });
    }
  }
  if (input.paymentMethod !== 'credit') {
    await ctx.tx.query(
      `INSERT INTO payments (id, business_id, session_id, type, payment_method, amount, reference_type, reference_id, party_id, payment_date, notes, created_by, device_id, sync_status, created_at, updated_at)
       VALUES ($1,$2,$3,'sale_payment',$4,$5,'sale',$6,$7,$8,$9,$10,$11,'synced',now(),now())`,
      [newId(), ctx.businessId, session.id, input.paymentMethod, total, saleId, input.customerId, day, input.notes ?? null, ctx.userId, WEB_DEVICE],
    );
  }
  await settleCustomer(ctx, input.customerId);
  await audit(ctx, {
    action: input.allowBelowCost && cheap.length ? 'price.below_cost_override' : 'sale.create', entity: 'sale', entityId: saleId,
    after: { total_amount: total, payment_method: input.paymentMethod },
  });
  return { id: saleId, reference_number: ref, total, paid };
}

/** Like the phone: owner/manager only, only while the sale's day is still open; stock comes back. */
export async function voidSale(ctx: Ctx, saleId: string, reason: string) {
  if (!manager(ctx)) throw new BooksError('FORBIDDEN', 403);
  if (!reason.trim()) throw new BooksError('REASON_REQUIRED');
  const sale = await one<{ id: string; voided: boolean; session_id: string | null; customer_id: string | null; total_amount: string }>(
    ctx, `SELECT id, voided, session_id::text AS session_id, customer_id::text AS customer_id, total_amount FROM sales WHERE business_id=$1 AND id=$2`, [ctx.businessId, saleId],
  );
  if (!sale) throw new BooksError('NOT_FOUND', 404);
  if (sale.voided) throw new BooksError('ALREADY_VOID', 409);
  const open = await getOpenSession(ctx);
  if (!open || sale.session_id !== open.id) throw new BooksError('HISTORY_LOCKED', 409);
  const moved = await rows<{ id: string; product_id: string; quantity: string; unit_cost: string }>(
    ctx, `SELECT id, product_id, quantity, unit_cost FROM stock_movements WHERE business_id=$1 AND reference_type='sale' AND reference_id=$2 AND type='sale'`, [ctx.businessId, saleId],
  );
  for (const m of moved) {
    await recordMovement(ctx, {
      productId: m.product_id, type: 'return_in', quantity: num(m.quantity), unitCost: num(m.unit_cost), sessionId: open.id,
      referenceType: 'sale_return', referenceId: saleId, reason, reversalOf: m.id,
    });
  }
  await ctx.tx.query(`UPDATE sales SET voided=true, updated_at=now() WHERE business_id=$1 AND id=$2`, [ctx.businessId, saleId]);
  await settleCustomer(ctx, sale.customer_id);
  await audit(ctx, { action: 'sale.void', entity: 'sale', entityId: saleId, before: { total_amount: num(sale.total_amount) }, reason });
}

export type PurchaseLine = { productId: string; quantity: number; unitCost: number };

/** Mirrors the phone's useCreatePurchase: stock comes in, average cost is recomputed, cash or credit with the supplier. */
export async function createPurchase(ctx: Ctx, input: { supplierId: string; items: PurchaseLine[]; paymentMethod: PayMethod; referenceNumber?: string | null; notes?: string | null }) {
  if (ctx.role === 'STAFF') throw new BooksError('FORBIDDEN', 403);
  if (!input.items.length) throw new BooksError('ITEMS_REQUIRED');
  const session = await requireOpenSession(ctx);
  const supplier = await one(ctx, `SELECT id FROM suppliers WHERE business_id=$1 AND id=$2`, [ctx.businessId, input.supplierId]);
  if (!supplier) throw new BooksError('NOT_FOUND', 404);
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new BooksError('INVALID_QUANTITY');
    if (!Number.isInteger(item.unitCost) || item.unitCost < 0) throw new BooksError('INVALID_PRICE');
  }
  const total = input.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const id = newId();
  const day = businessToday(ctx.timezone);
  const credit = input.paymentMethod === 'credit';
  const ref = input.referenceNumber?.trim() || reference('PUR');
  await ctx.tx.query(
    `INSERT INTO purchases (id, business_id, supplier_id, session_id, reference_number, total_amount, paid_amount, status, purchase_date, notes, created_by, device_id, sync_status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'synced',now(),now())`,
    [id, ctx.businessId, input.supplierId, session.id, ref, total, credit ? 0 : total, credit ? 'pending' : 'completed', day, input.notes ?? null, ctx.userId, WEB_DEVICE],
  );
  for (const item of input.items) {
    const found = await product(ctx, item.productId);
    await ctx.tx.query(
      `INSERT INTO purchase_items (id, business_id, purchase_id, product_id, quantity, unit_cost, total_cost, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())`,
      [newId(), ctx.businessId, id, item.productId, item.quantity, item.unitCost, item.quantity * item.unitCost],
    );
    if (found.track_inventory) {
      await recordMovement(ctx, { productId: item.productId, type: 'purchase', quantity: item.quantity, unitCost: item.unitCost, sessionId: session.id, referenceType: 'purchase', referenceId: id });
    }
  }
  if (!credit) {
    await ctx.tx.query(
      `INSERT INTO payments (id, business_id, session_id, type, payment_method, amount, reference_type, reference_id, party_id, payment_date, notes, created_by, device_id, sync_status, created_at, updated_at)
       VALUES ($1,$2,$3,'purchase_payment',$4,$5,'purchase',$6,$7,$8,$9,$10,$11,'synced',now(),now())`,
      [newId(), ctx.businessId, session.id, input.paymentMethod, total, id, input.supplierId, day, input.notes ?? null, ctx.userId, WEB_DEVICE],
    );
  }
  await settleSupplier(ctx, input.supplierId);
  await audit(ctx, { action: 'purchase.create', entity: 'purchase', entityId: id, after: { total_amount: total, payment_method: input.paymentMethod } });
  return { id, reference_number: ref, total };
}

export async function voidPurchase(ctx: Ctx, purchaseId: string, reason: string) {
  if (!manager(ctx)) throw new BooksError('FORBIDDEN', 403);
  if (!reason.trim()) throw new BooksError('REASON_REQUIRED');
  const purchase = await one<{ status: string; session_id: string | null; supplier_id: string; total_amount: string }>(
    ctx, `SELECT status, session_id::text AS session_id, supplier_id::text AS supplier_id, total_amount FROM purchases WHERE business_id=$1 AND id=$2`, [ctx.businessId, purchaseId],
  );
  if (!purchase) throw new BooksError('NOT_FOUND', 404);
  if (purchase.status === 'cancelled') throw new BooksError('ALREADY_VOID', 409);
  const open = await getOpenSession(ctx);
  if (!open || purchase.session_id !== open.id) throw new BooksError('HISTORY_LOCKED', 409);
  const received = await rows<{ id: string; product_id: string; quantity: string; unit_cost: string }>(
    ctx, `SELECT id, product_id, quantity, unit_cost FROM stock_movements WHERE business_id=$1 AND reference_type='purchase' AND reference_id=$2 AND type='purchase'`, [ctx.businessId, purchaseId],
  );
  for (const m of received) {
    if (num(m.quantity) > (await stockBalance(ctx, m.product_id))) {
      const name = (await one<{ name: string }>(ctx, `SELECT name FROM products WHERE id=$1`, [m.product_id]))?.name;
      throw new BooksError('STOCK_ALREADY_SOLD', 409, { productName: name });
    }
  }
  for (const m of received) {
    await recordMovement(ctx, {
      productId: m.product_id, type: 'return_out', quantity: num(m.quantity), unitCost: num(m.unit_cost), sessionId: open.id,
      referenceType: 'purchase_return', referenceId: purchaseId, reason, reversalOf: m.id,
    });
  }
  await ctx.tx.query(`UPDATE purchases SET status='cancelled', updated_at=now() WHERE business_id=$1 AND id=$2`, [ctx.businessId, purchaseId]);
  await settleSupplier(ctx, purchase.supplier_id);
  await audit(ctx, { action: 'purchase.void', entity: 'purchase', entityId: purchaseId, before: { total_amount: num(purchase.total_amount) }, reason });
}

export async function adjustStock(ctx: Ctx, input: { productId: string; kind: 'adjustment_in' | 'adjustment_out' | 'damaged'; quantity: number; reason: string }) {
  const session = await requireOpenSession(ctx);
  const found = await product(ctx, input.productId);
  const movement = await recordMovement(ctx, {
    productId: input.productId, type: input.kind, quantity: input.quantity, unitCost: num(found.average_cost),
    sessionId: session.id, referenceType: 'adjustment', referenceId: null, reason: input.reason,
  });
  await audit(ctx, {
    action: input.kind === 'damaged' ? 'stock.damage' : 'stock.adjust', entity: 'stock_movement', entityId: movement.id,
    after: { product_id: input.productId, kind: input.kind, quantity: input.quantity }, reason: input.reason,
  });
  return movement;
}

/** Later payments from a customer (debt collection); paid to the oldest open sales first. */
export async function customerPayment(ctx: Ctx, input: { customerId: string; amount: number; method: 'cash' | 'mobile_money' | 'bank'; notes?: string | null }) {
  if (ctx.role === 'STAFF') throw new BooksError('FORBIDDEN', 403);
  if (!Number.isInteger(input.amount) || input.amount < 1) throw new BooksError('INVALID_PRICE');
  const session = await requireOpenSession(ctx);
  const position = await customerPosition(ctx, input.customerId);
  if (position.outstanding <= 0 || input.amount > position.outstanding) throw new BooksError('OVERPAYMENT', 400, { outstanding: position.outstanding });
  const id = newId();
  await ctx.tx.query(
    `INSERT INTO payments (id, business_id, session_id, type, payment_method, amount, reference_type, reference_id, party_id, payment_date, notes, created_by, device_id, sync_status, created_at, updated_at)
     VALUES ($1,$2,$3,'customer_payment',$4,$5,'customer',$6,$6,$7,$8,$9,$10,'synced',now(),now())`,
    [id, ctx.businessId, session.id, input.method, input.amount, input.customerId, businessToday(ctx.timezone), input.notes ?? null, ctx.userId, WEB_DEVICE],
  );
  await settleCustomer(ctx, input.customerId);
  await audit(ctx, { action: 'payment.customer', entity: 'payment', entityId: id, after: { customer_id: input.customerId, amount: input.amount, method: input.method } });
  return { id, remaining: position.outstanding - input.amount };
}

export async function supplierPayment(ctx: Ctx, input: { supplierId: string; amount: number; method: 'cash' | 'mobile_money' | 'bank'; notes?: string | null }) {
  if (!manager(ctx) && ctx.role !== 'CASHIER') throw new BooksError('FORBIDDEN', 403);
  if (!Number.isInteger(input.amount) || input.amount < 1) throw new BooksError('INVALID_PRICE');
  const session = await requireOpenSession(ctx);
  const position = await supplierPosition(ctx, input.supplierId);
  if (position.outstanding <= 0 || input.amount > position.outstanding) throw new BooksError('OVERPAYMENT', 400, { outstanding: position.outstanding });
  const id = newId();
  await ctx.tx.query(
    `INSERT INTO payments (id, business_id, session_id, type, payment_method, amount, reference_type, reference_id, party_id, payment_date, notes, created_by, device_id, sync_status, created_at, updated_at)
     VALUES ($1,$2,$3,'supplier_payment',$4,$5,'supplier',$6,$6,$7,$8,$9,$10,'synced',now(),now())`,
    [id, ctx.businessId, session.id, input.method, input.amount, input.supplierId, businessToday(ctx.timezone), input.notes ?? null, ctx.userId, WEB_DEVICE],
  );
  await settleSupplier(ctx, input.supplierId);
  await audit(ctx, { action: 'payment.supplier', entity: 'payment', entityId: id, after: { supplier_id: input.supplierId, amount: input.amount, method: input.method } });
  return { id, remaining: position.outstanding - input.amount };
}
