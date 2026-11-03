import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { settingsStorage } from '@/repositories/settings';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'mia.api.token';
const REFRESH_TOKEN_KEY = 'mia.api.refresh_token';
const useSecureStore = Platform.OS !== 'web';

export const isApiConfigured = Boolean(API_URL);

async function readToken(key: string): Promise<string | null> {
  try {
    if (!useSecureStore) return await settingsStorage.getItem(key);
    const secure = await SecureStore.getItemAsync(key);
    if (secure) return secure;
    const legacy = await settingsStorage.getItem(key);
    if (legacy) {
      await SecureStore.setItemAsync(key, legacy);
      await settingsStorage.removeItem(key);
    }
    return legacy;
  } catch {
    return null;
  }
}

async function writeToken(key: string, token: string | null): Promise<void> {
  if (!useSecureStore) {
    if (token) await settingsStorage.setItem(key, token);
    else await settingsStorage.removeItem(key);
    return;
  }
  if (token) await SecureStore.setItemAsync(key, token);
  else await SecureStore.deleteItemAsync(key);
  await settingsStorage.removeItem(key);
}

export async function getAccessToken(): Promise<string | null> {
  return readToken(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return readToken(REFRESH_TOKEN_KEY);
}

export async function setAccessToken(token: string | null): Promise<void> {
  await writeToken(ACCESS_TOKEN_KEY, token);
}

export async function setRefreshToken(token: string | null): Promise<void> {
  await writeToken(REFRESH_TOKEN_KEY, token);
}

export async function setAuthTokens(input: {
  token?: string | null;
  refresh_token?: string | null;
}): Promise<void> {
  if (input.token !== undefined) await setAccessToken(input.token);
  if (input.refresh_token !== undefined) await setRefreshToken(input.refresh_token);
}

export async function clearAuthTokens(): Promise<void> {
  await Promise.all([
    writeToken(ACCESS_TOKEN_KEY, null),
    writeToken(REFRESH_TOKEN_KEY, null),
  ]);
}

export function getApiBaseUrl(): string {
  return API_URL;
}

export class ApiError extends Error {
  status: number;
  code: string | null;
  body: Record<string, unknown> | null;

  constructor(message: string, status: number, body: Record<string, unknown> | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.code = body?.code != null ? String(body.code) : null;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Call /auth/refresh with stored refresh_token. Returns true if new tokens were saved. */
async function refreshAccessTokenOnce(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = (await getRefreshToken()) || (await getAccessToken());
    if (!refreshToken || !API_URL) return false;

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as {
        token?: string;
        refresh_token?: string;
      };
      if (!data.token) return false;
      await setAuthTokens({
        token: data.token,
        refresh_token: data.refresh_token ?? data.token,
      });
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { auth?: boolean; _retried?: boolean } = {}
): Promise<T> {
  if (!API_URL) {
    throw new Error('Cloud API is not configured (set EXPO_PUBLIC_API_URL)');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const useAuth = options.auth !== false;
  if (useAuth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  // Expired access token → refresh via API, then retry once
  if (
    response.status === 401 &&
    useAuth &&
    !options._retried &&
    path !== '/auth/refresh' &&
    path !== '/auth/login'
  ) {
    const refreshed = await refreshAccessTokenOnce();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, _retried: true });
    }
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const errBody =
      body && typeof body === 'object' && body !== null
        ? (body as Record<string, unknown> & { error?: unknown; conflict_session_id?: unknown })
        : null;
    const message = errBody?.error != null ? String(errBody.error) : `HTTP ${response.status}`;
    const conflictId =
      errBody?.conflict_session_id != null ? String(errBody.conflict_session_id) : '';
    // Embed conflict_session_id so sync UI can adopt the server open session.
    throw new ApiError(
      conflictId ? `${message} (conflict_session:${conflictId})` : message,
      response.status,
      errBody
    );
  }

  return body as T;
}
