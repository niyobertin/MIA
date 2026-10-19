import 'reflect-metadata';
import dotenv from 'dotenv';
import { initDatabase, AppDataSource } from '../data-source';

dotenv.config();

async function main() {
  console.log('Migrating PostgreSQL schema from TypeORM entities…');
  await initDatabase({ synchronize: true });
  console.log('TypeORM schema synchronized to PostgreSQL.');
  await AppDataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
