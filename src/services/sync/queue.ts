import { getSyncEngine } from './syncEngine';
import { useSyncStore } from '@/stores/syncStore';
import { useAuthStore } from '@/stores/authStore';

const BOOLEAN_KEYS = new Set([
  'active',
  'track_inventory',
  'is_open',
]);

function getDeviceId() {
  return 'local-device';
}

export function sanitizeForCloud(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (BOOLEAN_KEYS.has(key) && (value === 0 || value === 1)) {
      out[key] = value === 1;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function queueSync(
  tableName: string,
  recordId: string,
  operation: 'insert' | 'update' | 'delete',
  payload: Record<string, unknown>,
  businessId?: string
): Promise<void> {
  const bid = businessId ?? useAuthStore.getState().business?.id;
  if (!bid) return;

  try {
    const engine = getSyncEngine(getDeviceId());
    await engine.queueForSync(
      tableName,
      recordId,
      bid,
      operation,
      sanitizeForCloud(payload)
    );
    useSyncStore.getState().incrementPending();
  } catch {
    // Local write already succeeded; cloud queue failure must not block the user.
  }
}

export async function refreshPendingCount(businessId?: string): Promise<number> {
  const bid = businessId ?? useAuthStore.getState().business?.id;
  if (!bid) {
    useSyncStore.getState().setPendingCount(0);
    return 0;
  }
  const { syncRepository } = await import('@/repositories/sync');
  const count = await syncRepository.getPendingCount(bid);
  useSyncStore.getState().setPendingCount(count);
  return count;
}
