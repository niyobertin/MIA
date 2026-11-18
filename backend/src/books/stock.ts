import { foldAverageCost } from '../shared/calculations';
import { applyStockDelta, type StockMovementType } from '../shared/stockDelta';
import { BooksError, Ctx, WEB_DEVICE, newId, num, one, rows } from './core';

const ADJUSTMENT_TYPES = new Set<StockMovementType>(['adjustment_in', 'adjustment_out', 'damaged', 'opening']);
const INBOUND_SQL = `('opening','purchase','return_in','adjustment_in')`;

export async function stockBalance(ctx: Ctx, productId: string): Promise<number> {
  const row = await one<{ stock: string }>(
    ctx,
    `SELECT COALESCE(SUM(CASE WHEN type IN ${INBOUND_SQL} THEN quantity ELSE -quantity END), 0) AS stock
     FROM stock_movements WHERE business_id = $1 AND product_id = $2`,
    [ctx.businessId, productId],
  );
  return num(row?.stock);
}

/** Recomputes average cost from the whole movement ledger with the app's own fold, so web and phones agree. */
export async function reconcileAverageCost(ctx: Ctx, productId: string): Promise<number> {
  const movements = await rows<{ type: string; quantity: string; unit_cost: string }>(
    ctx,
    `SELECT type, quantity, unit_cost FROM stock_movements
     WHERE business_id = $1 AND product_id = $2 ORDER BY occurred_at ASC, created_at ASC`,
    [ctx.businessId, productId],
  );
  const cost = foldAverageCost(movements.map((m) => ({ type: m.type, quantity: num(m.quantity), unit_cost: num(m.unit_cost) })));
  await ctx.tx.query(
    `UPDATE products SET average_cost = $3, updated_at = now() WHERE business_id = $1 AND id = $2 AND average_cost <> $3`,
    [ctx.businessId, productId, cost],
  );
  return cost;
}

export type MovementInput = {
  productId: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number;
  sessionId: string;
  referenceType: string | null;
  referenceId: string | null;
  reason?: string | null;
  reversalOf?: string | null;
};

/** Mirrors the phone's recordStockMovement: role rules, no negative stock, previous/new balance on the row. */
export async function recordMovement(ctx: Ctx, input: MovementInput) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new BooksError('INVALID_QUANTITY');
  const manager = ctx.role === 'OWNER' || ctx.role === 'MANAGER';
  if (input.reversalOf) {
    if (!manager) throw new BooksError('FORBIDDEN', 403);
    if (!input.reason?.trim()) throw new BooksError('REASON_REQUIRED');
  } else if (ADJUSTMENT_TYPES.has(input.type)) {
    if (!manager) throw new BooksError('FORBIDDEN', 403);
    if (input.type !== 'opening' && !input.reason?.trim()) throw new BooksError('REASON_REQUIRED');
  } else if (ctx.role === 'STAFF') {
    throw new BooksError('FORBIDDEN', 403);
  }

  const product = await one<{ name: string; track_inventory: boolean }>(
    ctx,
    `SELECT name, track_inventory FROM products WHERE business_id = $1 AND id = $2`,
    [ctx.businessId, input.productId],
  );
  if (!product) throw new BooksError('PRODUCT_NOT_FOUND', 404);
  if (!product.track_inventory) throw new BooksError('NOT_TRACKED');

  const previous = await stockBalance(ctx, input.productId);
  const next = applyStockDelta(previous, input.type, input.quantity);
  if (next < 0) throw new BooksError('INSUFFICIENT_STOCK', 409, { productName: product.name });

  const id = newId();
  await ctx.tx.query(
    `INSERT INTO stock_movements (id, business_id, product_id, session_id, type, quantity, unit_cost, reference_type, reference_id,
       occurred_at, created_by, previous_quantity, new_quantity, reason, reversal_of, device_id, sync_status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), $10,$11,$12,$13,$14,$15,'synced', now(), now())`,
    [
      id, ctx.businessId, input.productId, input.sessionId, input.type, input.quantity, input.unitCost,
      input.referenceType, input.referenceId, ctx.userId, previous, next, input.reason?.trim() || null,
      input.reversalOf ?? null, WEB_DEVICE,
    ],
  );
  await reconcileAverageCost(ctx, input.productId);
  return { id, previous, next };
}

export async function trackedBalances(ctx: Ctx) {
  const list = await rows<{ product_id: string; average_cost: string; balance: string }>(
    ctx,
    `SELECT p.id AS product_id, p.average_cost,
            COALESCE(SUM(CASE WHEN m.type IN ${INBOUND_SQL} THEN m.quantity WHEN m.id IS NULL THEN 0 ELSE -m.quantity END), 0) AS balance
     FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id AND m.business_id = p.business_id
     WHERE p.business_id = $1 AND p.active = true AND p.track_inventory = true
     GROUP BY p.id, p.average_cost`,
    [ctx.businessId],
  );
  return list.map((r) => ({ product_id: r.product_id, average_cost: num(r.average_cost), balance: num(r.balance) }));
}

/** Same as the phone's getStockSnapshot: tracked, active products only. */
export async function stockSnapshot(ctx: Ctx) {
  const balances = await trackedBalances(ctx);
  return balances.reduce(
    (acc, row) => ({ quantity: acc.quantity + row.balance, value: acc.value + row.average_cost * row.balance }),
    { quantity: 0, value: 0 },
  );
}
