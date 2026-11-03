import { DatabaseSync } from 'node:sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { closeDatabase, getDatabase, getDb } from '@/db/database';
import { CREATE_APP_SETTINGS_SQL, CREATE_TABLES_SQL, DATABASE_VERSION } from '@/db/schema';
import { BaseEntity, BaseRepository } from '@/repositories/base';
import { settingsStorage } from '@/repositories/settings';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const database = {
    execAsync: jest.fn(async (sql: string) => { sqlite.exec(sql); }),
    getFirstAsync: jest.fn(async (sql: string, params: string[] = []) => sqlite.prepare(sql).get(...params)),
    getAllAsync: jest.fn(async (sql: string, params: string[] = []) => sqlite.prepare(sql).all(...params)),
    runAsync: jest.fn(async (sql: string, params: string[] = []) => sqlite.prepare(sql).run(...params)),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }),
    closeAsync: jest.fn(async () => { sqlite.close(); }),
  };
  return { sqlite, database };
}

const mockOpen = jest.mocked(openDatabaseAsync);
let fixture: ReturnType<typeof createDatabase>;

beforeEach(() => {
  mockOpen.mockReset();
  fixture = createDatabase();
  mockOpen.mockResolvedValue(fixture.database as unknown as Awaited<ReturnType<typeof openDatabaseAsync>>);
});

afterEach(async () => { await closeDatabase(); });

it('creates settings on a fresh installation and keeps auth and UI keys separate', async () => {
  await settingsStorage.setItem('mia-auth', '{"user":"owner"}');
  await settingsStorage.setItem('mia-ui', '{"language":"rw"}');
  expect(await settingsStorage.getItem('mia-auth')).toBe('{"user":"owner"}');
  expect(await settingsStorage.getItem('mia-ui')).toBe('{"language":"rw"}');
  await settingsStorage.removeItem('mia-auth');
  expect(await settingsStorage.getItem('mia-auth')).toBeNull();
  expect(await settingsStorage.getItem('mia-ui')).toBe('{"language":"rw"}');
});

it('upgrades version 1 without deleting existing business data', async () => {
  fixture.sqlite.exec(CREATE_TABLES_SQL.replace(CREATE_APP_SETTINGS_SQL, ''));
  fixture.sqlite.exec("INSERT INTO businesses (id, name, business_code) VALUES ('a', 'Shop A', 'MIA-A'); PRAGMA user_version = 1;");
  await getDatabase();
  await settingsStorage.setItem('mia-ui', 'saved');
  expect(fixture.sqlite.prepare('SELECT name FROM businesses WHERE id = ?').get('a')?.name).toBe('Shop A');
  expect(fixture.sqlite.prepare('PRAGMA user_version').get()?.user_version).toBe(DATABASE_VERSION);
  expect(await settingsStorage.getItem('mia-ui')).toBe('saved');
});

it('makes concurrent callers wait for the schema to be ready', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  fixture.database.execAsync.mockImplementationOnce(async (sql) => {
    await gate;
    fixture.sqlite.exec(sql);
  });
  const first = getDatabase();
  const second = getDatabase();
  await Promise.resolve();
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(getDb()).toBeNull();
  release();
  const databases = await Promise.all([first, second]);
  expect(databases[0]).toBe(databases[1]);
  expect(fixture.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'app_settings'").get()?.name).toBe('app_settings');
});

it('closes a failed connection and retries initialization', async () => {
  fixture.database.execAsync.mockRejectedValueOnce(new Error('Initialization failed'));
  await expect(getDatabase()).rejects.toThrow('Initialization failed');
  expect(fixture.database.closeAsync).toHaveBeenCalledTimes(1);
  fixture = createDatabase();
  mockOpen.mockResolvedValue(fixture.database as unknown as Awaited<ReturnType<typeof openDatabaseAsync>>);
  await getDatabase();
  expect(mockOpen).toHaveBeenCalledTimes(2);
  await settingsStorage.setItem('mia-ui', 'ready');
  expect(await settingsStorage.getItem('mia-ui')).toBe('ready');
});

class CategoryRepository extends BaseRepository<BaseEntity & { name: string }> {
  protected tableName = 'categories';
  protected columns = ['name'];
}

it('prevents Business A from reading Business B through the repository', async () => {
  await getDatabase();
  fixture.sqlite.exec("INSERT INTO businesses (id, name, business_code) VALUES ('a', 'Shop A', 'MIA-A'), ('b', 'Shop B', 'MIA-B');");
  fixture.sqlite.exec("INSERT INTO categories (id, business_id, name) VALUES ('a-category', 'a', 'A stock'), ('b-category', 'b', 'B stock');");
  const repository = new CategoryRepository();
  expect(await repository.findById('b-category', 'a')).toBeNull();
  expect((await repository.findAll('a')).map(category => category.id)).toEqual(['a-category']);
  expect((await repository.findById('b-category', 'b'))?.name).toBe('B stock');
});
