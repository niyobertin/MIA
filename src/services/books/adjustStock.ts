import { productRepository } from '@/repositories/products/products';
import { recordStockMovement } from './recordStockMovement';
import { assertDayIsOpen } from './guards';
import { reconcileProductCost } from './averageCost';
import { getTodayDateString } from '@/utils/formatters';
import { UserRole } from '@/types';

export type StockAdjustmentKind = 'adjustment_in' | 'adjustment_out' | 'damaged';

export async function adjustStock(input: {
  businessId: string;
  productId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  kind: StockAdjustmentKind;
  quantity: number;
  reason: string;
}): Promise<void> {
  const product = await productRepository.findById(input.productId, input.businessId);
  if (!product) throw new Error('PRODUCT_NOT_FOUND');

  await assertDayIsOpen(input.businessId, getTodayDateString());
  await recordStockMovement({
    businessId: input.businessId,
    productId: input.productId,
    userId: input.userId,
    deviceId: input.deviceId,
    role: input.role,
    type: input.kind,
    quantity: input.quantity,
    unitCost: product.average_cost,
    referenceType: 'adjustment',
    referenceId: null,
    reason: input.reason,
  });
  await reconcileProductCost(input.businessId, input.productId);
}
