import { purchaseRepository } from '@/repositories/purchases/purchases';
import { productRepository, stockMovementRepository } from '@/repositories/products/products';
import { queueSync } from '@/services/sync/queue';
import { assertDayIsOpen } from './guards';
import { settleSupplierAccount } from './settle';
import { reconcileProductCost } from './averageCost';
import { recordStockMovement } from './recordStockMovement';
import { UserRole } from '@/types';

export async function voidPurchase(input: {
  businessId: string;
  purchaseId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  reason?: string;
}): Promise<void> {
  const purchase = await purchaseRepository.findById(input.purchaseId, input.businessId);
  if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
  if (purchase.status === 'cancelled') throw new Error('ALREADY_VOID');

  await assertDayIsOpen(input.businessId, purchase.purchase_date);

  const recorded = await stockMovementRepository.findByReference('purchase', purchase.id, input.businessId);
  const received = recorded.filter((movement) => movement.type === 'purchase');

  for (const movement of received) {
    const onHand = await productRepository.getStockBalance(movement.product_id, input.businessId);
    if (movement.quantity > onHand) {
      const product = await productRepository.findById(movement.product_id, input.businessId);
      const error = new Error('STOCK_ALREADY_SOLD') as Error & { productName?: string };
      error.productName = product?.name;
      throw error;
    }
  }

  const now = new Date().toISOString();
  const productIds = new Set<string>();
  for (const item of received) {
    productIds.add(item.product_id);
    await recordStockMovement({
      businessId: input.businessId,
      productId: item.product_id,
      userId: input.userId,
      deviceId: input.deviceId,
      role: input.role,
      type: 'return_out',
      quantity: item.quantity,
      unitCost: item.unit_cost,
      referenceType: 'purchase_return',
      referenceId: purchase.id,
      occurredAt: now,
      reason: input.reason?.trim() || 'Purchase void',
      reversalOf: item.id,
      businessDate: purchase.purchase_date,
    });
  }

  const updated = await purchaseRepository.update(purchase.id, input.businessId, {
    status: 'cancelled',
    sync_status: 'pending',
  });
  if (updated) {
    await queueSync('purchases', purchase.id, 'update', updated as unknown as Record<string, unknown>, input.businessId);
  }

  await settleSupplierAccount(input.businessId, purchase.supplier_id);
  for (const productId of productIds) {
    await reconcileProductCost(input.businessId, productId);
  }
}
