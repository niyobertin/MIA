import { generateUUID } from '@/utils/uuid';
import { productRepository } from '@/repositories/products/products';
import { dailyStockLineRepository } from '@/repositories/reports/dailyStock';
import { queueSync } from '@/services/sync/queue';
import { DailyStockLine } from '@/types';

export async function captureOpeningStock(input: {
  businessId: string;
  dailyClosingId: string;
  businessDate: string;
}): Promise<DailyStockLine[]> {
  const existing = await dailyStockLineRepository.findByDate(input.businessId, input.businessDate);
  if (existing.length > 0) return existing;

  const balances = await productRepository.getTrackedBalances(input.businessId);
  const lines: DailyStockLine[] = [];
  for (const row of balances) {
    const line = await dailyStockLineRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      daily_closing_id: input.dailyClosingId,
      business_date: input.businessDate,
      product_id: row.product_id,
      opening_qty: row.balance,
      opening_unit_cost: row.average_cost,
      closing_qty: null,
      closing_unit_cost: null,
    });
    await queueSync(
      'daily_stock_lines',
      line.id,
      'insert',
      line as unknown as Record<string, unknown>,
      input.businessId
    );
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
  let lines = await dailyStockLineRepository.findByDate(input.businessId, input.businessDate);

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
      closing_qty: live?.balance ?? line.opening_qty,
      closing_unit_cost: live?.average_cost ?? line.opening_unit_cost,
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
    const line = await dailyStockLineRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      daily_closing_id: input.dailyClosingId,
      business_date: input.businessDate,
      product_id: row.product_id,
      opening_qty: 0,
      opening_unit_cost: row.average_cost,
      closing_qty: row.balance,
      closing_unit_cost: row.average_cost,
    });
    await queueSync(
      'daily_stock_lines',
      line.id,
      'insert',
      line as unknown as Record<string, unknown>,
      input.businessId
    );
    sealed.push(line);
  }

  return sealed;
}
