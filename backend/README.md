# MIA Backend — Express + TypeORM + PostgreSQL

## Stack
- Node.js + Express + TypeScript
- **TypeORM** entities/repositories
- **PostgreSQL**
- JWT auth (same password hash format as the mobile app)
- REST sync for the offline-first Expo app

## Setup
```bash
cd backend
cp .env.example .env
# edit DATABASE_URL + JWT_SECRET

# create database once (Postgres must be running)
createdb mia

npm install
npm run db:migrate   # TypeORM synchronize schema (same as db:init)
npm run db:seed      # demo shop + users + products
npm run dev
```

**Schema sync is automatic:**
- `npm start` runs `db:migrate` first (`prestart`), then boots the API
- API boot also synchronizes entities → Postgres unless `TYPEORM_SYNC=false`
- On push to `main` (when `backend/**` changes), GitHub Action `.github/workflows/migrate-backend.yml` runs migrate if secret `DATABASE_URL` is set

API: `http://localhost:4000`  
On a phone (same Wi‑Fi): `http://YOUR_LAN_IP:4000`

## Schema changes and backups

Schema sync (on boot, `npm run db:migrate`, and the GitHub Action) only applies changes that keep data, such as new tables and columns. If a change would drop a table or column, change a column type, or rename something, the API refuses to start and prints the SQL.

```bash
npm run db:plan      # show pending schema changes; [DATA RISK] marks dangerous ones
npm run db:backup    # pg_dump to ./backups (BACKUP_DIR), keeps BACKUP_KEEP_DAYS=30
npm run db:restore -- backups/mia-<stamp>.dump   # asks you to type RESTORE
```

To apply a flagged change: back up, review `db:plan`, then run once with `ALLOW_DESTRUCTIVE_SCHEMA=true npm run db:migrate`.

Production needs a daily backup that is copied off the server, for example a cron entry:

```bash
0 2 * * * cd /srv/mia/backend && BACKUP_DIR=/var/backups/mia npm run -s db:backup
```

Test a restore into a separate database every month: `npm run db:restore -- <file> postgresql://.../mia_restore_test`.

## Demo seed logins
| Role | Email | PIN |
|------|-------|----------|
| OWNER | `owner@mia.rw` | `1357` |
| MANAGER | `manager@mia.rw` | `2468` |
| CASHIER | `cashier@mia.rw` | `3579` |

Business invite code: **`MIA-RW-DEMO`**

## Endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | no | health check |
| POST | `/auth/register` | no | create account |
| POST | `/auth/login` | no | sign in → JWT |
| GET | `/auth/me` | yes | current user + business |
| GET | `/auth/business-by-code/:code` | yes | lookup business invite code |
| POST | `/auth/join-business` | yes | join business by code |
| POST | `/auth/refresh` | yes | re-issue JWT with current membership |
| POST | `/sync/:table` | yes | upsert one row from device |
| DELETE | `/sync/:table/:id` | yes | delete row |
| GET | `/sync/pull` | yes | download business data |

## Project layout
```
backend/src/
  data-source.ts      # TypeORM DataSource
  entities/           # Business, User, Product, Sale, …
  routes/auth.ts
  routes/sync.ts
  lib/auth.ts         # JWT + password hashing
  middleware/auth.ts
```

## Mobile app
```
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:4000
```
