import 'reflect-metadata';
import dotenv from 'dotenv';
import { initDatabase, AppDataSource, planSchemaChanges, findDestructiveQueries } from '../data-source';

dotenv.config();

async function main() {
  await initDatabase();
  const queries = await planSchemaChanges();
  const destructive = new Set(findDestructiveQueries(queries));
  if (queries.length === 0) {
    console.log('Schema is up to date. No changes pending.');
  } else {
    console.log(`${queries.length} pending schema change(s):`);
    for (const query of queries) {
      console.log(`${destructive.has(query) ? '[DATA RISK] ' : '            '}${query}`);
    }
    if (destructive.size > 0) {
      console.log(`\n${destructive.size} change(s) can delete or rewrite data. Back up first.`);
    }
  }
  await AppDataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
