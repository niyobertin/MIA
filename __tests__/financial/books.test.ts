import {
  allocateDocuments,
  calculateNetProfit,
  calculateWeightedAverageCost,
  foldAverageCost,
  salesRevenue,
} from '@/services/financial/calculations';

describe('calculateWeightedAverageCost', () => {
  it('ignores negative stock when averaging a new purchase', () => {
    expect(calculateWeightedAverageCost(-5, 500, 10, 800)).toBe(800);
  });

  it('weights existing stock with the new purchase', () => {
    expect(calculateWeightedAverageCost(10, 500, 10, 700)).toBe(600);
  });
});

describe('allocateDocuments', () => {
  it('fills the oldest document first and leaves the rest open', () => {
    const result = allocateDocuments(
      [
        { id: 'a', total: 1000, checkoutPaid: 0 },
        { id: 'b', total: 500, checkoutPaid: 0 },
      ],
      400
    );
    expect(result).toEqual([
      { id: 'a', paid: 400, status: 'partial' },
      { id: 'b', paid: 0, status: 'open' },
    ]);
  });

  it('keeps checkout payments on their own document', () => {
    const result = allocateDocuments(
      [
        { id: 'cash', total: 1000, checkoutPaid: 1000 },
        { id: 'credit', total: 800, checkoutPaid: 0 },
      ],
      300
    );
    expect(result[0]).toEqual({ id: 'cash', paid: 1000, status: 'paid' });
    expect(result[1]).toEqual({ id: 'credit', paid: 300, status: 'partial' });
  });

  it('does not pay a document more than its total', () => {
    const result = allocateDocuments([{ id: 'a', total: 1000, checkoutPaid: 0 }], 1500);
    expect(result[0]).toEqual({ id: 'a', paid: 1000, status: 'paid' });
  });
});

describe('foldAverageCost', () => {
  it('averages two purchases from empty stock in either order', () => {
    const first = foldAverageCost([
      { type: 'purchase', quantity: 10, unit_cost: 400 },
      { type: 'purchase', quantity: 10, unit_cost: 800 },
    ]);
    const second = foldAverageCost([
      { type: 'purchase', quantity: 10, unit_cost: 800 },
      { type: 'purchase', quantity: 10, unit_cost: 400 },
    ]);
    expect(first).toBe(600);
    expect(second).toBe(600);
  });

  it('leaves the average unchanged when stock is sold', () => {
    expect(
      foldAverageCost([
        { type: 'purchase', quantity: 10, unit_cost: 500 },
        { type: 'sale', quantity: 4, unit_cost: 500 },
      ])
    ).toBe(500);
  });

  it('uses the next purchase cost after stock is sold out', () => {
    expect(
      foldAverageCost([
        { type: 'purchase', quantity: 10, unit_cost: 500 },
        { type: 'sale', quantity: 10, unit_cost: 500 },
        { type: 'purchase', quantity: 10, unit_cost: 800 },
      ])
    ).toBe(800);
  });

  it('does not change the average when goods are damaged', () => {
    expect(
      foldAverageCost([
        { type: 'purchase', quantity: 10, unit_cost: 500 },
        { type: 'damaged', quantity: 2, unit_cost: 500 },
      ])
    ).toBe(500);
  });
});

describe('profit exclusions', () => {
  it('keeps tax out of sales revenue', () => {
    expect(salesRevenue(1100, 100)).toBe(1000);
  });

  it('subtracts inventory loss from net profit', () => {
    expect(calculateNetProfit(5000, 1000, 400)).toBe(3600);
  });
});
