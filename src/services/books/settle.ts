import { getDatabase } from '@/db/database';
import { saleRepository } from '@/repositories/sales/sales';
import { purchaseRepository } from '@/repositories/purchases/purchases';
import { queueSync } from '@/services/sync/queue';
import { allocateDocuments, AllocationStatus } from '@/services/financial/calculations';
import { PaymentStatus, PurchaseStatus } from '@/types';

function openSaleStatus(previous: string): PaymentStatus {
  if (previous === 'unpaid') return 'unpaid';
  return 'credit';
}

function saleStatus(allocated: AllocationStatus, previous: string): PaymentStatus {
  if (allocated === 'paid') return 'paid';
  if (allocated === 'partial') return 'partial';
  return openSaleStatus(previous);
}

function purchaseStatus(allocated: AllocationStatus): PurchaseStatus {
  return allocated === 'paid' ? 'completed' : 'pending';
}

export async function settleCustomerAccount(businessId: string, customerId: string | null): Promise<void> {
  if (!customerId) return;
  const db = await getDatabase();
  const sales = await db.getAllAsync<{
    id: string;
    total_amount: number;
    paid_amount: number;
    payment_status: string;
  }>(
    `SELECT id, total_amount, paid_amount, payment_status
     FROM sales
     WHERE business_id = ? AND customer_id = ? AND voided = 0
     ORDER BY sale_date ASC, created_at ASC`,
    [businessId, customerId]
  );
  if (sales.length === 0) return;

  const saleIds = new Set(sales.map((sale) => sale.id));
  const checkoutRows = await db.getAllAsync<{ reference_id: string; amount: number }>(
    `SELECT reference_id, amount
     FROM payments
     WHERE business_id = ? AND type = 'sale_payment' AND reference_type = 'sale' AND reference_id IS NOT NULL`,
    [businessId]
  );
  const checkout = new Map<string, number>();
  for (const row of checkoutRows) {
    if (!saleIds.has(row.reference_id)) continue;
    checkout.set(row.reference_id, (checkout.get(row.reference_id) ?? 0) + row.amount);
  }

  const poolRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM payments
     WHERE business_id = ? AND type = 'customer_payment' AND party_id = ?`,
    [businessId, customerId]
  );

  const allocated = allocateDocuments(
    sales.map((sale) => ({
      id: sale.id,
      total: sale.total_amount,
      checkoutPaid: checkout.get(sale.id) ?? 0,
    })),
    poolRow?.total ?? 0
  );

  for (const row of allocated) {
    const current = sales.find((sale) => sale.id === row.id);
    if (!current) continue;
    const status = saleStatus(row.status, current.payment_status);
    if (current.paid_amount === row.paid && current.payment_status === status) continue;
    const updated = await saleRepository.update(row.id, businessId, {
      paid_amount: row.paid,
      payment_status: status,
      sync_status: 'pending',
    });
    if (updated) {
      await queueSync('sales', row.id, 'update', updated as unknown as Record<string, unknown>, businessId);
    }
  }
}

export async function settleSupplierAccount(businessId: string, supplierId: string | null): Promise<void> {
  if (!supplierId) return;
  const db = await getDatabase();
  const purchases = await db.getAllAsync<{
    id: string;
    total_amount: number;
    paid_amount: number;
    status: string;
  }>(
    `SELECT id, total_amount, paid_amount, status
     FROM purchases
     WHERE business_id = ? AND supplier_id = ? AND status != 'cancelled'
     ORDER BY purchase_date ASC, created_at ASC`,
    [businessId, supplierId]
  );
  if (purchases.length === 0) return;

  const purchaseIds = new Set(purchases.map((purchase) => purchase.id));
  const checkoutRows = await db.getAllAsync<{ reference_id: string; amount: number }>(
    `SELECT reference_id, amount
     FROM payments
     WHERE business_id = ? AND type = 'purchase_payment' AND reference_type = 'purchase' AND reference_id IS NOT NULL`,
    [businessId]
  );
  const checkout = new Map<string, number>();
  for (const row of checkoutRows) {
    if (!purchaseIds.has(row.reference_id)) continue;
    checkout.set(row.reference_id, (checkout.get(row.reference_id) ?? 0) + row.amount);
  }

  const poolRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM payments
     WHERE business_id = ? AND type = 'supplier_payment' AND party_id = ?`,
    [businessId, supplierId]
  );

  const allocated = allocateDocuments(
    purchases.map((purchase) => ({
      id: purchase.id,
      total: purchase.total_amount,
      checkoutPaid: checkout.get(purchase.id) ?? 0,
    })),
    poolRow?.total ?? 0
  );

  for (const row of allocated) {
    const current = purchases.find((purchase) => purchase.id === row.id);
    if (!current) continue;
    const status = purchaseStatus(row.status);
    if (current.paid_amount === row.paid && current.status === status) continue;
    const updated = await purchaseRepository.update(row.id, businessId, {
      paid_amount: row.paid,
      status,
      sync_status: 'pending',
    });
    if (updated) {
      await queueSync('purchases', row.id, 'update', updated as unknown as Record<string, unknown>, businessId);
    }
  }
}

export async function backfillSettlements(): Promise<void> {
  const db = await getDatabase();
  const customers = await db.getAllAsync<{ business_id: string; party_id: string }>(
    `SELECT DISTINCT business_id, customer_id as party_id
     FROM sales
     WHERE customer_id IS NOT NULL
     UNION
     SELECT DISTINCT business_id, party_id
     FROM payments
     WHERE type = 'customer_payment' AND party_id IS NOT NULL`
  );
  for (const row of customers) {
    await settleCustomerAccount(row.business_id, row.party_id);
  }

  const suppliers = await db.getAllAsync<{ business_id: string; party_id: string }>(
    `SELECT DISTINCT business_id, supplier_id as party_id
     FROM purchases
     UNION
     SELECT DISTINCT business_id, party_id
     FROM payments
     WHERE type = 'supplier_payment' AND party_id IS NOT NULL`
  );
  for (const row of suppliers) {
    await settleSupplierAccount(row.business_id, row.party_id);
  }
}
