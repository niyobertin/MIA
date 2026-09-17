import { StateStorage } from 'zustand/middleware';
import { getDatabase } from '@/db/database';

export const settingsStorage: StateStorage = {
  async getItem(key) {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?', [key]
    );
    return row?.value ?? null;
  },
  async setItem(key, value) {
    const db = await getDatabase();
    await db.runAsync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, value]);
  },
  async removeItem(key) {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
  },
};
