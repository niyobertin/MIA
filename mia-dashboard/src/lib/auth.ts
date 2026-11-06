import { useSyncExternalStore } from 'react';
import axios, { type AxiosRequestConfig } from 'axios';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  business_id: string | null;
};

export type SessionBusiness = {
  id: string;
  name: string;
  currency?: string | null;
};

export type Session = {
  token: string;
  refresh_token: string;
  user: SessionUser;
  business: SessionBusiness;
};

type AuthResponse = Omit<Session, 'business'> & {
  business: SessionBusiness | null;
  pin_setup_required?: boolean;
};

const STORAGE_KEY = 'mia.dashboard.session';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

function readStoredSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let currentSession = readStoredSession();
const listeners = new Set<() => void>();

function setSession(next: Session | null) {
  currentSession = next;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    console.warn('Session storage is unavailable; this sign-in lasts until the page reloads.');
  }
  notifyListeners();
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSession() {
  return useSyncExternalStore(subscribe, () => currentSession);
}

export function signOut() {
  setSession(null);
}

function getAccessProblem(data: AuthResponse): string | null {
  if (data.pin_setup_required) return 'Open the MIA app to set a new 4-digit PIN, then sign in here.';
  if (!data.business) return 'This account is not linked to a business yet.';
  return null;
}

function formatWait(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function getLoginErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Could not sign in. Please try again.';
  if (!error.response) return 'Could not reach the MIA server. Check your connection and try again.';
  const { status, data } = error.response;
  if (status === 423) {
    const wait = typeof data?.retry_after_seconds === 'number' ? formatWait(data.retry_after_seconds) : 'a while';
    return `Too many wrong PIN attempts. Try again in ${wait}.`;
  }
  if (status === 403 && typeof data?.error === 'string') return data.error;
  if (status === 429) return 'Too many sign-in attempts. Please wait a few minutes and try again.';
  if (status === 401 || status === 400) {
    const left = data?.attempts_left;
    if (typeof left === 'number' && left <= 2) {
      return `Wrong email or PIN. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before a temporary lock.`;
    }
    return 'Wrong email or PIN.';
  }
  return 'Could not sign in. Please try again.';
}

export async function signIn(email: string, pin: string) {
  let data: AuthResponse;
  try {
    const response = await axios.post<AuthResponse>(`${import.meta.env.VITE_API_URL}/auth/login`, {
      email: email.trim(),
      password: pin,
    });
    data = response.data;
  } catch (error) {
    throw new Error(getLoginErrorMessage(error));
  }
  const problem = getAccessProblem(data);
  if (problem) throw new Error(problem);
  setSession(toSession(data));
}

function getResetErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Something went wrong. Please try again.';
  if (!error.response) return 'Could not reach the MIA server. Check your connection and try again.';
  const { status, data } = error.response;
  if (status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  if (status === 400 && typeof data?.error === 'string') return data.error;
  return 'Something went wrong. Please try again.';
}

export async function requestPinReset(email: string) {
  try {
    await axios.post(`${import.meta.env.VITE_API_URL}/auth/forgot-pin`, { email: email.trim() });
  } catch (error) {
    throw new Error(getResetErrorMessage(error));
  }
}

export async function resetPin(email: string, code: string, pin: string) {
  try {
    await axios.post(`${import.meta.env.VITE_API_URL}/auth/reset-pin`, { email: email.trim(), code: code.trim(), pin });
  } catch (error) {
    throw new Error(getResetErrorMessage(error));
  }
}

function toSession(data: AuthResponse): Session {
  return {
    token: data.token,
    refresh_token: data.refresh_token,
    user: data.user,
    business: data.business as SessionBusiness,
  };
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshSession(refreshToken: string): Promise<string | null> {
  try {
    const { data } = await axios.post<AuthResponse>(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    if (getAccessProblem(data)) {
      signOut();
      return null;
    }
    setSession(toSession(data));
    return data.token;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) signOut();
    return null;
  }
}

api.interceptors.request.use((config) => {
  if (currentSession) config.headers.Authorization = `Bearer ${currentSession.token}`;
  return config;
});

api.interceptors.response.use(undefined, async (error) => {
  const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
  if (error.response?.status !== 401 || !original || original._retried || !currentSession) throw error;

  original._retried = true;
  refreshInFlight ??= refreshSession(currentSession.refresh_token).finally(() => {
    refreshInFlight = null;
  });
  const token = await refreshInFlight;
  if (!token) throw error;
  return api.request(original);
});
