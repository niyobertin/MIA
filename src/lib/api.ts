import { settingsStorage } from '@/repositories/settings';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'mia.api.token';
const REFRESH_TOKEN_KEY = 'mia.api.refresh_token';

export const isApiConfigured = Boolean(API_URL);

export async function getAccessToken(): Promise<string | null> {
  try {
    return await settingsStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await settingsStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (!token) {
    await settingsStorage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }
  await settingsStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (!token) {
    await settingsStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  await settingsStorage.setItem(REFRESH_TOKEN_KEY, token);
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
    settingsStorage.removeItem(ACCESS_TOKEN_KEY),
    settingsStorage.removeItem(REFRESH_TOKEN_KEY),
  ]);
}

export function getApiBaseUrl(): string {
  return API_URL;
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
    const message =
      body && typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}
