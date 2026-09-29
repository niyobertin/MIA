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

/** Net unit price after a line discount. Profit and below-cost checks use this, not the list price. */
export function lineNetUnitPrice(quantity: number, sellingPrice: number, discountAmount: number): number {
  if (quantity <= 0) return 0;
  return Math.round((quantity * sellingPrice - discountAmount) / quantity);
}

/** Units to buy so on-hand reaches the reorder level. Zero when the shelf is already above it. */
export function suggestedReorderQty(currentQuantity: number, reorderLevel: number): number {
  if (reorderLevel <= 0 || currentQuantity > reorderLevel) return 0;
  return reorderLevel - currentQuantity;
}

export interface PartyPosition {
  owed: number;
  paid: number;
  outstanding: number;
}

/**
 * Single authoritative party-balance rule.
 * outstanding = credit extended - money collected later.
 * A negative outstanding is an explicit credit (overpayment), never floored to zero.
 */
export function outstandingBalance(owed: number, paid: number): number {
  return Math.round(owed) - Math.round(paid);
}

/** Excess of a payment over what is owed. Zero when the payment fits the debt. */
export function overpaymentOf(outstanding: number, paymentAmount: number): number {
  return Math.max(0, Math.round(paymentAmount) - Math.round(outstanding));
}

export interface BelowCostLine {
  productId: string;
  quantity: number;
  netUnitPrice: number;
  unitCost: number;
  shortfallPerUnit: number;
}

/** Sale lines priced below their frozen unit cost. Callers decide whether an override is allowed. */
export function belowCostLines(
  lines: Array<{ productId: string; quantity: number; sellingPrice: number; discountAmount?: number; unitCost: number }>
): BelowCostLine[] {
  const out: BelowCostLine[] = [];
  for (const line of lines) {
    const net = lineNetUnitPrice(line.quantity, line.sellingPrice, line.discountAmount ?? 0);
    const cost = Math.round(line.unitCost);
    if (net < cost) {
      out.push({
        productId: line.productId,
        quantity: line.quantity,
        netUnitPrice: net,
        unitCost: cost,
        shortfallPerUnit: cost - net,
      });
    }
  }
  return out;
}

export function stockVariance(counted: number | null, book: number): number | null {
  if (counted == null) return null;
  return counted - book;
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