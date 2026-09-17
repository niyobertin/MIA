import { getDatabase } from '@/db/database';
import { generateUUID } from '@/utils/uuid';
import { Business } from '@/types';

export class BusinessRepository {
  protected tableName = 'businesses';

  protected async getDb() {
    return getDatabase();
  }

  async findById(id: string): Promise<Business | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return row ? (row as unknown as Business) : null;
  }

  async findByCode(businessCode: string): Promise<Business | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE business_code = ?`,
      [businessCode]
    );
    return row ? (row as unknown as Business) : null;
  }

  async create(business: Omit<Business, 'created_at' | 'updated_at'> & { id?: string }): Promise<Business> {
    const db = await this.getDb();
    const id = business.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO ${this.tableName} (id, name, business_code, currency, country, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, business.name, business.business_code, business.currency, business.country, business.timezone, now, now]
    );

    const created = await this.findById(id);
    if (!created) throw new Error('Failed to create business');
    return created;
  }

  async update(id: string, updates: Partial<Omit<Business, 'id' | 'created_at'>>): Promise<Business | null> {
    const db = await this.getDb();
    const now = new Date().toISOString();

    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), now, id];

    await db.runAsync(
      `UPDATE ${this.tableName} SET ${setClause}, updated_at = ? WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  async generateBusinessCode(): Promise<string> {
    const prefix = 'MIA-RW';
    let code: string;
    let exists = true;

    while (exists) {
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      code = `${prefix}-${randomPart}`;
      const existing = await this.findByCode(code);
      exists = !!existing;
    }

    return code!;
  }
}

export const businessRepository = new BusinessRepository();
