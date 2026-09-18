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
npm run db:init   # TypeORM synchronize schema
npm run db:seed   # demo shop + users + products
npm run dev
```

API: `http://localhost:4000`  
On a phone (same Wi‑Fi): `http://YOUR_LAN_IP:4000`

## Demo seed logins
| Role | Email | Password |
|------|-------|----------|
| OWNER | `owner@mia.rw` | `Owner123!` |
| MANAGER | `manager@mia.rw` | `Manager123!` |
| CASHIER | `cashier@mia.rw` | `Cashier123!` |

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
