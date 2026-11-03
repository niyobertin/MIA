import { applyStockDelta, isInboundMovement } from '@/services/books/stockDelta';

describe('stock delta', () => {
  it('increases stock for inbound movements', () => {
    expect(isInboundMovement('purchase')).toBe(true);
    expect(applyStockDelta(10, 'purchase', 4)).toBe(14);
    expect(applyStockDelta(10, 'return_in', 2)).toBe(12);
    expect(applyStockDelta(0, 'opening', 5)).toBe(5);
    expect(applyStockDelta(3, 'adjustment_in', 1)).toBe(4);
  });

  it('decreases stock for outbound movements', () => {
    expect(isInboundMovement('sale')).toBe(false);
    expect(applyStockDelta(10, 'sale', 4)).toBe(6);
    expect(applyStockDelta(10, 'return_out', 3)).toBe(7);
    expect(applyStockDelta(8, 'damaged', 1)).toBe(7);
    expect(applyStockDelta(8, 'adjustment_out', 2)).toBe(6);
  });
});
