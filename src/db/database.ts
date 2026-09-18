import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL, CREATE_APP_SETTINGS_SQL, DROP_TABLES_SQL, DATABASE_VERSION } from './schema';

let db: SQLite.SQLiteDatabase | null = null;
let initialization: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  if (!initialization) {
    initialization = openDatabase().catch((error) => {
      initialization = null;
      throw error;
    });
  }

  return initialization;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync('mia.db');
  try {
    await initializeDatabase(database);
    db = database;
    return database;
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}

async function initializeDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  await database.execAsync('PRAGMA journal_mode = WAL;');

  const versionResult = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;'
  );

  const currentVersion = versionResult?.user_version ?? 0;

  if (currentVersion < DATABASE_VERSION) {
    await runMigrations(database, currentVersion);
  } else {
    await ensureUsersIdentitySchema(database);
    await normalizeBusinessDateColumns(database);
    await migrateDailyClosingStockColumns(database);
  }
}

/**
 * Do not wrap DDL in withTransactionAsync.
 * expo-sqlite auto-commits many schema statements; a later ROLLBACK then fails with
 * "cannot rollback - no transaction is active".
 */
async function runMigrations(database: SQLite.SQLiteDatabase, fromVersion: number): Promise<void> {
  try {
    if (fromVersion === 0) {
      await database.execAsync(CREATE_TABLES_SQL);
    }
    if (fromVersion < 2) {
      await database.execAsync(CREATE_APP_SETTINGS_SQL);
    }
    if (fromVersion > 0 && fromVersion < 3) {
      await migrateToV3(database);
    }
    if (fromVersion < 4) {
      await ensureUsersIdentitySchema(database);
    }
    if (fromVersion < 5) {
      await normalizeBusinessDateColumns(database);
    }
    if (fromVersion > 0 && fromVersion < 6) {
      await migrateDailyClosingStockColumns(database);
    }
    await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('cannot rollback') ||
      message.includes('no transaction is active')
    ) {
      // Migrations may have already applied; force version bump and continue.
      await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
      return;
    }
    throw error;
  }
}

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

async function ensureUsersIdentitySchema(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<ColumnInfo>('PRAGMA table_info(users)');
  if (columns.length === 0) return;

  const byName = new Map(columns.map((c) => [c.name, c]));
  const businessCol = byName.get('business_id');
  const roleCol = byName.get('role');
  const hasPasswordHash = byName.has('password_hash');

  const needsRebuild =
    !hasPasswordHash ||
    (businessCol?.notnull ?? 0) === 1 ||
    (roleCol?.notnull ?? 0) === 1;

  if (!needsRebuild) return;

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS users_identity (
      id TEXT PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT CHECK (role IS NULL OR role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const existingUsers = await database.getAllAsync<Record<string, unknown>>('SELECT * FROM users');
  const { hashPassword } = await import('@/utils/password');
  const demoPasswords: Record<string, string> = {
    'owner@mia.rw': 'Owner123!',
    'manager@mia.rw': 'Manager123!',
    'cashier@mia.rw': 'Cashier123!',
    'demo@mia.app': 'Owner123!',
  };

  for (const user of existingUsers) {
    const email = String(user.email ?? '').toLowerCase();
    const existingHash =
      typeof user.password_hash === 'string' && user.password_hash.length > 0
        ? user.password_hash
        : null;
    const plain = demoPasswords[email];
    const passwordHash = existingHash ?? (plain ? await hashPassword(plain) : 'legacy:unmigrated');
    const role =
      user.role == null || user.role === ''
        ? null
        : String(user.role);

    await database.runAsync(
      `INSERT OR IGNORE INTO users_identity
        (id, business_id, name, email, phone, password_hash, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(user.id),
        user.business_id == null || user.business_id === '' ? null : String(user.business_id),
        String(user.name ?? ''),
        email,
        user.phone == null || user.phone === '' ? null : String(user.phone),
        passwordHash,
        role,
        user.active === 0 || user.active === false || user.active === '0' ? 0 : 1,
        String(user.created_at ?? new Date().toISOString()),
        String(user.updated_at ?? new Date().toISOString()),
      ]
    );
  }

  await database.execAsync('PRAGMA foreign_keys = OFF;');
  await database.execAsync(`
    DROP TABLE users;
    ALTER TABLE users_identity RENAME TO users;
    CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
  await database.execAsync('PRAGMA foreign_keys = ON;');
}

export async function ensureUsersIdentitySchemaForApp(): Promise<void> {
  const database = await getDatabase();
  await ensureUsersIdentitySchema(database);
}

async function migrateToV3(database: SQLite.SQLiteDatabase): Promise<void> {
  await ensureUsersIdentitySchema(database);
}

async function migrateDailyClosingStockColumns(database: SQLite.SQLiteDatabase): Promise<void> {
  const exists = await database.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'daily_closings'`
  );
  if (!exists) return;

  const columns = await database.getAllAsync<ColumnInfo>('PRAGMA table_info(daily_closings)');
  const names = new Set(columns.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ['opening_stock_qty', 'INTEGER NOT NULL DEFAULT 0'],
    ['opening_stock_value', 'INTEGER NOT NULL DEFAULT 0'],
    ['closing_stock_qty', 'INTEGER NOT NULL DEFAULT 0'],
    ['closing_stock_value', 'INTEGER NOT NULL DEFAULT 0'],
  ];

  for (const [name, ddl] of additions) {
    if (names.has(name)) continue;
    await database.execAsync(`ALTER TABLE daily_closings ADD COLUMN ${name} ${ddl}`);
  }
}

/** Cloud pull can store ISO timestamps in date columns; keep YYYY-MM-DD for day filters. */
async function normalizeBusinessDateColumns(database: SQLite.SQLiteDatabase): Promise<void> {
  const updates: Array<{ table: string; column: string }> = [
    { table: 'sales', column: 'sale_date' },
    { table: 'purchases', column: 'purchase_date' },
    { table: 'expenses', column: 'expense_date' },
    { table: 'payments', column: 'payment_date' },
    { table: 'daily_closings', column: 'business_date' },
  ];

  for (const { table, column } of updates) {
    try {
      const exists = await database.getFirstAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        [table]
      );
      if (!exists) continue;
      await database.runAsync(
        `UPDATE ${table}
         SET ${column} = substr(${column}, 1, 10)
         WHERE ${column} IS NOT NULL AND length(${column}) > 10`
      );
    } catch {
      // ignore missing columns on partial schemas
    }
  }
}

export async function resetDatabase(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(DROP_TABLES_SQL);
  await database.execAsync(CREATE_TABLES_SQL);
  await database.execAsync(CREATE_APP_SETTINGS_SQL);
  await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  db = null;
  initialization = null;
}

export async function closeDatabase(): Promise<void> {
  if (initialization) {
    await initialization;
  }
  if (db) {
    await db.closeAsync();
    db = null;
  }
  initialization = null;
}

export function getDb(): SQLite.SQLiteDatabase | null {
  return db;
}
