import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import {
  Business,
  User,
  Category,
  Product,
  Supplier,
  Customer,
  StockMovement,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  Expense,
  Payment,
  DailyClosing,
  DailyStockLine,
  WaiterTab,
  WaiterTabItem,
  AuditLog,
} from './entities';

dotenv.config();

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://localhost:5432/mia';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: DATABASE_URL,
  entities: [
    Business,
    User,
    Category,
    Product,
    Supplier,
    Customer,
    StockMovement,
    Purchase,
    PurchaseItem,
    Sale,
    SaleItem,
    Expense,
    Payment,
    DailyClosing,
    DailyStockLine,
    WaiterTab,
    WaiterTabItem,
    AuditLog,
  ],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
});

const DESTRUCTIVE_SQL =
  /\b(DROP\s+(TABLE|COLUMN|SCHEMA|TYPE)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+"?\w+"?\s+TYPE|RENAME\s+(COLUMN|TO))\b/i;

export class UnsafeSchemaChangeError extends Error {
  constructor(readonly queries: string[]) {
    super(
      [
        'Refusing schema changes that can delete or rewrite data:',
        ...queries.map((q) => `  ${q}`),
        'Back up the database (npm run db:backup), review the change with npm run db:plan,',
        'then rerun once with ALLOW_DESTRUCTIVE_SCHEMA=true.',
      ].join('\n'),
    );
    this.name = 'UnsafeSchemaChangeError';
  }
}

export function findDestructiveQueries(queries: string[]) {
  return queries.filter((query) => DESTRUCTIVE_SQL.test(query));
}

export async function planSchemaChanges() {
  const plan = await AppDataSource.driver.createSchemaBuilder().log();
  return plan.upQueries.map((q) => q.query);
}

export async function initDatabase(options?: { synchronize?: boolean; allowDestructive?: boolean }) {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  if (options?.synchronize) {
    const queries = await planSchemaChanges();
    if (queries.length === 0) return AppDataSource;
    const allowDestructive =
      options.allowDestructive ?? process.env.ALLOW_DESTRUCTIVE_SCHEMA === 'true';
    const destructive = findDestructiveQueries(queries);
    if (destructive.length > 0 && !allowDestructive) {
      throw new UnsafeSchemaChangeError(destructive);
    }
    await AppDataSource.synchronize();
  }
  return AppDataSource;
}
