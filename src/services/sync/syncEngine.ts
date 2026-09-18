import { SyncRecord } from '@/types';
import { syncRepository } from '@/repositories/sync';
import { useAuthStore } from '@/stores/authStore';
import NetInfo from '@react-native-community/netinfo';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Legacy anon keys are JWTs (eyJ…). New publishable keys (sb_…) must NOT be sent as Bearer. */
const IS_LEGACY_JWT_KEY = SUPABASE_ANON_KEY.startsWith('eyJ');
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function buildSupabaseHeaders(prefer: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Prefer: prefer,
  };
  // New sb_publishable / sb_secret keys are not JWTs — Bearer causes auth/gateway failures.
  if (IS_LEGACY_JWT_KEY) {
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return headers;
}

const SYNC_ORDER = [
  'businesses',
  'users',
  'categories',
  'products',
  'suppliers',
  'customers',
  'purchases',
  'purchase_items',
  'sales',
  'sale_items',
  'expenses',
  'payments',
  'stock_movements',
  'daily_closings',
];

const STRIP_KEYS = new Set([
  'current_stock',
  'password_hash',
]);

/** Only columns that exist on Supabase — extra local fields cause PostgREST 500. */
const TABLE_COLUMNS: Record<string, Set<string>> = {
  businesses: new Set(['id', 'name', 'business_code', 'currency', 'country', 'timezone', 'created_at', 'updated_at']),
  users: new Set(['id', 'business_id', 'name', 'email', 'phone', 'role', 'active', 'created_at', 'updated_at']),
  categories: new Set(['id', 'business_id', 'name', 'description', 'active', 'created_at', 'updated_at']),
  products: new Set([
    'id', 'business_id', 'category_id', 'name', 'sku', 'barcode', 'unit',
    'selling_price', 'average_cost', 'reorder_level', 'track_inventory', 'active', 'created_at', 'updated_at',
  ]),
  suppliers: new Set(['id', 'business_id', 'name', 'phone', 'email', 'address', 'active', 'created_at', 'updated_at']),
  customers: new Set([
    'id', 'business_id', 'name', 'phone', 'email', 'address', 'credit_limit', 'active', 'created_at', 'updated_at',
  ]),
  stock_movements: new Set([
    'id', 'business_id', 'product_id', 'type', 'quantity', 'unit_cost', 'reference_type', 'reference_id',
    'occurred_at', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ]),
  purchases: new Set([
    'id', 'business_id', 'supplier_id', 'reference_number', 'total_amount', 'paid_amount', 'status',
    'purchase_date', 'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ]),
  purchase_items: new Set([
    'id', 'business_id', 'purchase_id', 'product_id', 'quantity', 'unit_cost', 'total_cost', 'created_at', 'updated_at',
  ]),
  sales: new Set([
    'id', 'business_id', 'customer_id', 'reference_number', 'subtotal', 'discount_amount', 'tax_amount',
    'total_amount', 'paid_amount', 'payment_status', 'sale_date', 'notes', 'created_by', 'device_id',
    'sync_status', 'created_at', 'updated_at',
  ]),
  sale_items: new Set([
    'id', 'business_id', 'sale_id', 'product_id', 'quantity', 'selling_price', 'unit_cost',
    'discount_amount', 'tax_amount', 'total_amount', 'created_at', 'updated_at',
  ]),
  expenses: new Set([
    'id', 'business_id', 'category', 'amount', 'payment_method', 'description', 'expense_date',
    'reference_number', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ]),
  payments: new Set([
    'id', 'business_id', 'type', 'payment_method', 'amount', 'reference_type', 'reference_id',
    'party_id', 'payment_date', 'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ]),
  daily_closings: new Set([
    'id', 'business_id', 'business_date', 'opening_cash', 'cash_sales', 'customer_cash_payments',
    'other_cash_income', 'cash_purchases', 'cash_expenses', 'supplier_cash_payments', 'withdrawals',
    'expected_cash', 'actual_cash', 'cash_variance', 'total_sales', 'cogs', 'gross_profit', 'expenses',
    'net_profit', 'notes', 'closed_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ]),
};

function preparePayload(tableName: string, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = TABLE_COLUMNS[tableName];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (STRIP_KEYS.has(key)) continue;
    if (allowed && !allowed.has(key)) continue;
    if (value === undefined) continue;
    if ((key === 'active' || key === 'track_inventory') && (value === 0 || value === 1)) {
      out[key] = value === 1;
      continue;
    }
    out[key] = value;
  }

  if (tableName === 'users' && (out.role === '' || out.role == null)) {
    out.role = null;
  }

  return out;
}

function sortPending(records: SyncRecord[]): SyncRecord[] {
  return [...records].sort((a, b) => {
    const ai = SYNC_ORDER.indexOf(a.table_name);
    const bi = SYNC_ORDER.indexOf(b.table_name);
    const ao = ai === -1 ? 999 : ai;
    const bo = bi === -1 ? 999 : bi;
    if (ao !== bo) return ao - bo;
    return a.created_at.localeCompare(b.created_at);
  });
}

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
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(status: SyncEngineStatus): void {
    this.listeners.forEach((l) => l(status));
  }

  private getBusinessId(): string | null {
    return useAuthStore.getState().business?.id ?? null;
  }

  async startAutoSync(intervalMs = 30000): Promise<void> {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(() => {
      void this.syncIfOnline();
    }, intervalMs);

    void this.syncIfOnline();
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

  private async upsertTenantAnchors(businessId: string): Promise<void> {
    if (!isUuid(businessId)) {
      throw new Error(
        `Business id is not a UUID ("${businessId}"). Log out, reopen the app, and sign in again so local demo/new IDs remount.`
      );
    }

    const { businessRepository } = await import('@/repositories/business/business');
    const { userRepository } = await import('@/repositories/users/users');
    const auth = useAuthStore.getState();

    const business =
      (await businessRepository.findById(businessId)) ??
      (auth.business?.id === businessId ? auth.business : null);

    if (!business) {
      throw new Error(`Local business ${businessId} not found`);
    }
    if (!isUuid(business.id)) {
      throw new Error(`Business id is not a UUID ("${business.id}")`);
    }

    await this.pushDirect(
      'businesses',
      business.id,
      'insert',
      business as unknown as Record<string, unknown>
    );

    let user = auth.user;
    if (user?.id && !isUuid(user.id) && user.email) {
      user = await userRepository.findByEmail(user.email, businessId);
      if (user) {
        useAuthStore.setState({ user, business });
      }
    } else if (user?.id) {
      user = (await userRepository.findById(user.id)) ?? user;
    }

    if (user?.id) {
      if (!isUuid(user.id)) {
        throw new Error(
          `User id is not a UUID ("${user.id}"). Log out and sign in again.`
        );
      }
      await this.pushDirect(
        'users',
        user.id,
        'insert',
        user as unknown as Record<string, unknown>
      );
    }
  }

  private async pushDirect(
    tableName: string,
    recordId: string,
    operation: 'insert' | 'update' | 'delete',
    payload: Record<string, unknown>
  ): Promise<void> {
    const fake: SyncRecord = {
      id: recordId,
      table_name: tableName,
      record_id: recordId,
      business_id: this.getBusinessId() ?? '',
      operation,
      payload,
      device_id: this.deviceId,
      status: 'pending',
      error_message: null,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await this.syncRecord(fake, { skipStatusUpdate: true });
  }

  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, synced: 0, failed: 0, errors: ['Already syncing'] };
    }

    const businessId = this.getBusinessId();
    if (!businessId) {
      return { success: false, synced: 0, failed: 0, errors: ['No active business'] };
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      this.notify({ status: 'failed', pendingCount: await syncRepository.getPendingCount(businessId) });
      return {
        success: false,
        synced: 0,
        failed: 0,
        errors: ['Cloud sync is not configured (missing Supabase URL/key)'],
      };
    }

    if (
      !IS_LEGACY_JWT_KEY &&
      !SUPABASE_ANON_KEY.startsWith('sb_publishable_') &&
      !SUPABASE_ANON_KEY.startsWith('sb_secret_')
    ) {
      this.notify({ status: 'failed', pendingCount: await syncRepository.getPendingCount(businessId) });
      return {
        success: false,
        synced: 0,
        failed: 0,
        errors: [
          'Invalid Supabase key in .env — use the legacy anon JWT (eyJ…) or sb_publishable_… from Project Settings → API Keys',
        ],
      };
    }

    this.isSyncing = true;
    this.notify({ status: 'syncing', pendingCount: 0 });

    try {
      try {
        await this.upsertTenantAnchors(businessId);
      } catch (error) {
        const message = `Tenant sync failed (business/user must exist in Supabase first): ${error}`;
        this.notify({
          status: 'failed',
          pendingCount: await syncRepository.getPendingCount(businessId),
          lastSyncAt: new Date(),
        });
        return { success: false, synced: 0, failed: 1, errors: [message] };
      }

      const pendingRecords = sortPending(await syncRepository.findPending(businessId));
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
          pendingCount: Math.max(0, pendingRecords.length - synced - failed),
          syncedCount: synced,
          failedCount: failed,
        });
      }

      const pendingCount = await syncRepository.getPendingCount(businessId);
      this.notify({
        status: failed > 0 ? 'failed' : 'synced',
        pendingCount,
        syncedCount: synced,
        failedCount: failed,
        lastSyncAt: new Date(),
      });

      return { success: failed === 0, synced, failed, errors };
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncRecord(
    record: SyncRecord,
    options?: { skipStatusUpdate?: boolean }
  ): Promise<void> {
    if (!options?.skipStatusUpdate) {
      await syncRepository.markSyncing(record.id, record.business_id);
    }

    try {
      const raw =
        typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload;
      const payload = preparePayload(record.table_name, raw as Record<string, unknown>);

      let url = `${SUPABASE_URL}/rest/v1/${record.table_name}`;
      let method: string = 'POST';

      if (record.operation === 'update') {
        method = 'PATCH';
        url += `?id=eq.${encodeURIComponent(record.record_id)}`;
      } else if (record.operation === 'delete') {
        method = 'DELETE';
        url += `?id=eq.${encodeURIComponent(record.record_id)}`;
      } else {
        url += `?on_conflict=id`;
      }

      const prefer =
        record.operation === 'insert'
          ? 'resolution=merge-duplicates,return=representation'
          : 'return=representation';
      const headers = buildSupabaseHeaders(prefer);

      if (record.operation !== 'delete') {
        const id = payload.id;
        if (id != null && !isUuid(id)) {
          throw new Error(
            `Refusing to sync ${record.table_name} with non-UUID id "${String(id)}"`
          );
        }
        const bid = payload.business_id;
        if (bid != null && bid !== '' && !isUuid(bid)) {
          throw new Error(
            `Refusing to sync ${record.table_name} with non-UUID business_id "${String(bid)}"`
          );
        }
      }

      const response = await fetch(url, {
        method,
        headers,
        body: record.operation === 'delete' ? undefined : JSON.stringify(payload),
      });

      const responseText = await response.text();
      if (!response.ok) {
        const short = responseText.length > 280 ? `${responseText.slice(0, 280)}…` : responseText;
        console.warn('[sync]', method, url, response.status, short, payload);
        throw new Error(`HTTP ${response.status}: ${short}`);
      }

      if (record.operation !== 'delete') {
        let body: unknown = null;
        try {
          body = responseText ? JSON.parse(responseText) : null;
        } catch {
          body = null;
        }
        if (Array.isArray(body) && body.length === 0) {
          throw new Error(
            'Cloud write returned 0 rows (usually RLS blocked the insert). Apply supabase/migrations/004_offline_device_sync.sql'
          );
        }
      }

      if (!options?.skipStatusUpdate) {
        await syncRepository.markSynced(record.id, record.business_id);
      }
    } catch (error) {
      if (!options?.skipStatusUpdate) {
        await syncRepository.markFailed(record.id, record.business_id, String(error));
      }
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
      payload: JSON.stringify(preparePayload(tableName, payload)),
      device_id: this.deviceId,
      status: 'pending',
      error_message: null,
      retry_count: 0,
    };

    await syncRepository.createSyncRecord(syncRecord);
  }

  async retryFailed(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, synced: 0, failed: 0, errors: ['Already syncing'] };
    }

    const businessId = this.getBusinessId();
    if (!businessId) {
      return { success: false, synced: 0, failed: 0, errors: ['No active business'] };
    }

    this.isSyncing = true;
    this.notify({ status: 'syncing', pendingCount: 0 });

    try {
      try {
        await this.upsertTenantAnchors(businessId);
      } catch (error) {
        return { success: false, synced: 0, failed: 1, errors: [String(error)] };
      }

      const failedRecords = sortPending(await syncRepository.findFailed(businessId));
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

      const pendingCount = await syncRepository.getPendingCount(businessId);
      this.notify({
        status: failed > 0 ? 'failed' : 'synced',
        pendingCount,
        syncedCount: synced,
        failedCount: failed,
        lastSyncAt: new Date(),
      });

      return { success: failed === 0, synced, failed, errors };
    } finally {
      this.isSyncing = false;
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
