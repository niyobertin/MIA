import { getDatabase } from '@/db/database';
import { generateUUID } from '@/utils/uuid';
import { SyncStatus } from '@/types';

export interface BaseEntity {
  id: string;
  business_id: string;
  created_at: string;
  updated_at: string;
  sync_status?: SyncStatus;
  device_id?: string;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  where?: Record<string, unknown>;
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract tableName: string;
  protected abstract columns: string[];

  protected async getDb() {
    return getDatabase();
  }

  protected mapRow(row: Record<string, unknown>): T {
    return row as T;
  }

  protected toBindValue(value: unknown): unknown {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  }

  async findById(id: string, businessId: string): Promise<T | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE id = ? AND business_id = ?`,
      [id, businessId]
    );
    return row ? this.mapRow(row) : null;
  }

  async findAll(businessId: string, options: QueryOptions = {}): Promise<T[]> {
    const db = await this.getDb();
    const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'DESC', where = {} } = options;
    
    let query = `SELECT * FROM ${this.tableName} WHERE business_id = ?`;
    const params: unknown[] = [businessId];
    
    for (const [key, value] of Object.entries(where)) {
      query += ` AND ${key} = ?`;
      params.push(value);
    }
    
    query += ` ORDER BY ${orderBy} ${orderDirection} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const rows = await db.getAllAsync<Record<string, unknown>>(query, params);
    return rows.map(row => this.mapRow(row));
  }

  async findOne(businessId: string, where: Record<string, unknown>): Promise<T | null> {
    const db = await this.getDb();
    let query = `SELECT * FROM ${this.tableName} WHERE business_id = ?`;
    const params: unknown[] = [businessId];
    
    for (const [key, value] of Object.entries(where)) {
      query += ` AND ${key} = ?`;
      params.push(value);
    }
    
    query += ` LIMIT 1`;
    
    const row = await db.getFirstAsync<Record<string, unknown>>(query, params);
    return row ? this.mapRow(row) : null;
  }

  async count(businessId: string, where: Record<string, unknown> = {}): Promise<number> {
    const db = await this.getDb();
    let query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE business_id = ?`;
    const params: unknown[] = [businessId];
    
    for (const [key, value] of Object.entries(where)) {
      query += ` AND ${key} = ?`;
      params.push(value);
    }
    
    const row = await db.getFirstAsync<{ count: number }>(query, params);
    return row?.count ?? 0;
  }

  async create(entity: Omit<T, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<T> {
    const db = await this.getDb();
    const id = entity.id ?? generateUUID();
    const now = new Date().toISOString();
    
    const reserved = ['id', 'business_id', 'created_at', 'updated_at'];
    const columns = ['id', 'business_id', ...this.columns.filter(c => !reserved.includes(c)), 'created_at', 'updated_at'];
    const placeholders = columns.map(() => '?').join(', ');
    const values = [
      id,
      entity.business_id,
      ...this.columns
        .filter(c => !['id', 'business_id', 'created_at', 'updated_at'].includes(c))
        .map(c => this.toBindValue((entity as Record<string, unknown>)[c] ?? null)),
      now,
      now,
    ];
    
    await db.runAsync(
      `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
    
    const created = await this.findById(id, entity.business_id);
    if (!created) throw new Error('Failed to create entity');
    return created;
  }

  async update(id: string, businessId: string, updates: Partial<Omit<T, 'id' | 'business_id' | 'created_at'>>): Promise<T | null> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates).map(v => this.toBindValue(v)), now, id, businessId];
    
    await db.runAsync(
      `UPDATE ${this.tableName} SET ${setClause}, updated_at = ? WHERE id = ? AND business_id = ?`,
      values
    );
    
    return this.findById(id, businessId);
  }

  async delete(id: string, businessId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db.runAsync(
      `DELETE FROM ${this.tableName} WHERE id = ? AND business_id = ?`,
      [id, businessId]
    );
    return result.changes > 0;
  }

  async findPendingSync(businessId: string, limit = 50): Promise<T[]> {
    return this.findAll(businessId, {
      where: { sync_status: 'pending' },
      limit,
      orderBy: 'created_at',
      orderDirection: 'ASC',
    });
  }

  async markAsSynced(id: string, businessId: string): Promise<void> {
    await this.update(id, businessId, { sync_status: 'synced', updated_at: new Date().toISOString() });
  }

  async markAsFailed(id: string, businessId: string, errorMessage: string): Promise<void> {
    await this.update(id, businessId, { sync_status: 'failed', updated_at: new Date().toISOString() });
  }

  async executeInTransaction<T>(callback: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
    const db = await this.getDb();
    return db.withTransactionAsync(callback);
  }
}

import * as SQLite from 'expo-sqlite';
