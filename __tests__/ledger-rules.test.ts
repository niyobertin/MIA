import {
  allocateDocuments,
  belowCostLines,
  calculateAverageTransactionValue,
  calculateExpectedCash,
  calculateNetProfit,
  lineNetUnitPrice,
  outstandingBalance,
  overpaymentOf,
  stockVariance,
  suggestedReorderQty,
} from '@/services/financial/calculations';
import { assembleBooks, emptyMethods, seriesForPeriod } from '@/services/financial/books';
import { classifySyncError, tableLabel } from '@/services/sync/conflicts';

describe('customer debt ledger', () => {
  it('computes outstanding from the full history, not a page of it', () => {
    expect(outstandingBalance(100000, 40000)).toBe(60000);
  });

  it('keeps overpayments visible as credit instead of flooring to zero', () => {
    expect(outstandingBalance(50000, 70000)).toBe(-20000);
    expect(overpaymentOf(50000, 70000)).toBe(20000);
    expect(overpaymentOf(60000, 40000)).toBe(0);
  });

  it('caps allocation at each document total so money is never lost', () => {
    const [row] = allocateDocuments([{ id: 'a', total: 1000, checkoutPaid: 0 }], 1500);
    expect(row.paid).toBe(1000);
    expect(row.status).toBe('paid');
  });
});

describe('selling price protection', () => {
  it('uses the net unit price after line discounts', () => {
    expect(lineNetUnitPrice(2, 5000, 2000)).toBe(4000);
  });

  it('flags lines priced below their frozen unit cost', () => {
    const flagged = belowCostLines([
      { productId: 'p1', quantity: 2, sellingPrice: 5000, discountAmount: 2000, unitCost: 4500 },
      { productId: 'p2', quantity: 1, sellingPrice: 6000, unitCost: 4000 },
    ]);
    expect(flagged.map((f) => f.productId)).toEqual(['p1']);
    expect(flagged[0].shortfallPerUnit).toBe(500);
  });
});

describe('cash ledger', () => {
  it('uses actual payment amounts plus the opening float', () => {
    expect(calculateExpectedCash(100000, 50000, 20000, 5000, 15000, 7000, 10000, 3000)).toBe(140000);
  });
});

describe('profit ledger', () => {
  it('subtracts expenses and inventory loss from gross profit', () => {
    expect(calculateNetProfit(500000, 150000, 20000)).toBe(330000);
  });

  it('assembles one consistent set of books', () => {
    const books = assembleBooks({
      totalSales: 1200000,
      tax: 0,
      cogs: 700000,
      expenses: 150000,
      damagedValue: 20000,
      adjustmentOutValue: 0,
      adjustmentInValue: 0,
      itemsSold: 10,
      transactionCount: 4,
      checkout: { cash: 800000, mobileMoney: 0, bank: 0 },
      creditSales: 400000,
      collections: { ...emptyMethods(), cash: 80000 },
      otherIncome: { ...emptyMethods(), cash: 20000 },
      supplierPayments: emptyMethods(),
      cashPurchases: 150000,
      cashExpenses: 70000,
      withdrawals: 50000,
      openingCash: 100000,
      topProducts: [],
      stockValueNow: 900000,
      stockValueAtEnd: 900000,
    });
    expect(books.grossProfit).toBe(500000);
    expect(books.inventoryLoss).toBe(20000);
    expect(books.netProfit).toBe(330000);
    expect(books.averageSale).toBe(300000);
    expect(books.expectedCash).toBe(730000);
    expect(books.stockValue).toBe(books.stockValueAtEnd);
  });
});

describe('report periods', () => {
  const sales = [
    { sale_date: '2026-09-28', total_amount: 100000 },
    { sale_date: '2026-09-29', total_amount: 50000 },
    { sale_date: '2026-09-29', total_amount: 25000, voided: true },
    { sale_date: '2026-09-20', total_amount: 999999 },
  ];

  it('charts exactly the selected period and excludes voids', () => {
    const bars = seriesForPeriod(sales, '2026-09-28', '2026-09-29', '2026-09-29');
    expect(bars.map((b) => b.date)).toEqual(['2026-09-28', '2026-09-29']);
    expect(bars.reduce((s, b) => s + b.total, 0)).toBe(150000);
  });

  it('averages only transactions inside the selected period', () => {
    expect(calculateAverageTransactionValue(150000, 2)).toBe(75000);
  });
});

describe('sync conflict classification', () => {
  it('explains sealed history through the engine error wrapper', () => {
    expect(classifySyncError('Failed to sync daily_closings:x - Error: Closed history cannot be modified')).toBe(
      'sealed'
    );
  });

  it('tells validation, auth and offline failures apart', () => {
    expect(classifySyncError('amount must be a whole non-negative number')).toBe('validation');
    expect(classifySyncError('Business access denied')).toBe('auth');
    expect(classifySyncError('Network request failed')).toBe('offline');
    expect(classifySyncError('something strange')).toBe('unknown');
  });

  it('surfaces concurrent open-session conflicts explicitly', () => {
    expect(
      classifySyncError('Another open trading session already exists for this business')
    ).toBe('session_conflict');
  });

  it('humanizes table names for the conflict list', () => {
    expect(tableLabel('daily_stock_lines')).toBe('Daily Stock Lines');
  });
});

describe('stock intelligence', () => {
  it('suggests buying up to the reorder level only', () => {
    expect(suggestedReorderQty(3, 10)).toBe(7);
    expect(suggestedReorderQty(12, 10)).toBe(0);
    expect(suggestedReorderQty(5, 0)).toBe(0);
  });

  it('separates book stock, physical count and variance', () => {
    expect(stockVariance(40, 45)).toBe(-5);
    expect(stockVariance(null, 45)).toBeNull();
  });
});
