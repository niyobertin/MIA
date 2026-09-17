import { BaseRepository } from './base';
import { SyncRecord, SyncStatus } from '@/types';
import { getDatabase } from '../db/database';

export class SyncRepository extends BaseRepository<SyncRecord> {
  protected tableName = 'sync_records';
  protected columns = [
    'id', 'table_name', 'record_id', 'business_id', 'operation',
    'payload', 'device_id', 'status', 'error_message', 'retry_count', 'created_at', 'updated_at'
  ];

  async findPending(businessId: string, limit = 50): Promise<SyncRecord[]> {
    return this.findAll(businessId, {
      where: { status: 'pending' },
      limit,
      orderBy: 'created_at',
      orderDirection: 'ASC',
    });
  }

  async findFailed(businessId: string, limit = 50): Promise<SyncRecord[]> {
    return this.findAll(businessId, {
      where: { status: 'failed' },
      limit,
      orderBy: 'created_at',
      orderDirection: 'ASC',
    });
  }

  async findByTableAndRecord(tableName: string, recordId: string, businessId: string): Promise<SyncRecord | null> {
    return this.findOne(businessId, { table_name: tableName, record_id: recordId });
  }

  async markSyncing(id: string, businessId: string): Promise<void> {
    await this.update(id, businessId, { status: 'syncing' });
  }

  async markSynced(id: string, businessId: string): Promise<void> {
    await this.update(id, businessId, { status: 'synced' });
  }

  async markFailed(id: string, businessId: string, errorMessage: string): Promise<void> {
    const record = await this.findById(id, businessId);
    if (record) {
      await this.update(id, businessId, {
        status: 'failed',
        error_message: errorMessage,
        retry_count: (record.retry_count ?? 0) + 1,
      });
    }
  }

  async createSyncRecord(record: Omit<SyncRecord, 'id' | 'created_at' | 'updated_at'>): Promise<SyncRecord> {
    return this.create(record as any);
  }

  async getPendingCount(businessId: string): Promise<number> {
    return this.count(businessId, { status: 'pending' });
  }
}

export const syncRepository = new SyncRepository();