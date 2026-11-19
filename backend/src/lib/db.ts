import { AppDataSource } from '../data-source';

export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await AppDataSource.query(text, params);
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') return result[0] as T[];
  return result as T[];
}
