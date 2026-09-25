import { getDatabase } from '@/db/database';
import { generateUUID } from '@/utils/uuid';
import { hashPassword } from '@/utils/password';
import { User, UserRole } from '@/types';

type UserRow = {
  id: string;
  business_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: UserRole | null;
  active: number | boolean | string;
  created_at: string;
  updated_at: string;
};

export type CreateAccountInput = {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  /** When set (cloud auth user id), use this id instead of generating one. */
  id?: string;
};

export type CreateBusinessUserInput = {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  role: UserRole;
  businessId: string;
};

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    business_id: row.business_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    active: row.active === 1 || row.active === true || (row.active as unknown) === '1',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class UserRepository {
  protected tableName = 'users';

  protected async getDb() {
    return getDatabase();
  }

  async findById(id: string): Promise<User | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<UserRow>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return row ? mapUser(row) : null;
  }

  async findByIdInBusiness(id: string, businessId: string): Promise<User | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<UserRow>(
      `SELECT * FROM ${this.tableName} WHERE id = ? AND business_id = ?`,
      [id, businessId]
    );
    return row ? mapUser(row) : null;
  }

  async findCredentialByEmail(email: string): Promise<{ user: User; password_hash: string } | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<UserRow>(
      `SELECT * FROM ${this.tableName} WHERE lower(email) = lower(?)`,
      [email.trim()]
    );
    if (!row) return null;
    return { user: mapUser(row), password_hash: row.password_hash };
  }

  async findByEmail(email: string, businessId?: string): Promise<User | null> {
    const db = await this.getDb();
    if (businessId) {
      const row = await db.getFirstAsync<UserRow>(
        `SELECT * FROM ${this.tableName} WHERE lower(email) = lower(?) AND business_id = ?`,
        [email.trim(), businessId]
      );
      return row ? mapUser(row) : null;
    }

    const row = await db.getFirstAsync<UserRow>(
      `SELECT * FROM ${this.tableName} WHERE lower(email) = lower(?)`,
      [email.trim()]
    );
    return row ? mapUser(row) : null;
  }

  async emailExists(email: string): Promise<boolean> {
    const existing = await this.findByEmail(email);
    return !!existing;
  }

  async findByRole(businessId: string, role: UserRole): Promise<User[]> {
    return this.findAll(businessId, { role });
  }

  async findActiveUsers(businessId: string): Promise<User[]> {
    return this.findAll(businessId, { active: true });
  }

  async findAll(
    businessId: string,
    filters: { role?: UserRole; active?: boolean } = {}
  ): Promise<User[]> {
    const db = await this.getDb();
    let query = `SELECT * FROM ${this.tableName} WHERE business_id = ?`;
    const params: unknown[] = [businessId];

    if (filters.role) {
      query += ` AND role = ?`;
      params.push(filters.role);
    }
    if (filters.active !== undefined) {
      query += ` AND active = ?`;
      params.push(filters.active ? 1 : 0);
    }

    query += ` ORDER BY created_at DESC`;
    const rows = await db.getAllAsync<UserRow>(query, params as (string | number | null)[]);
    return rows.map(mapUser);
  }

  async createAccount(input: CreateAccountInput): Promise<User> {
    const db = await this.getDb();
    const normalizedEmail = input.email.trim().toLowerCase();
    const name = input.name.trim();

    if (!name) {
      throw new Error('Enter your name.');
    }
    if (!normalizedEmail.includes('@')) {
      throw new Error('Enter a valid email address.');
    }
    if (!input.password || input.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    if (await this.emailExists(normalizedEmail)) {
      if (!input.id) {
        throw new Error('An account with this email already exists');
      }
    }

    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();
    const password_hash = await hashPassword(input.password);

    // Clear stale local row with same email but different id (device switched to cloud auth)
    if (input.id) {
      await db.runAsync(
        `DELETE FROM ${this.tableName} WHERE lower(email) = ? AND id != ? AND business_id IS NULL`,
        [normalizedEmail, input.id]
      );
      const clash = await this.findByEmail(normalizedEmail);
      if (clash && clash.id !== input.id) {
        await db.runAsync(
          `UPDATE ${this.tableName} SET email = ? WHERE id = ?`,
          [`legacy+${clash.id.slice(0, 8)}@local.mia`, clash.id]
        );
      }
    }

    try {
      await db.runAsync(
        `INSERT INTO ${this.tableName}
          (id, business_id, name, email, phone, password_hash, role, active, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           phone = excluded.phone,
           password_hash = excluded.password_hash,
           updated_at = excluded.updated_at`,
        [
          id,
          name,
          normalizedEmail,
          input.phone?.trim() || null,
          password_hash,
          now,
          now,
        ]
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Old local schema blocked NULL business_id/role — repair and retry once
      if (/not null|constraint|null/i.test(msg)) {
        const { ensureUsersIdentitySchemaForApp } = await import('@/db/database');
        await ensureUsersIdentitySchemaForApp();
        await db.runAsync(
          `INSERT INTO ${this.tableName}
            (id, business_id, name, email, phone, password_hash, role, active, created_at, updated_at)
           VALUES (?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             email = excluded.email,
             phone = excluded.phone,
             password_hash = excluded.password_hash,
             updated_at = excluded.updated_at`,
          [
            id,
            name,
            normalizedEmail,
            input.phone?.trim() || null,
            password_hash,
            now,
            now,
          ]
        );
      } else {
        throw error;
      }
    }

    const user = await this.findById(id);
    if (!user) throw new Error('Failed to create account');
    return user;
  }

  async createBusinessUser(input: CreateBusinessUserInput): Promise<User> {
    const db = await this.getDb();
    const normalizedEmail = input.email.trim().toLowerCase();

    if (await this.emailExists(normalizedEmail)) {
      throw new Error('An account with this email already exists');
    }

    const id = generateUUID();
    const now = new Date().toISOString();
    const password_hash = await hashPassword(input.password);

    await db.runAsync(
      `INSERT INTO ${this.tableName}
        (id, business_id, name, email, phone, password_hash, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        input.businessId,
        input.name.trim(),
        normalizedEmail,
        input.phone?.trim() || null,
        password_hash,
        input.role,
        now,
        now,
      ]
    );

    const user = await this.findById(id);
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  async attachToBusiness(
    userId: string,
    businessId: string,
    role: UserRole
  ): Promise<User> {
    const db = await this.getDb();
    const existing = await this.findById(userId);
    if (!existing) throw new Error('User not found');
    if (existing.business_id && existing.business_id !== businessId) {
      throw new Error('User already belongs to another business');
    }

    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE ${this.tableName}
       SET business_id = ?, role = ?, updated_at = ?
       WHERE id = ?`,
      [businessId, role, now, userId]
    );

    const user = await this.findById(userId);
    if (!user) throw new Error('Failed to attach user to business');
    return user;
  }

  async updateBusinessUser(
    id: string,
    businessId: string,
    input: {
      name: string;
      email: string;
      phone?: string | null;
      role: UserRole;
      password?: string;
      active?: boolean;
    }
  ): Promise<User> {
    const existing = await this.findByIdInBusiness(id, businessId);
    if (!existing) throw new Error('User not found');
    if (existing.role === 'OWNER' && input.role !== 'OWNER') {
      throw new Error('OWNER_LOCKED');
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const emailOwner = await this.findByEmail(normalizedEmail);
    if (emailOwner && emailOwner.id !== id) {
      throw new Error('An account with this email already exists');
    }

    const db = await this.getDb();
    const now = new Date().toISOString();
    const password = input.password?.trim();
    if (password) {
      const password_hash = await hashPassword(password);
      await db.runAsync(
        `UPDATE ${this.tableName}
         SET name = ?, email = ?, phone = ?, role = ?, active = ?, password_hash = ?, updated_at = ?
         WHERE id = ? AND business_id = ?`,
        [
          input.name.trim(),
          normalizedEmail,
          input.phone?.trim() || null,
          existing.role === 'OWNER' ? 'OWNER' : input.role,
          input.active === false ? 0 : 1,
          password_hash,
          now,
          id,
          businessId,
        ]
      );
    } else {
      await db.runAsync(
        `UPDATE ${this.tableName}
         SET name = ?, email = ?, phone = ?, role = ?, active = ?, updated_at = ?
         WHERE id = ? AND business_id = ?`,
        [
          input.name.trim(),
          normalizedEmail,
          input.phone?.trim() || null,
          existing.role === 'OWNER' ? 'OWNER' : input.role,
          input.active === false ? 0 : 1,
          now,
          id,
          businessId,
        ]
      );
    }

    const user = await this.findByIdInBusiness(id, businessId);
    if (!user) throw new Error('Failed to update user');
    return user;
  }

  async setActive(id: string, businessId: string, active: boolean): Promise<User | null> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE ${this.tableName}
       SET active = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [active ? 1 : 0, now, id, businessId]
    );
    return this.findByIdInBusiness(id, businessId);
  }

  async delete(id: string, businessId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db.runAsync(
      `DELETE FROM ${this.tableName} WHERE id = ? AND business_id = ?`,
      [id, businessId]
    );
    return result.changes > 0;
  }

  /** @deprecated Prefer createAccount / createBusinessUser */
  async create(entity: Omit<User, 'created_at' | 'updated_at'> & {
    id?: string;
    password?: string;
    created_at?: string;
    updated_at?: string;
  }): Promise<User> {
    if (!entity.business_id) {
      throw new Error('business_id is required when creating a business user');
    }
    if (!entity.role) {
      throw new Error('role is required when creating a business user');
    }
    return this.createBusinessUser({
      name: entity.name,
      email: entity.email,
      password: entity.password ?? generateUUID(),
      phone: entity.phone,
      role: entity.role,
      businessId: entity.business_id,
    });
  }
}

export const userRepository = new UserRepository();
