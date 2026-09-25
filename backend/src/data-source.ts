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
  ],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
});

export async function initDatabase(options?: { synchronize?: boolean }) {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  if (options?.synchronize) {
    await AppDataSource.synchronize();
  }
  return AppDataSource;
}
