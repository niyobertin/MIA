import { settingsStorage } from '@/repositories/settings';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, Business, UserRole } from '@/types';
import { userRepository } from '@/repositories/users/users';
import { businessRepository } from '@/repositories/business/business';
import { verifyPassword } from '@/utils/password';
import { generateUUID } from '@/utils/uuid';
import { showToast } from './toastStore';

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
  joinBusiness: (businessCode: string, role?: UserRole) => Promise<void>;
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
        set({ error: null });
        try {
          // Make sure demo accounts exist before attempting login
          const { ensureDemoUsers } = await import('@/db/seed/demo');
          await ensureDemoUsers();

          const credential = await userRepository.findCredentialByEmail(email);
          if (!credential || !credential.user.active) {
            set({ error: 'Invalid email or password' });
            showToast('Invalid email or password', 'error');
            return;
          }

          const valid = await verifyPassword(password, credential.password_hash);
          if (!valid) {
            set({ error: 'Invalid email or password' });
            showToast('Invalid email or password', 'error');
            return;
          }

          const user = credential.user;
          const business = user.business_id
            ? await businessRepository.findById(user.business_id)
            : null;

          if (user.business_id && !business) {
            set({ error: 'Business not found for this account' });
            showToast('Business not found for this account', 'error');
            return;
          }

          set({ user, business, isAuthenticated: true, error: null });
          showToast('Logged in successfully', 'success');
        } catch {
          set({ error: 'Could not sign in. Please try again.' });
          showToast('Could not sign in. Please try again.', 'error');
        }
      },

      register: async (data: RegisterData) => {
        set({ error: null });
        try {
          const user = await userRepository.createAccount({
            name: data.name,
            email: data.email,
            password: data.password,
            phone: data.phone,
          });

          set({
            user,
            business: null,
            isAuthenticated: true,
            error: null,
          });
          showToast('Account created successfully', 'success');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not create account';
          set({ error: message });
          showToast(message, 'error');
        }
      },

      createBusiness: async (data: CreateBusinessData) => {
        set({ error: null });
        try {
          const currentUser = get().user;
          if (!currentUser) {
            set({ error: 'You must create an account before registering a business' });
            showToast('You must create an account before registering a business', 'error');
            return;
          }
          if (currentUser.business_id) {
            set({ error: 'You already belong to a business' });
            showToast('You already belong to a business', 'error');
            return;
          }

          const businessCode = await businessRepository.generateBusinessCode();
          const businessId = generateUUID();
          const now = new Date().toISOString();

          const business: Business = {
            id: businessId,
            name: data.name.trim(),
            business_code: businessCode,
            currency: data.currency ?? 'RWF',
            country: data.country ?? 'Rwanda',
            timezone: data.timezone ?? 'Africa/Kigali',
            created_at: now,
            updated_at: now,
          };

          await businessRepository.create(business);
          const user = await userRepository.attachToBusiness(
            currentUser.id,
            businessId,
            'OWNER'
          );

          set({ business, user, isAuthenticated: true, error: null });
          showToast('Business created successfully', 'success');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not create business';
          set({ error: message });
          showToast(message, 'error');
        }
      },

      joinBusiness: async (businessCode: string, role: UserRole = 'STAFF') => {
        set({ error: null });
        try {
          const currentUser = get().user;
          if (!currentUser) {
            set({ error: 'You must sign in before joining a business' });
            showToast('You must sign in before joining a business', 'error');
            return;
          }
          if (currentUser.business_id) {
            set({ error: 'You already belong to a business' });
            showToast('You already belong to a business', 'error');
            return;
          }

          const business = await businessRepository.findByCode(businessCode.trim().toUpperCase());
          if (!business) {
            set({ error: 'Business not found. Check the business code and try again.' });
            showToast('Business not found. Check the business code and try again.', 'error');
            return;
          }

          const user = await userRepository.attachToBusiness(
            currentUser.id,
            business.id,
            role === 'OWNER' ? 'STAFF' : role
          );

          set({ business, user, isAuthenticated: true, error: null });
          showToast('Joined business successfully', 'success');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not join business';
          set({ error: message });
          showToast(message, 'error');
        }
      },

      logout: () => {
        set({ user: null, business: null, isAuthenticated: false });
      },

      loadSession: async () => {
        set({ isLoading: true });
        try {
          const { seedDemoData } = await import('@/db/seed/demo');
          await seedDemoData();

          const state = get();
          if (state.user) {
            const freshUser = await userRepository.findById(state.user.id);
            if (!freshUser || !freshUser.active) {
              set({
                user: null,
                business: null,
                isAuthenticated: false,
                isLoading: false,
              });
              return;
            }

            const business = freshUser.business_id
              ? await businessRepository.findById(freshUser.business_id)
              : null;

            set({
              user: freshUser,
              business,
              isAuthenticated: true,
              isLoading: false,
            });
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
