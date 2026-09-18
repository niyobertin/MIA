import { getDatabase } from '@/db/database';
import { apiFetch, isApiConfigured } from '@/lib/api';
import { hashPassword } from '@/utils/password';
import { Business, User, UserRole } from '@/types';

function asRole(value: unknown): UserRole | null {
  if (value === 'OWNER' || value === 'MANAGER' || value === 'CASHIER' || value === 'STAFF') {
    return value;
  }
  return null;
}

type PullResponse = {
  user?: {
    id: string;
    business_id: string | null;
    name: string;
    email: string;
    phone: string | null;
    role: string | null;
    active: boolean;
    created_at: string;
    updated_at: string;
  } | null;
  business: Business | null;
  tables?: Record<string, Record<string, unknown>[] | null> | null;
};

function normalizeCell(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return String(v);
  return v as string | number;
}

/** Apply a /sync/pull payload into local SQLite (does not overwrite local password hashes). */
export async function applyCloudPull(pull: PullResponse | null | undefined): Promise<{
  user: User | null;
  business: Business | null;
}> {
  if (!pull || typeof pull !== 'object') {
    return { user: null, business: null };
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  const remoteUser = pull.user ?? null;

  let business: Business | null = null;
  if (pull.business?.id) {
    const remoteBusiness = pull.business;
    await db.runAsync(
      `INSERT INTO businesses
        (id, name, business_code, currency, country, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         business_code = excluded.business_code,
         currency = excluded.currency,
         country = excluded.country,
         timezone = excluded.timezone,
         updated_at = excluded.updated_at`,
      [
        remoteBusiness.id,
        remoteBusiness.name,
        remoteBusiness.business_code,
        remoteBusiness.currency ?? 'RWF',
        remoteBusiness.country ?? 'Rwanda',
        remoteBusiness.timezone ?? 'Africa/Kigali',
        String(remoteBusiness.created_at ?? now),
        String(remoteBusiness.updated_at ?? now),
      ]
    );
    business = remoteBusiness;
  }

  for (const [table, rows] of Object.entries(pull.tables ?? {})) {
    if (!Array.isArray(rows)) continue;
    for (const record of rows) {
      if (!record || typeof record !== 'object') continue;
      const keys = Object.keys(record);
      if (!keys.length || record.id == null) continue;
      try {
        if (table === 'users') {
          const safeKeys = keys.filter((k) => k !== 'password_hash');
          safeKeys.push('password_hash');
          const safeValues = safeKeys.map((k) => {
            if (k === 'password_hash') return 'legacy:unmigrated';
            return normalizeCell(record[k]);
          });
          const placeholders = safeKeys.map(() => '?').join(', ');
          const updates = safeKeys
            .filter((k) => k !== 'id' && k !== 'password_hash')
            .map((k) => `${k} = excluded.${k}`)
            .join(', ');
          await db.runAsync(
            `INSERT INTO users (${safeKeys.join(', ')})
             VALUES (${placeholders})
             ON CONFLICT(id) DO UPDATE SET ${updates}`,
            safeValues
          );
          continue;
        }

        const placeholders = keys.map(() => '?').join(', ');
        const updates = keys
          .filter((k) => k !== 'id')
          .map((k) => `${k} = excluded.${k}`)
          .join(', ');
        const values = keys.map((k) => normalizeCell(record[k]));
        await db.runAsync(
          `INSERT INTO ${table} (${keys.join(', ')})
           VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${updates}`,
          values
        );
      } catch {
        // skip incompatible rows
      }
    }
  }

  if (!remoteUser?.id) {
    return { user: null, business };
  }

  const user: User = {
    id: remoteUser.id,
    business_id: remoteUser.business_id ?? null,
    name: remoteUser.name ?? '',
    email: remoteUser.email ?? '',
    phone: remoteUser.phone ?? null,
    role: asRole(remoteUser.role),
    active: remoteUser.active !== false,
    created_at: String(remoteUser.created_at ?? now),
    updated_at: String(remoteUser.updated_at ?? now),
  };

  return { user, business };
}

/** Fetch cloud data and merge into local SQLite (for sync reconcile). */
export async function pullCloudData(): Promise<{ user: User | null; business: Business | null }> {
  if (!isApiConfigured) {
    throw new Error('Cloud is not configured');
  }
  const pull = await apiFetch<PullResponse>('/sync/pull');
  return applyCloudPull(pull);
}

/** Upsert cloud user/business into local SQLite and cache password for offline login. */
export async function hydrateLocalSession(input: {
  authUserId: string;
  email: string;
  name: string;
  phone?: string | null;
  password: string;
}): Promise<{ user: User; business: Business | null }> {
  if (!isApiConfigured) {
    throw new Error('Cloud is not configured');
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();

  const pull = await apiFetch<PullResponse>('/sync/pull');
  const applied = await applyCloudPull(pull);

  const remoteUser = pull?.user;
  const name = remoteUser?.name || input.name;
  const phone = remoteUser?.phone ?? (input.phone?.trim() || null);
  const role = asRole(remoteUser?.role);
  const businessId = remoteUser?.business_id ?? null;
  const active = remoteUser?.active === false ? 0 : 1;
  const createdAt = String(remoteUser?.created_at ?? now);
  const updatedAt = String(remoteUser?.updated_at ?? now);

  await db.runAsync(
    `INSERT INTO users
      (id, business_id, name, email, phone, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       business_id = excluded.business_id,
       name = excluded.name,
       email = excluded.email,
       phone = excluded.phone,
       password_hash = excluded.password_hash,
       role = excluded.role,
       active = excluded.active,
       updated_at = excluded.updated_at`,
    [
      input.authUserId,
      businessId,
      name,
      email,
      phone,
      passwordHash,
      role,
      active,
      createdAt,
      updatedAt,
    ]
  );

  await db.runAsync(`DELETE FROM users WHERE lower(email) = ? AND id != ? AND business_id IS NULL`, [
    email,
    input.authUserId,
  ]);

  return {
    user: {
      id: input.authUserId,
      business_id: businessId,
      name,
      email,
      phone,
      role,
      active: active === 1,
      created_at: createdAt,
      updated_at: updatedAt,
    },
    business: applied.business,
  };
}
