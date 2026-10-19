import { generateUUID } from '@/utils/uuid';
import { StockMovement, StockMovementType, ReferenceType, UserRole } from '@/types';
import { productRepository, stockMovementRepository } from '@/repositories/products/products';
import { queueSync } from '@/services/sync/queue';
import { requireOpenSession } from './session';
import { applyStockDelta } from './stockDelta';
import { canAdjustStock, canRecordOperationalStock, canReverseStock } from '@/utils/permissions';
import { getTodayDateString } from '@/utils/formatters';

const ADJUSTMENT_TYPES: StockMovementType[] = ['adjustment_in', 'adjustment_out', 'damaged', 'opening'];

export async function recordStockMovement(input: {
  businessId: string;
  productId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  type: StockMovementType;
  quantity: number;
  unitCost: number;
  referenceType: ReferenceType | null;
  referenceId: string | null;
  occurredAt?: string;
  reason?: string | null;
  reversalOf?: string | null;
  businessDate?: string;
  /** When already known (e.g. parent sale/purchase); otherwise resolved from open session. */
  sessionId?: string | null;
}): Promise<StockMovement> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('INVALID_QUANTITY');
  }

  if (input.reversalOf) {
    if (!canReverseStock(input.role)) throw new Error('FORBIDDEN');
    if (!input.reason?.trim()) throw new Error('REASON_REQUIRED');
  } else if (ADJUSTMENT_TYPES.includes(input.type)) {
    if (!canAdjustStock(input.role)) throw new Error('FORBIDDEN');
    if (input.type !== 'opening' && !input.reason?.trim()) throw new Error('REASON_REQUIRED');
  } else if (!canRecordOperationalStock(input.role)) {
    throw new Error('FORBIDDEN');
  }

  const product = await productRepository.findById(input.productId, input.businessId);
  if (!product) throw new Error('PRODUCT_NOT_FOUND');
  if (!product.track_inventory) throw new Error('NOT_TRACKED');

  const sessionId =
    input.sessionId ?? (await requireOpenSession(input.businessId)).id;
  // Keep calendar date for inventory day reports; membership is session_id.
  void (input.businessDate ?? getTodayDateString());

  const previous = await productRepository.getStockBalance(input.productId, input.businessId);
  const next = applyStockDelta(previous, input.type, input.quantity);
  if (next < 0) {
    const error = new Error('INSUFFICIENT_STOCK') as Error & { productName?: string };
    error.productName = product.name;
    throw error;
  }

  const movement = await stockMovementRepository.create({
    id: generateUUID(),
    business_id: input.businessId,
    product_id: input.productId,
    session_id: sessionId,
    type: input.type,
    quantity: input.quantity,
    unit_cost: input.unitCost,
    reference_type: input.referenceType,
    reference_id: input.referenceId,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    created_by: input.userId,
    device_id: input.deviceId,
    previous_quantity: previous,
    new_quantity: next,
    reason: input.reason?.trim() || null,
    reversal_of: input.reversalOf ?? null,
    sync_status: 'pending',
  });

  await queueSync(
    'stock_movements',
    movement.id,
    'insert',
    movement as unknown as Record<string, unknown>,
    input.businessId
  );

  return movement;
}
