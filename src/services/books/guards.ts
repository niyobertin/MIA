import { dailyClosingRepository } from '@/repositories/reports/dailyClosing';
import { productRepository } from '@/repositories/products/products';
import { customerRepository } from '@/repositories/sales/customers';
import { saleRepository } from '@/repositories/sales/sales';
import { purchaseRepository } from '@/repositories/purchases/purchases';
import { belowCostLines, lineNetUnitPrice, outstandingBalance } from '@/services/financial/calculations';
import { UserRole } from '@/types';
import { requireOpenSession, assertSessionMutable } from './session';

export interface GuardErrorInfo {
  code: string;
  productName?: string;
  excess?: number;
  outstanding?: number;
  shortfall?: number;
}

export function guardError(code: string, extra?: Omit<GuardErrorInfo, 'code'>): Error {
  return Object.assign(new Error(code), extra ?? {});
}

/**
 * @deprecated Prefer requireOpenSession — membership is by session_id, not calendar date.
 * Kept for callers that only need "is any day open?" without stamping a session.
 */
export async function getOpenSessionRange(
  businessId: string
): Promise<{ start: string; today: string; sessionId: string } | null> {
  const open = await dailyClosingRepository.findOpenDay(businessId);
  if (!open) return null;
  const { getTodayDateString } = await import('@/utils/formatters');
  return {
    start: (open.business_date ?? getTodayDateString()).slice(0, 10),
    today: getTodayDateString(),
    sessionId: open.id,
  };
}

/**
 * Business activity requires an open trading session.
 * Calendar date is recorded separately (sale_date etc.) and must NOT decide session membership.
 */
export async function assertDayIsOpen(businessId: string, _businessDate?: string): Promise<void> {
  await requireOpenSession(businessId);
}

/** Edits/deletes only while the record's session is still the open one. */
export async function assertRecordMutable(
  businessId: string,
  _recordDate: string,
  sessionId?: string | null
): Promise<void> {
  await assertSessionMutable(businessId, sessionId);
}

export async function assertSaleAllowed(
  businessId: string,
  items: Array<{ productId: string; quantity: number; sellingPrice: number; discountAmount?: number; taxAmount?: number }>,
  paymentMethod: 'cash' | 'mobile_money' | 'bank' | 'credit',
  customerId: string | null,
  totalAmount: number,
  options?: { role?: UserRole | null; allowBelowCost?: boolean }
): Promise<void> {
  if (paymentMethod === 'credit' && !customerId) {
    throw guardError('CUSTOMER_REQUIRED');
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw guardError('INVALID_QUANTITY');
    }
    const discount = item.discountAmount ?? 0;
    const tax = item.taxAmount ?? 0;
    const lineTotal = item.quantity * item.sellingPrice - discount + tax;
    if (!Number.isInteger(item.sellingPrice) || item.sellingPrice < 1 || lineTotal < 1) {
      const product = await productRepository.findById(item.productId, businessId);
      throw guardError('INVALID_PRICE', { productName: product?.name });
    }

    const product = await productRepository.findById(item.productId, businessId);
    if (!product?.track_inventory) continue;
    const onHand = await productRepository.getStockBalance(item.productId, businessId);
    if (item.quantity > onHand) {
      throw guardError('INSUFFICIENT_STOCK', { productName: product.name });
    }
  }

  const costs = await Promise.all(
    items.map(async (item) => {
      const product = await productRepository.findById(item.productId, businessId);
      return {
        productId: item.productId,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        discountAmount: item.discountAmount ?? 0,
        unitCost: product?.track_inventory ? (product?.average_cost ?? 0) : 0,
      };
    })
  );
  const cheap = belowCostLines(costs.filter((c) => c.unitCost > 0));
  if (cheap.length > 0) {
    const shortfall = cheap.reduce((sum, l) => sum + l.shortfallPerUnit * l.quantity, 0);
    const mayOverride = (options?.role === 'OWNER' || options?.role === 'MANAGER') && options?.allowBelowCost;
    if (!mayOverride) {
      const product = await productRepository.findById(cheap[0].productId, businessId);
      throw guardError('BELOW_COST', { productName: product?.name, shortfall });
    }
  }

  if (paymentMethod === 'credit' && customerId) {
    const customer = await customerRepository.findById(customerId, businessId);
    if (customer && customer.credit_limit > 0) {
      const position = await saleRepository.getCustomerPosition(customerId, businessId);
      if (position.outstanding + totalAmount > customer.credit_limit) {
        throw guardError('CREDIT_LIMIT', { outstanding: position.outstanding });
      }
    }
  }
}

/** Net unit price of a cart line (used for below-cost warnings in the UI). */
export function cartLineNetUnitPrice(quantity: number, sellingPrice: number, discountAmount: number): number {
  return lineNetUnitPrice(quantity, sellingPrice, discountAmount);
}

export async function assertCustomerPaymentAllowed(
  businessId: string,
  customerId: string | null,
  amount: number,
  _paymentDate: string
): Promise<{ outstanding: number }> {
  if (!Number.isInteger(amount) || amount < 1) throw guardError('INVALID_PRICE');
  await requireOpenSession(businessId);
  if (!customerId) return { outstanding: 0 };
  const position = await saleRepository.getCustomerPosition(customerId, businessId);
  const outstanding = outstandingBalance(position.owed, position.paid);
  if (outstanding <= 0 || amount > outstanding) {
    throw guardError('OVERPAYMENT', {
      excess: Math.round(amount) - Math.max(0, Math.round(outstanding)),
      outstanding,
    });
  }
  return { outstanding };
}

export async function assertSupplierPaymentAllowed(
  businessId: string,
  supplierId: string | null,
  amount: number,
  _paymentDate: string
): Promise<{ outstanding: number }> {
  if (!Number.isInteger(amount) || amount < 1) throw guardError('INVALID_PRICE');
  await requireOpenSession(businessId);
  if (!supplierId) return { outstanding: 0 };
  const position = await purchaseRepository.getSupplierPosition(supplierId, businessId);
  const outstanding = outstandingBalance(position.owed, position.paid);
  if (outstanding <= 0 || amount > outstanding) {
    throw guardError('OVERPAYMENT', {
      excess: Math.round(amount) - Math.max(0, Math.round(outstanding)),
      outstanding,
    });
  }
  return { outstanding };
}
