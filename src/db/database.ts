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
    await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
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
