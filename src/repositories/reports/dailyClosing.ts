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
    'notes', 'closed_by', 'closed_at', 'status', 'created_at', 'updated_at'
  ];

  async findByDate(businessId: string, businessDate: string): Promise<DailyClosing | null> {
    return this.findOne(businessId, { business_date: businessDate });
  }

  async findByStatus(businessId: string, status: DailyClosingStatus): Promise<DailyClosing[]> {
    return this.findAll(businessId, { where: { status } });
  }

  async findOpenDay(businessId: string): Promise<DailyClosing | null> {
    return this.findOne(businessId, { status: 'open' });
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

  async getLatestClosing(businessId: string): Promise<DailyClosing | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND status = 'closed'
       ORDER BY business_date DESC
       LIMIT 1`,
      [businessId]
    );
    return row ? this.mapRow(row) : null;
  }
}

export const dailyClosingRepository = new DailyClosingRepository();