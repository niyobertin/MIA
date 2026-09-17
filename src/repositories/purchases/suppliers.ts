import { BaseRepository } from '../base';
import { Supplier } from '@/types';

export class SupplierRepository extends BaseRepository<Supplier> {
  protected tableName = 'suppliers';
  protected columns = ['id', 'business_id', 'name', 'phone', 'email', 'address', 'active', 'created_at', 'updated_at'];

  async findActive(businessId: string): Promise<Supplier[]> {
    return this.findAll(businessId, { where: { active: 1 } });
  }

  async search(businessId: string, query: string): Promise<Supplier[]> {
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
}

export const supplierRepository = new SupplierRepository();