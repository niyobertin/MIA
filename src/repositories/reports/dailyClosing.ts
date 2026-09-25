import { BaseRepository } from '../base';
import { DailyClosing, DailyClosingStatus } from '@/types';
import { getDatabase } from '../../db/database';

export class DailyClosingRepository extends BaseRepository<DailyClosing> {
  protected tableName = 'daily_closings';
  protected columns = [
    'id', 'business_id', 'business_date', 'opening_cash', 'cash_sales',
    'customer_cash_payments', 'other_cash_income', 'cash_purchases', 'cash_expenses',
    'supplier_cash_payments', 'withdrawals', 'expected_cash', 'actual_cash', 'cash_variance',
    'total_sales', 'cogs', 'gross_profit', 'expenses', 'net_profit',
    'opening_stock_qty', 'opening_stock_value', 'closing_stock_qty', 'closing_stock_value',
    'notes', 'opened_by', 'opened_at', 'closed_by', 'closed_at', 'status', 'created_at', 'updated_at'
  ];

  async findByDate(businessId: string, businessDate: string): Promise<DailyClosing | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND substr(business_date, 1, 10) = ?
       ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(opened_at, created_at) DESC
       LIMIT 1`,
      [businessId, businessDate.slice(0, 10)]
    );
    return row ? this.mapRow(row) : null;
  }

  async findOpenDay(businessId: string): Promise<DailyClosing | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND status = 'open'
       ORDER BY COALESCE(opened_at, created_at) DESC
       LIMIT 1`,
      [businessId]
    );
    return row ? this.mapRow(row) : null;
  }

  async findByDateRange(businessId: string, startDate: string, endDate: string): Promise<DailyClosing[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND business_date BETWEEN ? AND ?
       ORDER BY business_date DESC`,
      [businessId, startDate, endDate]
    );
    return rows.map(row => this.mapRow(row));
  }

  async update(id: string, businessId: string, updates: Partial<Omit<DailyClosing, 'id' | 'business_id' | 'created_at'>>): Promise<DailyClosing | null> {
    const current = await this.findById(id, businessId);
    if (current?.status === 'closed') {
      throw new Error('HISTORY_LOCKED');
    }
    return super.update(id, businessId, updates);
  }

  async delete(): Promise<boolean> {
    throw new Error('HISTORY_LOCKED');
  }

  async getLatestClosing(businessId: string): Promise<DailyClosing | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND status = 'closed'
       ORDER BY COALESCE(closed_at, business_date) DESC
       LIMIT 1`,
      [businessId]
    );
    return row ? this.mapRow(row) : null;
  }
}

export const dailyClosingRepository = new DailyClosingRepository();