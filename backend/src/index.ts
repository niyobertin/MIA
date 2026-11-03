import 'reflect-metadata';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { initDatabase } from './data-source';
import { authRouter } from './routes/auth';
import { syncRouter } from './routes/sync';
import { rateLimit, securityHeaders } from './middleware/security';

dotenv.config();

async function main() {
  // Schema sync on every boot (entities → Postgres). Set TYPEORM_SYNC=false to skip.
  const syncOnBoot = process.env.TYPEORM_SYNC !== 'false';
  await initDatabase({ synchronize: syncOnBoot });
  if (syncOnBoot) {
    console.log('PostgreSQL schema synchronized (TypeORM).');
  } else {
    console.log('TYPEORM_SYNC=false — skipped schema sync. Run npm run db:migrate after deploy.');
  }

  const app = express();
  const PORT = Number(process.env.PORT ?? 4000);
  const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
  const TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 1);

  if (CORS_ORIGIN === '*' && process.env.NODE_ENV === 'production') {
    console.warn('CORS_ORIGIN=* in production — set it to your dashboard origin(s).');
  }

  app.disable('x-powered-by');
  app.set('trust proxy', TRUST_PROXY);
  app.use(securityHeaders);
  app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
  app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'mia-backend',
      orm: 'typeorm',
      db: 'postgres',
      schemaSync: syncOnBoot,
    });
  });

  app.use('/auth', authRouter);
  app.use('/sync', syncRouter);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MIA API listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((error) => {
  console.error('Failed to start MIA backend', error);
  process.exit(1);
});
