import { getDatabase } from '@/db/database';
import { productRepository } from '@/repositories/products/products';
import { queueSync } from '@/services/sync/queue';
import { foldAverageCost } from '@/services/financial/calculations';

export async function reconcileProductCost(businessId: string, productId: string): Promise<void> {
  const db = await getDatabase();
  const movements = await db.getAllAsync<{ type: string; quantity: number; unit_cost: number }>(
    `SELECT type, quantity, unit_cost
     FROM stock_movements
     WHERE business_id = ? AND product_id = ?
     ORDER BY occurred_at ASC, created_at ASC`,
    [businessId, productId]
  );
  const nextCost = foldAverageCost(movements);
  const product = await productRepository.findById(productId, businessId);
  if (!product || Number(product.average_cost) === nextCost) return;
  const updated = await productRepository.updateAverageCost(productId, businessId, nextCost);
  if (updated) {
    await queueSync('products', productId, 'update', updated as unknown as Record<string, unknown>, businessId);
  }
}

export async function reconcileBusinessAverageCosts(businessId: string): Promise<void> {
  const db = await getDatabase();
  const products = await db.getAllAsync<{ id: string }>(
    `SELECT DISTINCT product_id as id FROM stock_movements WHERE business_id = ?`,
    [businessId]
  );
  for (const product of products) {
    await reconcileProductCost(businessId, product.id);
  }
}
