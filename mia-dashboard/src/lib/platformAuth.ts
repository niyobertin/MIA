import { useSyncExternalStore } from 'react';
import axios from 'axios';

export type PlatformAdmin = {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'SUPPORT' | 'FINANCE';
  active: boolean;
  totp_enabled: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  permissions: string[];
};

const STORAGE_KEY = 'mia.platform.token';

function readToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let token = readToken();
const listeners = new Set<() => void>();

export function setPlatformToken(next: string | null) {
  token = next;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, next);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    console.warn('Session storage is unavailable; this sign-in lasts until the page reloads.');
  }
  listeners.forEach((listener) => listener());
}

export function usePlatformToken() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => token,
  );
}

export function signOutPlatform() {
  setPlatformToken(null);
}

export const platformApi = axios.create({ baseURL: `${import.meta.env.VITE_API_URL}/platform` });

platformApi.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformApi.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 && token && !error.config?.url?.includes('/auth/')) signOutPlatform();
  if (error.response?.status === 401 && token && error.config?.url === '/auth/me') signOutPlatform();
  throw error;
});

export type LoginStep =
  | { step: 'done'; token: string; admin: PlatformAdmin }
  | { step: 'verify' | 'enroll'; challenge: string };
