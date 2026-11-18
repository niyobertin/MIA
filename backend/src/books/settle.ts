import { allocateDocuments, type AllocationStatus } from '../shared/calculations';
import { Ctx, num, one, rows } from './core';

function saleStatus(allocated: AllocationStatus, previous: string): string {
  if (allocated === 'paid') return 'paid';
  if (allocated === 'partial') return 'partial';
  return previous === 'unpaid' ? 'unpaid' : 'credit';
}

/** Mirrors the phone's settleCustomerAccount: later customer payments pay the oldest open sales first. */
export async function settleCustomer(ctx: Ctx, customerId: string | null): Promise<void> {
  if (!customerId) return;
  const sales = await rows<{ id: string; total_amount: string; paid_amount: string; payment_status: string }>(
    ctx,
    `SELECT id, total_amount, paid_amount, payment_status FROM sales
     WHERE business_id = $1 AND customer_id = $2 AND voided = false
     ORDER BY sale_date ASC, created_at ASC`,
    [ctx.businessId, customerId],
  );
  if (sales.length === 0) return;
  const checkout = await rows<{ reference_id: string; amount: string }>(
    ctx,
    `SELECT reference_id::text AS reference_id, SUM(amount) AS amount FROM payments
     WHERE business_id = $1 AND type = 'sale_payment' AND reference_type = 'sale' AND reference_id = ANY($2::uuid[])
     GROUP BY reference_id`,
    [ctx.businessId, sales.map((s) => s.id)],
  );
  const paidAtCheckout = new Map(checkout.map((r) => [r.reference_id, num(r.amount)]));
  const pool = await one<{ total: string }>(
    ctx,
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE business_id = $1 AND type = 'customer_payment' AND party_id = $2`,
    [ctx.businessId, customerId],
  );
  const allocated = allocateDocuments(
    sales.map((s) => ({ id: s.id, total: num(s.total_amount), checkoutPaid: paidAtCheckout.get(s.id) ?? 0 })),
    num(pool?.total),
  );
  for (const row of allocated) {
    const current = sales.find((s) => s.id === row.id)!;
    const status = saleStatus(row.status, current.payment_status);
    if (num(current.paid_amount) === row.paid && current.payment_status === status) continue;
    await ctx.tx.query(
      `UPDATE sales SET paid_amount = $3, payment_status = $4, updated_at = now() WHERE business_id = $1 AND id = $2`,
      [ctx.businessId, row.id, row.paid, status],
    );
  }
}

/** Mirrors the phone's settleSupplierAccount for stock-in bought on credit. */
export async function settleSupplier(ctx: Ctx, supplierId: string | null): Promise<void> {
  if (!supplierId) return;
  const purchases = await rows<{ id: string; total_amount: string; paid_amount: string; status: string }>(
    ctx,
    `SELECT id, total_amount, paid_amount, status FROM purchases
     WHERE business_id = $1 AND supplier_id = $2 AND status <> 'cancelled'
     ORDER BY purchase_date ASC, created_at ASC`,
    [ctx.businessId, supplierId],
  );
  if (purchases.length === 0) return;
  const checkout = await rows<{ reference_id: string; amount: string }>(
    ctx,
    `SELECT reference_id::text AS reference_id, SUM(amount) AS amount FROM payments
     WHERE business_id = $1 AND type = 'purchase_payment' AND reference_type = 'purchase' AND reference_id = ANY($2::uuid[])
     GROUP BY reference_id`,
    [ctx.businessId, purchases.map((p) => p.id)],
  );
  const paidAtCheckout = new Map(checkout.map((r) => [r.reference_id, num(r.amount)]));
  const pool = await one<{ total: string }>(
    ctx,
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE business_id = $1 AND type = 'supplier_payment' AND party_id = $2`,
    [ctx.businessId, supplierId],
  );
  const allocated = allocateDocuments(
    purchases.map((p) => ({ id: p.id, total: num(p.total_amount), checkoutPaid: paidAtCheckout.get(p.id) ?? 0 })),
    num(pool?.total),
  );
  for (const row of allocated) {
    const current = purchases.find((p) => p.id === row.id)!;
    const status = row.status === 'paid' ? 'completed' : 'pending';
    if (num(current.paid_amount) === row.paid && current.status === status) continue;
    await ctx.tx.query(
      `UPDATE purchases SET paid_amount = $3, status = $4, updated_at = now() WHERE business_id = $1 AND id = $2`,
      [ctx.businessId, row.id, row.paid, status],
    );
  }
}
