import { settingsStorage } from '@/repositories/settings';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, Business } from '@/types';
import { userRepository } from '@/repositories/users/users';
import { businessRepository } from '@/repositories/business/business';
import { showToast } from './toastStore';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

interface AuthState {
  user: User | null;
  business: Business | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  error: string | null;

  setUser: (user: User | null) => void;
  setBusiness: (business: Business | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasHydrated: () => void;
  
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  createBusiness: (data: CreateBusinessData) => Promise<void>;
  logout: () => void;
  loadSession: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

interface CreateBusinessData {
  name: string;
  currency?: string;
  country?: string;
  timezone?: string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      business: null,
      isAuthenticated: false,
      isLoading: true,
      hasHydrated: false,
      error: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setBusiness: (business) => set({ business }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setHasHydrated: () => set({ hasHydrated: true }),

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          // In a real app, this would call Supabase Auth
          // For now, we'll simulate with local database
          const db = await (await import('@/db/database')).getDatabase();
          const row = await db.getFirstAsync<{ id: string; business_id: string }>(
            `SELECT id, business_id FROM users WHERE email = ?`,
            [email]
          );
          
          if (!row) throw new Error('Invalid credentials');
          
          const user = await userRepository.findById(row.id, row.business_id);
          if (!user) throw new Error('User not found');
          
          const business = await businessRepository.findById(user.business_id);
          
          set({ user, business, isAuthenticated: true, isLoading: false });
          showToast('Logged in successfully', 'success');
        } catch (error) {
          const message = String(error);
          set({ error: message, isLoading: false });
          showToast(message, 'error');
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });
        try {
          // Create user in local DB (in real app, this would be Supabase Auth)
          const userId = generateUUID();
          const now = new Date().toISOString();
          
          // This would normally create a business first, then user
          // For MVP, we'll handle this in createBusiness flow
          set({ isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      createBusiness: async (data: CreateBusinessData) => {
        set({ isLoading: true, error: null });
        try {
          const businessCode = await businessRepository.generateBusinessCode();
          const businessId = generateUUID();
          const now = new Date().toISOString();
          
          const business: Business = {
            id: businessId,
            name: data.name,
            business_code: businessCode,
            currency: data.currency ?? 'RWF',
            country: data.country ?? 'Rwanda',
            timezone: data.timezone ?? 'Africa/Kigali',
            created_at: now,
            updated_at: now,
          };
          
          await businessRepository.create(business);
          
          // Create owner user
          const userId = generateUUID();
          const user: User = {
            id: userId,
            business_id: businessId,
            name: data.name,
            email: data.name.toLowerCase().replace(/\s+/g, '') + '@mia.local',
            phone: null,
            role: 'OWNER',
            active: true,
            created_at: now,
            updated_at: now,
          };
          
          await userRepository.create(user);
          
          set({ business, user, isAuthenticated: true, isLoading: false });
          showToast('Business created successfully', 'success');
        } catch (error) {
          const message = String(error);
          set({ error: message, isLoading: false });
          showToast(message, 'error');
          throw error;
        }
      },

      logout: () => {
        set({ user: null, business: null, isAuthenticated: false });
      },

      loadSession: async () => {
        set({ isLoading: true });
        try {
          // Seed demo data on first run
          const { seedDemoData } = await import('@/db/seed/demo');
          await seedDemoData();

          // In real app, this would restore from Supabase session
          // For now, check if we have persisted auth
          const state = get();
          if (state.user && state.business) {
            set({ isAuthenticated: true, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        } catch {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'mia-auth',
      storage: createJSONStorage(() => settingsStorage),
      partialize: (state) => ({
        user: state.user,
        business: state.business,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

useAuthStore.persist.onFinishHydration(() => {
  useAuthStore.getState().setHasHydrated();
});