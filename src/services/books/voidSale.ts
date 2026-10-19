import { saleRepository } from '@/repositories/sales/sales';
import { stockMovementRepository } from '@/repositories/products/products';
import { queueSync } from '@/services/sync/queue';
import { assertSessionMutable } from './session';
import { settleCustomerAccount } from './settle';
import { recordStockMovement } from './recordStockMovement';
import { audit } from './audit';
import { UserRole } from '@/types';

export async function voidSale(input: {
  businessId: string;
  saleId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  reason?: string;
}): Promise<void> {
  const sale = await saleRepository.findById(input.saleId, input.businessId);
  if (!sale) throw new Error('SALE_NOT_FOUND');
  if (sale.voided) throw new Error('ALREADY_VOID');

  // Closed sessions are history-locked — post a correction in the open session instead.
  await assertSessionMutable(input.businessId, sale.session_id);

  const recorded = await stockMovementRepository.findByReference('sale', sale.id, input.businessId);
  const now = new Date().toISOString();

  for (const item of recorded) {
    if (item.type !== 'sale') continue;
    await recordStockMovement({
      businessId: input.businessId,
      productId: item.product_id,
      userId: input.userId,
      deviceId: input.deviceId,
      role: input.role,
      type: 'return_in',
      quantity: item.quantity,
      unitCost: item.unit_cost,
      referenceType: 'sale_return',
      referenceId: sale.id,
      occurredAt: now,
      reason: input.reason?.trim() || 'Sale void',
      reversalOf: item.id,
      businessDate: sale.sale_date,
    });
  }

  const updated = await saleRepository.update(sale.id, input.businessId, {
    voided: true,
    sync_status: 'pending',
  });
  if (updated) {
    await queueSync('sales', sale.id, 'update', updated as unknown as Record<string, unknown>, input.businessId);
  }

  await settleCustomerAccount(input.businessId, sale.customer_id);
  await audit({
    businessId: input.businessId,
    userId: input.userId,
    role: input.role,
    action: 'sale.void',
    entity: 'sale',
    entityId: sale.id,
    before: { total_amount: sale.total_amount },
    reason: input.reason?.trim() || 'Sale void',
    deviceId: input.deviceId,
  });
}
