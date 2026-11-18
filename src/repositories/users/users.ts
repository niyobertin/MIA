import { getDatabase } from '@/db/database';
import { generateUUID } from '@/utils/uuid';
import { hashPassword } from '@/utils/password';
import { getPinProblem } from '@/utils/pin';
import { User, UserRole } from '@/types';
import { Identifier, normalizeEmail, normalizePhone, parseIdentifier } from '@/utils/identity';

export class PinValidationError extends Error {
  constructor(public problem: 'pinInvalid' | 'pinTooEasy') {
    super(problem === 'pinInvalid' ? 'PIN must be exactly 4 digits' : 'This PIN is too easy to guess');
    this.name = 'PinValidationError';
  }
}

function assertValidPin(pin: string | undefined): void {
  const problem = getPinProblem(pin ?? '');
  if (problem) throw new PinValidationError(problem);
}

type UserRow = {
  id: string;
  business_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  password_hash: string;
  role: UserRole | null;
  active: number | boolean | string;
  created_at: string;
  updated_at: string;
};

export class DuplicateAccountError extends Error {
  constructor(public field: 'email' | 'phone') {
    super(field === 'email' ? 'An account with this email already exists' : 'An account with this phone number already exists');
    this.name = 'DuplicateAccountError';
  }
}

export class MissingIdentifierError extends Error {
  constructor(public problem: 'identifierRequired' | 'invalidEmail' | 'invalidPhone') {
    super(problem);
    this.name = 'MissingIdentifierError';
  }
}

function normalizeContact(email: string | null | undefined, phone: string | null | undefined) {
  const rawEmail = (email ?? '').trim();
  const rawPhone = (phone ?? '').trim();
  const normalizedEmail = rawEmail ? normalizeEmail(rawEmail) : null;
  const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawEmail && !normalizedEmail) throw new MissingIdentifierError('invalidEmail');
  if (rawPhone && !normalizedPhone) throw new MissingIdentifierError('invalidPhone');
  if (!normalizedEmail && !normalizedPhone) throw new MissingIdentifierError('identifierRequired');
  return { email: normalizedEmail, phone: normalizedPhone };
}

export type CreateAccountInput = {
  name: string;
  email?: string | null;
  password: string;
  phone?: string | null;
  /** When set (cloud auth user id), use this id instead of generating one. */
  id?: string;
};

export type CreateBusinessUserInput = {
  name: string;
  email?: string | null;
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

  private async findRowsByIdentifier(identifier: Identifier, businessId?: string): Promise<UserRow[]> {
    const db = await this.getDb();
    const scope = businessId ? ' AND business_id = ?' : '';
    if (identifier.kind === 'email') {
      const params: string[] = businessId ? [identifier.value, businessId] : [identifier.value];
      return db.getAllAsync<UserRow>(
        `SELECT * FROM ${this.tableName} WHERE lower(email) = lower(?)${scope}`,
        params
      );
    }
    const all = await db.getAllAsync<UserRow>(
      `SELECT * FROM ${this.tableName} WHERE phone IS NOT NULL${scope}`,
      businessId ? [businessId] : []
    );
    return all.filter((row) => normalizePhone(row.phone) === identifier.value);
  }

  async findCredentialByIdentifier(raw: string): Promise<{ user: User; password_hash: string } | null> {
    const identifier = parseIdentifier(raw);
    if (!identifier) return null;
    const rows = await this.findRowsByIdentifier(identifier);
    if (rows.length !== 1) return null;
    return { user: mapUser(rows[0]), password_hash: rows[0].password_hash };
  }

  async findByIdentifier(raw: string, businessId?: string): Promise<User | null> {
    const identifier = parseIdentifier(raw);
    if (!identifier) return null;
    const rows = await this.findRowsByIdentifier(identifier, businessId);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByEmail(email: string, businessId?: string): Promise<User | null> {
    const value = normalizeEmail(email);
    if (!value) return null;
    const rows = await this.findRowsByIdentifier({ kind: 'email', value }, businessId);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  private async assertContactFree(email: string | null, phone: string | null, exceptId?: string): Promise<void> {
    if (email) {
      const rows = await this.findRowsByIdentifier({ kind: 'email', value: email });
      if (rows.some((row) => row.id !== exceptId)) throw new DuplicateAccountError('email');
    }
    if (phone) {
      const rows = await this.findRowsByIdentifier({ kind: 'phone', value: phone });
      if (rows.some((row) => row.id !== exceptId)) throw new DuplicateAccountError('phone');
    }
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
    const { email: normalizedEmail, phone: normalizedPhone } = normalizeContact(input.email, input.phone);
    const name = input.name.trim();

    if (!name) {
      throw new Error('Enter your name.');
    }
    assertValidPin(input.password);

    if (!input.id) {
      await this.assertContactFree(normalizedEmail, normalizedPhone);
    }

    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();
    const password_hash = await hashPassword(input.password);

    // Clear stale local row with same email but different id (device switched to cloud auth)
    if (input.id) {
      for (const identifier of [
        normalizedEmail ? { kind: 'email' as const, value: normalizedEmail } : null,
        normalizedPhone ? { kind: 'phone' as const, value: normalizedPhone } : null,
      ]) {
        if (!identifier) continue;
        const clashes = (await this.findRowsByIdentifier(identifier)).filter((row) => row.id !== input.id);
        for (const clash of clashes) {
          if (!clash.business_id) {
            await db.runAsync(`DELETE FROM ${this.tableName} WHERE id = ?`, [clash.id]);
          } else if (identifier.kind === 'email') {
            await db.runAsync(`UPDATE ${this.tableName} SET email = NULL WHERE id = ?`, [clash.id]);
          }
        }
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
          normalizedPhone,
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
            normalizedPhone,
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

  async createBusinessUser(
    input: CreateBusinessUserInput,
    options: { allowNonPin?: boolean } = {}
  ): Promise<User> {
    const db = await this.getDb();
    const { email: normalizedEmail, phone: normalizedPhone } = normalizeContact(input.email, input.phone);
    await this.assertContactFree(normalizedEmail, normalizedPhone);

    if (!options.allowNonPin) assertValidPin(input.password);
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
        normalizedPhone,
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
      email?: string | null;
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

    const { email: normalizedEmail, phone: normalizedPhone } = normalizeContact(input.email, input.phone);
    await this.assertContactFree(normalizedEmail, normalizedPhone, id);

    const db = await this.getDb();
    const now = new Date().toISOString();
    const password = input.password?.trim();
    if (password) {
      assertValidPin(password);
      const password_hash = await hashPassword(password);
      await db.runAsync(
        `UPDATE ${this.tableName}
         SET name = ?, email = ?, phone = ?, role = ?, active = ?, password_hash = ?, updated_at = ?
         WHERE id = ? AND business_id = ?`,
        [
          input.name.trim(),
          normalizedEmail,
          normalizedPhone,
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
          normalizedPhone,
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

  async getPasswordHash(id: string): Promise<string | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ password_hash: string }>(
      `SELECT password_hash FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return row?.password_hash ?? null;
  }

  async setPin(id: string, pin: string): Promise<void> {
    assertValidPin(pin);
    const db = await this.getDb();
    const password_hash = await hashPassword(pin);
    await db.runAsync(
      `UPDATE ${this.tableName} SET password_hash = ?, updated_at = ? WHERE id = ?`,
      [password_hash, new Date().toISOString(), id]
    );
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
    }, { allowNonPin: !entity.password });
  }
}

export const userRepository = new UserRepository();
