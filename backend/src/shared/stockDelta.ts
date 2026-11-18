// Generated from src/services/books/stockDelta.ts by `npm run shared:sync`. Do not edit here.
export type StockMovementType =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'damaged';

const INBOUND: StockMovementType[] = ['opening', 'purchase', 'return_in', 'adjustment_in'];

export function isInboundMovement(type: StockMovementType): boolean {
  return INBOUND.includes(type);
}

export function applyStockDelta(previous: number, type: StockMovementType, quantity: number): number {
  return isInboundMovement(type) ? previous + quantity : previous - quantity;
}
