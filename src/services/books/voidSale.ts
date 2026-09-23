import { generateUUID } from '@/utils/uuid';
import { saleRepository } from '@/repositories/sales/sales';
import { stockMovementRepository } from '@/repositories/products/products';
import { queueSync } from '@/services/sync/queue';
import { assertDayIsOpen } from './guards';
import { settleCustomerAccount } from './settle';

export async function voidSale(input: {
  businessId: string;
  saleId: string;
  userId: string;
  deviceId: string;
}): Promise<void> {
  const sale = await saleRepository.findById(input.saleId, input.businessId);
  if (!sale) throw new Error('SALE_NOT_FOUND');
  if (sale.voided) throw new Error('ALREADY_VOID');

  await assertDayIsOpen(input.businessId, sale.sale_date);

  const recorded = await stockMovementRepository.findByReference('sale', sale.id, input.businessId);
  const now = new Date().toISOString();

  for (const item of recorded) {
    if (item.type !== 'sale') continue;
    const movement = await stockMovementRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      product_id: item.product_id,
      type: 'return_in',
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      reference_type: 'sale_return',
      reference_id: sale.id,
      occurred_at: now,
      created_by: input.userId,
      device_id: input.deviceId,
      sync_status: 'pending',
    });
    await queueSync(
      'stock_movements',
      movement.id,
      'insert',
      movement as unknown as Record<string, unknown>,
      input.businessId
    );
  }

  const updated = await saleRepository.update(sale.id, input.businessId, {
    voided: true,
    sync_status: 'pending',
  });
  if (updated) {
    await queueSync('sales', sale.id, 'update', updated as unknown as Record<string, unknown>, input.businessId);
  }

  await settleCustomerAccount(input.businessId, sale.customer_id);
}
