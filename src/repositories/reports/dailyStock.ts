import { BaseRepository } from '../base';
import { DailyStockLine } from '@/types';

export class DailyStockLineRepository extends BaseRepository<DailyStockLine> {
  protected tableName = 'daily_stock_lines';
  protected columns = [
    'id', 'business_id', 'daily_closing_id', 'business_date', 'product_id',
    'opening_qty', 'opening_unit_cost', 'closing_qty', 'closing_unit_cost',
    'created_at', 'updated_at',
  ];

  async findByClosingId(businessId: string, dailyClosingId: string): Promise<DailyStockLine[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT l.*, p.name as product_name, p.unit as unit
       FROM daily_stock_lines l
       JOIN products p ON p.id = l.product_id
       WHERE l.business_id = ? AND l.daily_closing_id = ?
       ORDER BY p.name ASC`,
      [businessId, dailyClosingId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async findByDate(businessId: string, businessDate: string): Promise<DailyStockLine[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT l.*, p.name as product_name, p.unit as unit
       FROM daily_stock_lines l
       JOIN products p ON p.id = l.product_id
       WHERE l.business_id = ? AND l.business_date = ?
       ORDER BY p.name ASC`,
      [businessId, businessDate.slice(0, 10)]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async seal(
    id: string,
    businessId: string,
    values: { closing_qty: number; closing_unit_cost: number }
  ): Promise<DailyStockLine | null> {
    const current = await this.findById(id, businessId);
    if (!current) return null;
    if (current.closing_qty != null) {
      throw new Error('HISTORY_LOCKED');
    }
    return this.update(id, businessId, values);
  }

  async delete(): Promise<boolean> {
    throw new Error('HISTORY_LOCKED');
  }
}

export const dailyStockLineRepository = new DailyStockLineRepository();
