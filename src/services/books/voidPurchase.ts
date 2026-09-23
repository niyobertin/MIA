import { generateUUID } from '@/utils/uuid';
import { purchaseRepository } from '@/repositories/purchases/purchases';
import { productRepository, stockMovementRepository } from '@/repositories/products/products';
import { queueSync } from '@/services/sync/queue';
import { assertDayIsOpen } from './guards';
import { settleSupplierAccount } from './settle';
import { reconcileProductCost } from './averageCost';

export async function voidPurchase(input: {
  businessId: string;
  purchaseId: string;
  userId: string;
  deviceId: string;
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
    const movement = await stockMovementRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      product_id: item.product_id,
      type: 'return_out',
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      reference_type: 'purchase_return',
      reference_id: purchase.id,
      occurred_at: now,
      created_by: input.userId,
      device_id: input.deviceId,
      sync_status: 'pending',
    });
    await queueSync(
      'stock_movements',
      movement.id,
      'insert',
      movement as unknown as Record<string, unknown>,
      input.businessId
    );
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
