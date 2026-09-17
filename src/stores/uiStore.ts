import { settingsStorage } from '@/repositories/settings';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import i18n from '@/i18n';

interface UIState {
  language: 'en' | 'rw';
  theme: 'light' | 'dark';
  isSidebarOpen: boolean;
  activeTab: string;

  setLanguage: (language: 'en' | 'rw') => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      language: 'en',
      theme: 'light',
      isSidebarOpen: false,
      activeTab: 'home',

      setLanguage: (language) => {
        void i18n.changeLanguage(language);
        set({ language });
      },
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
      setActiveTab: (activeTab) => set({ activeTab }),
    }),
    {
      name: 'mia-ui',
      storage: createJSONStorage(() => settingsStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.language) {
          void i18n.changeLanguage(state.language);
        }
      },
    }
  )
);
