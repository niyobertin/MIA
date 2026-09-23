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
  const onHand = Math.max(0, currentQuantity);
  const incoming = Math.max(0, purchaseQuantity);
  if (onHand + incoming === 0) return 0;

  const totalValue = onHand * currentAverageCost + incoming * purchaseCost;
  const totalQuantity = onHand + incoming;

  return Math.round(totalValue / totalQuantity);
}

export type AllocationStatus = 'paid' | 'partial' | 'open';

export interface AllocationDocument {
  id: string;
  total: number;
  checkoutPaid: number;
}

export interface AllocationResult {
  id: string;
  paid: number;
  status: AllocationStatus;
}

/** Apply a pool of later payments to documents, oldest first. Checkout payments stay on their document. */
export function allocateDocuments(documents: AllocationDocument[], pool: number): AllocationResult[] {
  let remaining = Math.max(0, Math.round(pool));
  return documents.map((document) => {
    const total = Math.max(0, Math.round(document.total));
    const checkout = Math.min(total, Math.max(0, Math.round(document.checkoutPaid)));
    const room = total - checkout;
    const applied = Math.min(room, remaining);
    remaining -= applied;
    const paid = checkout + applied;
    const status: AllocationStatus =
      total === 0 || paid >= total ? 'paid' : paid > 0 ? 'partial' : 'open';
    return { id: document.id, paid, status };
  });
}

export function calculateCOGS(saleItems: Array<{ quantity: number; unit_cost: number }>): number {
  return saleItems.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
}

export function salesRevenue(totalCharged: number, taxAmount: number): number {
  return totalCharged - Math.max(0, taxAmount);
}

const INBOUND_STOCK = new Set(['opening', 'purchase', 'return_in', 'adjustment_in']);
const OUTBOUND_STOCK = new Set(['sale', 'return_out', 'adjustment_out', 'damaged']);

export interface CostMovement {
  type: string;
  quantity: number;
  unit_cost: number;
}

/** Average cost from the full movement ledger, so two devices converge after sync. */
export function foldAverageCost(movements: CostMovement[]): number {
  let quantity = 0;
  let average = 0;
  for (const movement of movements) {
    const amount = Math.max(0, movement.quantity);
    if (INBOUND_STOCK.has(movement.type)) {
      average = calculateWeightedAverageCost(quantity, average, amount, movement.unit_cost);
      quantity += amount;
    } else if (OUTBOUND_STOCK.has(movement.type)) {
      quantity = Math.max(0, quantity - amount);
    }
  }
  return average;
}

export function calculateGrossProfit(netSales: number, cogs: number): number {
  return netSales - cogs;
}

export function calculateGrossMargin(grossProfit: number, netSales: number): number {
  if (netSales === 0) return 0;
  return Math.round((grossProfit / netSales) * 10000) / 100; // Returns percentage with 2 decimal places
}

export function calculateNetProfit(
  grossProfit: number,
  operatingExpenses: number,
  inventoryLoss = 0
): number {
  return grossProfit - operatingExpenses - inventoryLoss;
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