import { BaseRepository } from '../base';
import { Customer } from '@/types';

export class CustomerRepository extends BaseRepository<Customer> {
  protected tableName = 'customers';
  protected columns = ['id', 'business_id', 'name', 'phone', 'email', 'address', 'credit_limit', 'active', 'created_at', 'updated_at'];

  async findActive(businessId: string): Promise<Customer[]> {
    return this.findAll(businessId, { where: { active: 1 } });
  }

  async search(businessId: string, query: string): Promise<Customer[]> {
    const db = await this.getDb();
    const searchTerm = `%${query}%`;
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName}
       WHERE business_id = ? AND active = 1
       AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)
       ORDER BY name ASC`,
      [businessId, searchTerm, searchTerm, searchTerm]
    );
    return rows.map(row => this.mapRow(row));
  }

  async getTotalOutstanding(businessId: string, customerId: string): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'sale_payment' THEN -amount ELSE amount END), 0) as total
       FROM payments
       WHERE business_id = ? AND party_id = ? AND type IN ('sale_payment', 'customer_payment')`,
      [businessId, customerId]
    );
    return row?.total ?? 0;
  }
}

export const customerRepository = new CustomerRepository();