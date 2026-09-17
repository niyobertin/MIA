import { create } from 'zustand';
import { SyncEngineStatus } from '@/services/sync/syncEngine';

interface SyncState {
  status: SyncEngineStatus;
  lastSyncAt: Date | null;
  pendingCount: number;
  
  setStatus: (status: SyncEngineStatus) => void;
  setLastSyncAt: (date: Date | null) => void;
  setPendingCount: (count: number) => void;
  incrementPending: () => void;
  decrementPending: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: { status: 'idle', pendingCount: 0 },
  lastSyncAt: null,
  pendingCount: 0,

  setStatus: (status) => set({ status }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  incrementPending: () => set((state) => ({ pendingCount: state.pendingCount + 1 })),
  decrementPending: () => set((state) => ({ pendingCount: Math.max(0, state.pendingCount - 1) })),
}));