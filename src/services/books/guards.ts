import { dailyClosingRepository } from '@/repositories/reports/dailyClosing';
import { productRepository } from '@/repositories/products/products';
import { customerRepository } from '@/repositories/sales/customers';
import { saleRepository } from '@/repositories/sales/sales';

/** Business activity requires an open cash-day session (may span calendar days). */
export async function assertDayIsOpen(businessId: string, _businessDate?: string): Promise<void> {
  const open = await dailyClosingRepository.findOpenDay(businessId);
  if (!open) {
    throw new Error('DAY_CLOSED');
  }
}

export async function assertSaleAllowed(
  businessId: string,
  items: Array<{ productId: string; quantity: number; sellingPrice: number; discountAmount?: number; taxAmount?: number }>,
  paymentMethod: 'cash' | 'mobile_money' | 'bank' | 'credit',
  customerId: string | null,
  totalAmount: number
): Promise<void> {
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error('INVALID_QUANTITY');
    }
    const discount = item.discountAmount ?? 0;
    const tax = item.taxAmount ?? 0;
    const lineTotal = item.quantity * item.sellingPrice - discount + tax;
    if (!Number.isInteger(item.sellingPrice) || item.sellingPrice < 1 || lineTotal < 1) {
      const error = new Error('INVALID_PRICE') as Error & { productName?: string };
      const product = await productRepository.findById(item.productId, businessId);
      error.productName = product?.name;
      throw error;
    }

    const product = await productRepository.findById(item.productId, businessId);
    if (!product?.track_inventory) continue;
    const onHand = await productRepository.getStockBalance(item.productId, businessId);
    if (item.quantity > onHand) {
      const error = new Error('INSUFFICIENT_STOCK') as Error & { productName?: string };
      error.productName = product.name;
      throw error;
    }
  }

  if (paymentMethod === 'credit' && customerId) {
    const customer = await customerRepository.findById(customerId, businessId);
    if (customer && customer.credit_limit > 0) {
      const position = await saleRepository.getCustomerPosition(customerId, businessId);
      if (position.outstanding + totalAmount > customer.credit_limit) {
        throw new Error('CREDIT_LIMIT');
      }
    }
  }
}
