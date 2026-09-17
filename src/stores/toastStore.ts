import { create } from 'zustand';

type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface ToastState {
  message: string | null;
  tone: ToastTone;
  counter: number;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  tone: 'info',
  counter: 0,
  show: (message, tone = 'info') =>
    set((s) => ({ message, tone, counter: s.counter + 1 })),
  hide: () => set({ message: null }),
}));

export function showToast(message: string, tone: ToastTone = 'info') {
  useToastStore.getState().show(message, tone);
}
