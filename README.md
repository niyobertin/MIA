# MIA - Daily Trading & Stock Management Mobile App

A production-quality MVP mobile application for small retail, wholesale, and trading businesses. Built with React Native, Expo, TypeScript, and a custom Express/PostgreSQL backend.

## Features

- **Multi-business Architecture**: Tenant isolation via JWT + business membership checks
- **Offline-First**: Works without internet, syncs when online
- **Stock Management**: Products, categories, stock movements, weighted average costing
- **Sales/POS**: Fast sales screen with cart, payments, receipts
- **Purchases**: Stock in with supplier management
- **Expenses**: Categorized expense tracking
- **Payments**: Customer/supplier payments, multiple payment methods
- **Cash Reconciliation**: End-of-day cash reconciliation with variance tracking
- **Daily Closing**: Permanent financial snapshots
- **Reports**: Sales, stock, profit, expense reports with filtering
- **Localization**: English & Kinyarwanda support
- **Role-based Access**: Owner, Manager, Cashier, Staff roles

## Tech Stack

- **Frontend**: React Native, Expo, TypeScript, Expo Router
- **State**: Zustand, TanStack Query
- **Forms**: React Hook Form + Zod validation
- **Database**: expo-sqlite (local), PostgreSQL via MIA backend (remote)
- **Sync**: Custom sync engine with idempotency
- **Styling**: NativeWind (Tailwind CSS)
- **i18n**: react-i18next
- **Auth**: Custom JWT API (`backend/`)

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI / Expo Go
- iOS Simulator / Android Emulator
- PostgreSQL 14+

### Installation

```bash
cd MIA
npm install
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:4000
```

### Backend Setup

```bash
cd backend
cp .env.example .env
# edit DATABASE_URL + JWT_SECRET
createdb mia   # once
npm install
npm run db:init
npm run dev
```

Or from the repo root: `npm run backend:init-db` then `npm run backend:dev`.

### Running the app

```bash
npm start
# or
npm run ios
npm run android
```

## Project Structure

```
MIA/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Auth flow screens
│   └── (tabs)/            # Main tab screens
├── backend/               # Express + PostgreSQL API
│   ├── sql/schema.sql
│   └── src/
├── src/
│   ├── components/
│   ├── db/                # SQLite schema & seed
│   ├── hooks/
│   ├── lib/api.ts         # Cloud API client
│   ├── repositories/
│   ├── services/          # Auth, sync, financial
│   ├── stores/
│   ├── translations/
│   ├── types/
│   └── utils/
├── assets/
└── __tests__/
```

## Key Architecture Decisions

### Offline-First Design
- All writes go to SQLite first
- UI updates immediately
- Background sync to the MIA API when online
- Idempotent UUIDs prevent duplicates

### Multi-Tenant Security
- Every table has `business_id`
- Backend verifies the signed-in user's business membership
- No client-side filtering for security

### Financial Calculations
- Pure functions in `src/services/financial/calculations.ts`
- Integer-based arithmetic (minor units)
- Single source of truth for all formulas

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | MIA backend base URL (e.g. `http://192.168.1.10:4000`) |

Backend (`backend/.env`):

| Variable | Description |
|----------|-------------|
| `PORT` | API port (default 4000) |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signing secret for access tokens |
| `CORS_ORIGIN` | Allowed origins (`*` for dev) |

## Testing

```bash
npm test
npm run typecheck
```

## Building

```bash
eas build --platform android --profile preview
eas build --platform ios
```

## License

MIT License - see LICENSE file for details.
