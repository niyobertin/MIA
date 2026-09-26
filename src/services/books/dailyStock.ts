import { generateUUID } from '@/utils/uuid';
import { productRepository } from '@/repositories/products/products';
import { dailyStockLineRepository } from '@/repositories/reports/dailyStock';
import { queueSync } from '@/services/sync/queue';
import { DailyStockLine } from '@/types';

function asInt(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

async function upsertOpeningLine(input: {
  businessId: string;
  dailyClosingId: string;
  businessDate: string;
  productId: string;
  openingQty: number;
  openingUnitCost: number;
  closingQty?: number | null;
  closingUnitCost?: number | null;
}): Promise<DailyStockLine> {
  const existing = await dailyStockLineRepository.findByClosingAndProduct(
    input.businessId,
    input.dailyClosingId,
    input.productId
  );
  if (existing) {
    if (existing.closing_qty != null || input.closingQty == null) return existing;
    const updated = await dailyStockLineRepository.seal(existing.id, input.businessId, {
      closing_qty: asInt(input.closingQty),
      closing_unit_cost: asInt(input.closingUnitCost ?? existing.opening_unit_cost),
    });
    if (updated) {
      await queueSync(
        'daily_stock_lines',
        updated.id,
        'update',
        updated as unknown as Record<string, unknown>,
        input.businessId
      );
      return updated;
    }
    return existing;
  }

  try {
    const line = await dailyStockLineRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      daily_closing_id: input.dailyClosingId,
      business_date: input.businessDate.slice(0, 10),
      product_id: input.productId,
      opening_qty: asInt(input.openingQty),
      opening_unit_cost: asInt(input.openingUnitCost),
      closing_qty: input.closingQty == null ? null : asInt(input.closingQty),
      closing_unit_cost: input.closingUnitCost == null ? null : asInt(input.closingUnitCost),
    });
    await queueSync(
      'daily_stock_lines',
      line.id,
      'insert',
      line as unknown as Record<string, unknown>,
      input.businessId
    );
    return line;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/unique|constraint/i.test(message)) throw error;
    const raced = await dailyStockLineRepository.findByClosingAndProduct(
      input.businessId,
      input.dailyClosingId,
      input.productId
    );
    if (raced) return raced;
    throw error;
  }
}

export async function captureOpeningStock(input: {
  businessId: string;
  dailyClosingId: string;
  businessDate: string;
}): Promise<DailyStockLine[]> {
  const existing = await dailyStockLineRepository.findByClosingId(
    input.businessId,
    input.dailyClosingId
  );
  if (existing.length > 0) return existing;

  const balances = await productRepository.getTrackedBalances(input.businessId);
  const lines: DailyStockLine[] = [];
  for (const row of balances) {
    const line = await upsertOpeningLine({
      businessId: input.businessId,
      dailyClosingId: input.dailyClosingId,
      businessDate: input.businessDate,
      productId: row.product_id,
      openingQty: row.balance,
      openingUnitCost: row.average_cost,
    });
    lines.push(line);
  }
  return lines;
}

export async function sealClosingStock(input: {
  businessId: string;
  dailyClosingId: string;
  businessDate: string;
}): Promise<DailyStockLine[]> {
  const balances = await productRepository.getTrackedBalances(input.businessId);
  const byProduct = new Map(balances.map((row) => [row.product_id, row]));
  let lines = await dailyStockLineRepository.findByClosingId(
    input.businessId,
    input.dailyClosingId
  );

  if (lines.length === 0) {
    lines = await captureOpeningStock(input);
  }

  const sealed: DailyStockLine[] = [];
  for (const line of lines) {
    if (line.closing_qty != null) {
      sealed.push(line);
      continue;
    }
    const live = byProduct.get(line.product_id);
    const updated = await dailyStockLineRepository.seal(line.id, input.businessId, {
      closing_qty: asInt(live?.balance ?? line.opening_qty),
      closing_unit_cost: asInt(live?.average_cost ?? line.opening_unit_cost),
    });
    if (updated) {
      await queueSync(
        'daily_stock_lines',
        updated.id,
        'update',
        updated as unknown as Record<string, unknown>,
        input.businessId
      );
      sealed.push(updated);
    }
  }

  const known = new Set(lines.map((line) => line.product_id));
  for (const row of balances) {
    if (known.has(row.product_id)) continue;
    const line = await upsertOpeningLine({
      businessId: input.businessId,
      dailyClosingId: input.dailyClosingId,
      businessDate: input.businessDate,
      productId: row.product_id,
      openingQty: 0,
      openingUnitCost: row.average_cost,
      closingQty: row.balance,
      closingUnitCost: row.average_cost,
    });
    sealed.push(line);
  }

  return sealed;
}
