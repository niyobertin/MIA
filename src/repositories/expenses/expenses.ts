import { BaseRepository } from '../base';
import { Expense, ExpenseCategory } from '@/types';
import { getDatabase } from '../../db/database';

export class ExpenseRepository extends BaseRepository<Expense> {
  protected tableName = 'expenses';
  protected columns = [
    'id', 'business_id', 'category', 'amount', 'payment_method',
    'description', 'expense_date', 'reference_number', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at'
  ];

  async findByCategory(businessId: string, category: ExpenseCategory): Promise<Expense[]> {
    return this.findAll(businessId, { where: { category } });
  }

  async findByDateRange(businessId: string, startDate: string, endDate: string): Promise<Expense[]> {
    const db = await this.getDb();
    const { buildPeriodWhere } = await import('@/utils/periodBounds');
    const period = buildPeriodWhere('expense_date', 'created_at', startDate, endDate);
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND ${period.clause}
       ORDER BY expense_date DESC`,
      [businessId, ...period.params]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getTotalExpenses(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const { buildPeriodWhere } = await import('@/utils/periodBounds');
    const period = buildPeriodWhere('expense_date', 'created_at', startDate, endDate);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND ${period.clause}`,
      [businessId, ...period.params]
    );
    return row?.total ?? 0;
  }

  async getCashExpenses(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND expense_date BETWEEN ? AND ? AND payment_method = 'cash'`,
      [businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }

  async getExpensesByCategory(businessId: string, startDate: string, endDate: string): Promise<Record<ExpenseCategory, number>> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<{ category: ExpenseCategory; total: number }>(
      `SELECT category, COALESCE(SUM(amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND expense_date BETWEEN ? AND ?
       GROUP BY category`,
      [businessId, startDate, endDate]
    );
    
    const result: Record<ExpenseCategory, number> = {
      transport: 0, rent: 0, electricity: 0, water: 0, food: 0,
      salary: 0, communication: 0, maintenance: 0, tax: 0, other: 0
    };
    
    rows.forEach(row => {
      result[row.category] = row.total;
    });
    
    return result;
  }
}

export const expenseRepository = new ExpenseRepository();