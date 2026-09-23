import { generateUUID } from '@/utils/uuid';
import { getTodayDateString } from '@/utils/formatters';
import { productRepository, stockMovementRepository } from '@/repositories/products/products';
import { queueSync } from '@/services/sync/queue';
import { assertDayIsOpen } from './guards';
import { reconcileProductCost } from './averageCost';

export type StockAdjustmentKind = 'adjustment_in' | 'adjustment_out' | 'damaged';

export async function adjustStock(input: {
  businessId: string;
  productId: string;
  userId: string;
  deviceId: string;
  kind: StockAdjustmentKind;
  quantity: number;
}): Promise<void> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('INVALID_QUANTITY');
  }

  const product = await productRepository.findById(input.productId, input.businessId);
  if (!product) throw new Error('PRODUCT_NOT_FOUND');
  if (!product.track_inventory) throw new Error('NOT_TRACKED');

  await assertDayIsOpen(input.businessId, getTodayDateString());

  const onHand = await productRepository.getStockBalance(input.productId, input.businessId);
  if (input.kind !== 'adjustment_in' && input.quantity > onHand) {
    const error = new Error('INSUFFICIENT_STOCK') as Error & { productName?: string };
    error.productName = product.name;
    throw error;
  }

  const movement = await stockMovementRepository.create({
    id: generateUUID(),
    business_id: input.businessId,
    product_id: input.productId,
    type: input.kind,
    quantity: input.quantity,
    unit_cost: product.average_cost,
    reference_type: 'adjustment',
    reference_id: null,
    occurred_at: new Date().toISOString(),
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
  await reconcileProductCost(input.businessId, input.productId);
}
