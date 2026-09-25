import { StockMovementType } from '@/types';

const INBOUND: StockMovementType[] = ['opening', 'purchase', 'return_in', 'adjustment_in'];

export function isInboundMovement(type: StockMovementType): boolean {
  return INBOUND.includes(type);
}

export function applyStockDelta(previous: number, type: StockMovementType, quantity: number): number {
  return isInboundMovement(type) ? previous + quantity : previous - quantity;
}
