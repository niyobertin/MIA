import { BaseRepository } from '../base';
import { User, UserRole } from '@/types';

export class UserRepository extends BaseRepository<User> {
  protected tableName = 'users';
  protected columns = ['id', 'business_id', 'name', 'email', 'phone', 'role', 'active', 'created_at', 'updated_at'];

  async findByEmail(email: string, businessId: string): Promise<User | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE email = ? AND business_id = ?`,
      [email, businessId]
    );
    return row ? this.mapRow(row) : null;
  }

  async findByRole(businessId: string, role: UserRole): Promise<User[]> {
    return this.findAll(businessId, { where: { role } });
  }

  async findActiveUsers(businessId: string): Promise<User[]> {
    return this.findAll(businessId, { where: { active: 1 } });
  }

  async setActive(id: string, businessId: string, active: boolean): Promise<User | null> {
    return this.update(id, businessId, { active: active ? 1 : 0 });
  }
}

export const userRepository = new UserRepository();