import { BaseRepository } from '../base';
import { Customer } from '@/types';

export class CustomerRepository extends BaseRepository<Customer> {
  protected tableName = 'customers';
  protected columns = ['id', 'business_id', 'name', 'phone', 'email', 'address', 'credit_limit', 'active', 'created_at', 'updated_at'];

  async findActive(businessId: string): Promise<Customer[]> {
    return this.findAll(businessId, { where: { active: 1 }, limit: 5000, orderBy: 'name', orderDirection: 'ASC' });
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

  /**
   * Single source of truth for customer debt lives in SaleRepository.getCustomerPosition
   * (credit sales - checkout payments - later collections). This delegates there so
   * the balance can never drift between screens.
   */
  async getTotalOutstanding(businessId: string, customerId: string): Promise<number> {
    const { saleRepository } = await import('./sales');
    const position = await saleRepository.getCustomerPosition(customerId, businessId);
    return position.outstanding;
  }
}

export const customerRepository = new CustomerRepository();