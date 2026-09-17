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
  }
}

async function runMigrations(database: SQLite.SQLiteDatabase, fromVersion: number): Promise<void> {
  await database.withTransactionAsync(async () => {
    if (fromVersion === 0) {
      await database.execAsync(CREATE_TABLES_SQL);
    }
    if (fromVersion < 2) {
      await database.execAsync(CREATE_APP_SETTINGS_SQL);
    }
    if (fromVersion > 0 && fromVersion < 3) {
      await migrateToV3(database);
    }
    await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

async function migrateToV3(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS users_v3 (
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

  const existingUsers = await database.getAllAsync<{
    id: string;
    business_id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    active: number;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM users');

  const { hashPassword } = await import('@/utils/password');
  // Inline demo passwords here to avoid circular imports with seed/demo
  const demoPasswords: Record<string, string> = {
    'owner@mia.rw': 'Owner123!',
    'manager@mia.rw': 'Manager123!',
    'cashier@mia.rw': 'Cashier123!',
    'demo@mia.app': 'Owner123!',
  };

  for (const user of existingUsers) {
    const email = user.email.toLowerCase();
    const plain = demoPasswords[email];
    const passwordHash = plain ? await hashPassword(plain) : 'legacy:unmigrated';

    await database.runAsync(
      `INSERT OR IGNORE INTO users_v3
        (id, business_id, name, email, phone, password_hash, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.business_id,
        user.name,
        user.email,
        user.phone,
        passwordHash,
        user.role,
        user.active,
        user.created_at,
        user.updated_at,
      ]
    );
  }

  await database.execAsync(`
    DROP TABLE users;
    ALTER TABLE users_v3 RENAME TO users;
    CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
}

export async function resetDatabase(): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.execAsync(DROP_TABLES_SQL);
    await database.execAsync(CREATE_TABLES_SQL);
    await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
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
