import { SyncRecord, SyncStatus } from '@/types';
import { syncRepository } from '@/repositories/sync';
import { getDatabase } from '@/db/database';
import NetInfo from '@react-native-community/netinfo';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export class SyncEngine {
  private isSyncing = false;
  private deviceId: string;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<(status: SyncEngineStatus) => void> = [];

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  subscribe(listener: (status: SyncEngineStatus) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(status: SyncEngineStatus): void {
    this.listeners.forEach(l => l(status));
  }

  async startAutoSync(intervalMs = 30000): Promise<void> {
    if (this.syncInterval) return;
    
    this.syncInterval = setInterval(() => {
      this.syncIfOnline();
    }, intervalMs);
    
    this.syncIfOnline();
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private async syncIfOnline(): Promise<void> {
    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected && !this.isSyncing) {
      await this.syncAll();
    }
  }

  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) return { success: false, synced: 0, failed: 0, errors: ['Already syncing'] };
    
    this.isSyncing = true;
    this.notify({ status: 'syncing', pendingCount: 0 });
    
    try {
      const pendingRecords = await syncRepository.findPending(''); // Will need businessId
      this.notify({ status: 'syncing', pendingCount: pendingRecords.length });
      
      let synced = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const record of pendingRecords) {
        try {
          await this.syncRecord(record);
          synced++;
        } catch (error) {
          failed++;
          errors.push(`Failed to sync ${record.table_name}:${record.record_id} - ${error}`);
        }
        
        this.notify({ 
          status: 'syncing', 
          pendingCount: pendingRecords.length - synced - failed,
          syncedCount: synced,
          failedCount: failed,
        });
      }
      
      this.notify({ 
        status: 'synced', 
        pendingCount: await syncRepository.getPendingCount(''),
        syncedCount: synced,
        failedCount: failed,
      });
      
      return { success: failed === 0, synced, failed, errors };
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncRecord(record: SyncRecord): Promise<void> {
    await syncRepository.markSyncing(record.id, record.business_id);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${record.table_name}`, {
        method: record.operation === 'insert' ? 'POST' : record.operation === 'update' ? 'PATCH' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(record.payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      await syncRepository.markSynced(record.id, record.business_id);
    } catch (error) {
      await syncRepository.markFailed(record.id, record.business_id, String(error));
      throw error;
    }
  }

  async queueForSync(
    tableName: string,
    recordId: string,
    businessId: string,
    operation: 'insert' | 'update' | 'delete',
    payload: Record<string, unknown>
  ): Promise<void> {
    const syncRecord: Omit<SyncRecord, 'id' | 'created_at' | 'updated_at'> = {
      table_name: tableName,
      record_id: recordId,
      business_id: businessId,
      operation,
      payload: JSON.stringify(payload),
      device_id: this.deviceId,
      status: 'pending',
      error_message: null,
      retry_count: 0,
    };
    
    await syncRepository.createSyncRecord(syncRecord);
  }

  async retryFailed(): Promise<SyncResult> {
    if (this.isSyncing) return { success: false, synced: 0, failed: 0, errors: ['Already syncing'] };
    
    this.isSyncing = true;
    this.notify({ status: 'syncing', pendingCount: 0 });
    
    try {
      const failedRecords = await syncRepository.findFailed('');
      let synced = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const record of failedRecords) {
        if (record.retry_count >= 5) continue;
        
        try {
          await this.syncRecord(record);
          synced++;
        } catch (error) {
          failed++;
          errors.push(`Retry failed for ${record.table_name}:${record.record_id} - ${error}`);
        }
      }
      
      return { success: failed === 0, synced, failed, errors };
    } finally {
      this.isSyncing = false;
      this.notify({ status: 'idle', pendingCount: await syncRepository.getPendingCount('') });
    }
  }

  getStatus(): SyncEngineStatus {
    return {
      status: this.isSyncing ? 'syncing' : 'idle',
      pendingCount: 0,
    };
  }
}

export interface SyncEngineStatus {
  status: 'idle' | 'syncing' | 'synced' | 'failed' | 'offline';
  pendingCount: number;
  syncedCount?: number;
  failedCount?: number;
  lastSyncAt?: Date;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

let syncEngineInstance: SyncEngine | null = null;

export function getSyncEngine(deviceId: string): SyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new SyncEngine(deviceId);
  }
  return syncEngineInstance;
}

export function createSyncEngine(deviceId: string): SyncEngine {
  return new SyncEngine(deviceId);
}