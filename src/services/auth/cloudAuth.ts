import NetInfo from '@react-native-community/netinfo';
import {
  apiFetch,
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  isApiConfigured,
  setAuthTokens,
} from '@/lib/api';

export async function isOnline(): Promise<boolean> {
  const net = await NetInfo.fetch();
  return Boolean(net.isConnected && net.isInternetReachable !== false);
}

export type CloudAuthUser = {
  id: string;
  email: string;
  name: string;
};

type AuthResponse = {
  token: string;
  refresh_token?: string;
  user: {
    id: string;
    email: string;
    name: string;
    phone?: string | null;
    business_id?: string | null;
    role?: string | null;
    active?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  business?: Record<string, unknown> | null;
};

async function persistTokens(data: AuthResponse): Promise<void> {
  await setAuthTokens({
    token: data.token,
    refresh_token: data.refresh_token ?? data.token,
  });
}

export async function cloudSignUp(input: {
  email: string;
  password: string;
  name: string;
  phone?: string | null;
}): Promise<CloudAuthUser> {
  if (!isApiConfigured) {
    throw new Error('Cloud login is not configured on this build.');
  }
  if (!(await isOnline())) {
    throw new Error('Internet is required to create an online account.');
  }

  const data = await apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
      phone: input.phone?.trim() || null,
    }),
  });

  await persistTokens(data);
  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name,
  };
}

/** Always hits the API. Throws OFFLINE when there is no network. */
export async function cloudSignIn(email: string, password: string): Promise<CloudAuthUser> {
  if (!isApiConfigured) {
    throw new Error('Cloud login is not configured on this build.');
  }
  if (!(await isOnline())) {
    throw new Error('OFFLINE');
  }

  const data = await apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  await persistTokens(data);
  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name,
  };
}

export async function cloudSignOut(): Promise<void> {
  await clearAuthTokens();
}

export async function getCloudSessionUser(): Promise<CloudAuthUser | null> {
  if (!isApiConfigured) return null;
  try {
    const data = await apiFetch<{ user: { id: string; email: string; name: string } }>('/auth/me');
    if (!data.user?.id) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
    };
  } catch {
    return null;
  }
}

export async function hasValidCloudSession(): Promise<boolean> {
  if (!isApiConfigured) return false;
  const token = await getAccessToken();
  if (!token) return false;
  try {
    await apiFetch('/auth/me');
    return true;
  } catch {
    return false;
  }
}

/** Refresh access token from the API using the stored refresh_token. */
export async function cloudRefreshSession(): Promise<AuthResponse | null> {
  if (!isApiConfigured) return null;
  if (!(await isOnline())) {
    throw new Error('OFFLINE');
  }

  const refreshToken = (await getRefreshToken()) || (await getAccessToken());
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const data = await apiFetch<AuthResponse>('/auth/refresh', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  await persistTokens(data);
  return data;
}

/**
 * Ensure sync has a working cloud JWT.
 * 1) Try access token (/auth/me)
 * 2) Always refresh via API when online (refresh_token → new access)
 * 3) Else password login when provided
 */
export async function ensureCloudSession(options?: {
  email?: string | null;
  password?: string | null;
}): Promise<void> {
  if (!isApiConfigured) {
    throw new Error('Cloud sync is not configured (set EXPO_PUBLIC_API_URL)');
  }
  if (!(await isOnline())) {
    throw new Error(
      'No internet right now. Your data is saved on this phone and will sync when you are online.'
    );
  }

  // Prefer refreshing from the API so business_id / role stay current
  try {
    await cloudRefreshSession();
    if (await hasValidCloudSession()) return;
  } catch {
    // No refresh token yet, or refresh expired
  }

  if (await hasValidCloudSession()) return;

  const email = options?.email?.trim().toLowerCase();
  const password = options?.password;
  if (email && password) {
    await cloudSignIn(email, password);
    return;
  }

  throw new Error(
    'Not signed in to the cloud. Sign out, then sign in again while online to sync.'
  );
}

export async function cloudJoinBusiness(
  code: string,
  role: 'MANAGER' | 'CASHIER' | 'STAFF' = 'STAFF'
) {
  if (!isApiConfigured) {
    throw new Error('Cloud login is not configured on this build.');
  }
  if (!(await isOnline())) {
    throw new Error('Internet is required to join a business.');
  }

  const data = await apiFetch<AuthResponse>('/auth/join-business', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim().toUpperCase(), role }),
  });
  await persistTokens(data);
  return data;
}
