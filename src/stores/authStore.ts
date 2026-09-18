import { settingsStorage } from '@/repositories/settings';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, Business, UserRole } from '@/types';
import { userRepository } from '@/repositories/users/users';
import { businessRepository } from '@/repositories/business/business';
import { verifyPassword } from '@/utils/password';
import { generateUUID } from '@/utils/uuid';
import { showToast } from './toastStore';
import { formatAuthError } from '@/utils/cloudErrors';

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

          if (business?.id) {
            try {
              const { getSyncEngine } = await import('@/services/sync/syncEngine');
              void getSyncEngine('local-device').syncAll();
            } catch {
              // Auto-sync will retry
            }
          }
        } catch (error) {
          const message = formatAuthError(error, 'Could not sign in. Please try again.');
          set({ error: message });
          showToast(message, 'error');
        }
      },

      register: async (data: RegisterData) => {
        set({ error: null });
        try {
          const name = data.name.trim();
          const email = data.email.trim().toLowerCase();
          if (name.length < 2) {
            const message = 'Enter your full name (at least 2 characters).';
            set({ error: message });
            showToast(message, 'error');
            return;
          }
          if (!email.includes('@')) {
            const message = 'Enter a valid email address.';
            set({ error: message });
            showToast(message, 'error');
            return;
          }
          if (!data.password || data.password.length < 6) {
            const message = 'Password must be at least 6 characters.';
            set({ error: message });
            showToast(message, 'error');
            return;
          }

          const user = await userRepository.createAccount({
            name,
            email,
            password: data.password,
            phone: data.phone,
          });

          set({
            user,
            business: null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          showToast('Account created. Next, register your business.', 'success');
        } catch (error) {
          const message = formatAuthError(error, 'Could not create your account. Please try again.');
          set({ error: message });
          showToast(message, 'error');
        }
      },

      createBusiness: async (data: CreateBusinessData) => {
        set({ error: null });
        try {
          const currentUser = get().user;
          if (!currentUser) {
            const message = 'Create an account first, then register your business.';
            set({ error: message });
            showToast(message, 'error');
            return;
          }
          if (currentUser.business_id) {
            const message = 'You already belong to a business.';
            set({ error: message });
            showToast(message, 'error');
            return;
          }

          const businessName = data.name.trim();
          if (businessName.length < 2) {
            const message = 'Enter a business name (at least 2 characters).';
            set({ error: message });
            showToast(message, 'error');
            return;
          }

          const businessCode = await businessRepository.generateBusinessCode();
          const businessId = generateUUID();
          const now = new Date().toISOString();

          const business: Business = {
            id: businessId,
            name: businessName,
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

          const { queueSync } = await import('@/services/sync/queue');
          await queueSync('businesses', business.id, 'insert', business as unknown as Record<string, unknown>, businessId);
          await queueSync('users', user.id, 'insert', user as unknown as Record<string, unknown>, businessId);

          set({ business, user, isAuthenticated: true, isLoading: false, error: null });
          showToast('Business registered. You can start selling offline.', 'success');

          // Cloud upload is best-effort; never fail local registration if sync errors
          setTimeout(() => {
            void (async () => {
              try {
                const { getSyncEngine } = await import('@/services/sync/syncEngine');
                await getSyncEngine('local-device').syncAll();
              } catch {
                // Local data is already saved
              }
            })();
          }, 500);
        } catch (error) {
          const message = formatAuthError(error, 'Could not register your business. Please try again.');
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

          const { queueSync } = await import('@/services/sync/queue');
          await queueSync('users', user.id, 'insert', user as unknown as Record<string, unknown>, business.id);

          set({ business, user, isAuthenticated: true, error: null });
          showToast('Joined business successfully', 'success');

          try {
            const { getSyncEngine } = await import('@/services/sync/syncEngine');
            void getSyncEngine('local-device').syncAll();
          } catch {
            // Auto-sync will retry
          }
        } catch (error) {
          const message = formatAuthError(error, 'Could not join that business. Check the code and try again.');
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
          const { seedDemoData, DEMO_USERS, DEMO_BUSINESS } = await import('@/db/seed/demo');
          await seedDemoData();

          const state = get();
          if (state.user) {
            let freshUser = await userRepository.findById(state.user.id);

            // Persisted session may still hold legacy non-UUID demo ids
            if (!freshUser && state.user.email) {
              freshUser = await userRepository.findByEmail(state.user.email);
            }
            if (
              !freshUser &&
              DEMO_USERS.some((u) => u.email === state.user?.email?.toLowerCase())
            ) {
              freshUser = await userRepository.findByEmail(state.user.email);
            }

            if (!freshUser || !freshUser.active) {
              set({
                user: null,
                business: null,
                isAuthenticated: false,
                isLoading: false,
              });
              return;
            }

            let business = freshUser.business_id
              ? await businessRepository.findById(freshUser.business_id)
              : null;

            if (!business && freshUser.email && DEMO_USERS.some((u) => u.email === freshUser!.email)) {
              business = await businessRepository.findById(DEMO_BUSINESS.id);
              if (business && freshUser.business_id !== business.id) {
                freshUser = await userRepository.attachToBusiness(
                  freshUser.id,
                  business.id,
                  freshUser.role ?? 'OWNER'
                );
              }
            }

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
