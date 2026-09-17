export function calculateSaleSubtotal(items: Array<{ quantity: number; selling_price: number }>): number {
  return items.reduce((sum, item) => sum + item.quantity * item.selling_price, 0);
}

export function calculateSaleTotal(
  subtotal: number,
  discountAmount: number,
  taxAmount: number
): number {
  return subtotal - discountAmount + taxAmount;
}

export function calculateWeightedAverageCost(
  currentQuantity: number,
  currentAverageCost: number,
  purchaseQuantity: number,
  purchaseCost: number
): number {
  if (currentQuantity + purchaseQuantity === 0) return 0;
  
  const totalValue = currentQuantity * currentAverageCost + purchaseQuantity * purchaseCost;
  const totalQuantity = currentQuantity + purchaseQuantity;
  
  return Math.round(totalValue / totalQuantity);
}

export function calculateCOGS(saleItems: Array<{ quantity: number; unit_cost: number }>): number {
  return saleItems.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
}

export function calculateGrossProfit(netSales: number, cogs: number): number {
  return netSales - cogs;
}

export function calculateGrossMargin(grossProfit: number, netSales: number): number {
  if (netSales === 0) return 0;
  return Math.round((grossProfit / netSales) * 10000) / 100; // Returns percentage with 2 decimal places
}

export function calculateNetProfit(grossProfit: number, operatingExpenses: number): number {
  return grossProfit - operatingExpenses;
}

export function calculateExpectedCash(
  openingCash: number,
  cashSales: number,
  customerCashPayments: number,
  otherCashIncome: number,
  cashPurchases: number,
  cashExpenses: number,
  supplierCashPayments: number,
  withdrawals: number
): number {
  return (
    openingCash +
    cashSales +
    customerCashPayments +
    otherCashIncome -
    cashPurchases -
    cashExpenses -
    supplierCashPayments -
    withdrawals
  );
}

export function calculateCashVariance(actualCash: number, expectedCash: number): number {
  return actualCash - expectedCash;
}

export function calculateStockBalance(
  stockIn: number,
  stockOut: number
): number {
  return stockIn - stockOut;
}

export function calculateStockValue(products: Array<{ average_cost: number; current_stock: number }>): number {
  return products.reduce((sum, product) => sum + product.average_cost * product.current_stock, 0);
}

export function calculateProfitMargin(profit: number, revenue: number): number {
  if (revenue === 0) return 0;
  return Math.round((profit / revenue) * 10000) / 100;
}

export function calculateAverageTransactionValue(totalSales: number, transactionCount: number): number {
  if (transactionCount === 0) return 0;
  return Math.round(totalSales / transactionCount);
}

export function roundToMinorUnits(amount: number): number {
  return Math.round(amount);
}

export function formatCurrency(amount: number, currency = 'RWF'): string {
  return `${amount.toLocaleString()} ${currency}`;
}

export function parseCurrency(value: string): number {
  return parseInt(value.replace(/[^\d-]/g, ''), 10) || 0;
}