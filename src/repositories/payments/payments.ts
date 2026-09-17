import { BaseRepository } from '../base';
import { Payment, PaymentType, PaymentMethod, PaymentReferenceType } from '@/types';
import { getDatabase } from '../../db/database';

export class PaymentRepository extends BaseRepository<Payment> {
  protected tableName = 'payments';
  protected columns = [
    'id', 'business_id', 'type', 'payment_method', 'amount',
    'reference_type', 'reference_id', 'party_id', 'payment_date',
    'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at'
  ];

  async findByType(businessId: string, type: PaymentType): Promise<Payment[]> {
    return this.findAll(businessId, { where: { type } });
  }

  async findByReference(referenceType: PaymentReferenceType, referenceId: string, businessId: string): Promise<Payment[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND reference_type = ? AND reference_id = ?
       ORDER BY payment_date ASC`,
      [businessId, referenceType, referenceId]
    );
    return rows.map(row => this.mapRow(row));
  }

  async findByParty(partyId: string, businessId: string): Promise<Payment[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND party_id = ?
       ORDER BY payment_date DESC`,
      [businessId, partyId]
    );
    return rows.map(row => this.mapRow(row));
  }

  async findByDateRange(businessId: string, startDate: string, endDate: string): Promise<Payment[]> {
    const db = await this.getDb();
    const { buildPeriodWhere } = await import('@/utils/periodBounds');
    const period = buildPeriodWhere('payment_date', 'created_at', startDate, endDate);
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND ${period.clause}
       ORDER BY payment_date DESC`,
      [businessId, ...period.params]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getTotalByMethod(businessId: string, startDate: string, endDate: string, method?: PaymentMethod): Promise<number> {
    const db = await this.getDb();
    const { buildPeriodWhere } = await import('@/utils/periodBounds');
    const period = buildPeriodWhere('payment_date', 'created_at', startDate, endDate);
    let query = `SELECT COALESCE(SUM(amount), 0) as total FROM ${this.tableName} WHERE business_id = ? AND ${period.clause}`;
    const params: unknown[] = [businessId, ...period.params];
    
    if (method) {
      query += ` AND payment_method = ?`;
      params.push(method);
    }
    
    const row = await db.getFirstAsync<{ total: number }>(query, params as (string | number | null)[]);
    return row?.total ?? 0;
  }

  async getTotalByTypeAndMethod(
    businessId: string,
    startDate: string,
    endDate: string,
    type: PaymentType,
    method: PaymentMethod = 'cash'
  ): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND payment_date BETWEEN ? AND ?
       AND type = ? AND payment_method = ?`,
      [businessId, startDate, endDate, type, method]
    );
    return row?.total ?? 0;
  }

  async getCashInflows(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND payment_date BETWEEN ? AND ?
       AND type IN ('customer_payment', 'sale_payment', 'other_income')
       AND payment_method = 'cash'`,
      [businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }

  async getCashOutflows(businessId: string, startDate: string, endDate: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM ${this.tableName}
       WHERE business_id = ? AND payment_date BETWEEN ? AND ?
       AND type IN ('supplier_payment', 'purchase_payment', 'expense_payment', 'withdrawal')
       AND payment_method = 'cash'`,
      [businessId, startDate, endDate]
    );
    return row?.total ?? 0;
  }

  async getPaymentBreakdown(businessId: string, startDate: string, endDate: string): Promise<Array<{ payment_method: PaymentMethod; amount: number; count: number }>> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<{ payment_method: PaymentMethod; amount: number; count: number }>(
      `SELECT payment_method, COALESCE(SUM(amount), 0) as amount, COUNT(*) as count
       FROM ${this.tableName}
       WHERE business_id = ? AND payment_date BETWEEN ? AND ?
       GROUP BY payment_method`,
      [businessId, startDate, endDate]
    );
    return rows;
  }
}

export const paymentRepository = new PaymentRepository();