# MIA - Development Agents Instructions

This file contains instructions for AI agents working on the MIA project.

## Project Overview

MIA is a daily trading & stock management mobile app for small retail/wholesale businesses in Rwanda/Africa. It replaces handwritten notebooks with a fast mobile workflow.

**Core Principle**: "Record business activity once and let the application calculate everything automatically."

## Architecture

```
UI (React Native + Expo Router)
  ↓
Hooks (TanStack Query)
  ↓
Services (Business Logic)
  ↓
Repositories (Data Access)
  ↓
Local SQLite (expo-sqlite)
  ↓
Sync Engine
  ↓
MIA Backend (Express + PostgreSQL)
```

## Key Rules

1. **Never put API calls directly in screen components** — use services/hooks
2. **Keep business logic outside UI components**
3. **Keep database operations inside repositories/services**
4. **Keep calculations in dedicated financial utilities**
5. **Single source of truth for financial calculations**
6. **All business-owned data MUST have business_id**
7. **Never trust client-provided business_id** — backend verifies membership
8. **Backend auth + business checks enforce tenant isolation**

## Financial Calculations

All financial calculations are in `src/services/financial/calculations.ts`:
- `calculateSaleSubtotal()`
- `calculateSaleTotal()`
- `calculateWeightedAverageCost()`
- `calculateCOGS()`
- `calculateGrossProfit()`
- `calculateGrossMargin()`
- `calculateNetProfit()`
- `calculateExpectedCash()`
- `calculateCashVariance()`
- `calculateStockBalance()`
- `calculateStockValue()`

These are pure functions, heavily tested.

## Database

- Local: expo-sqlite (`mia.db`)
- Remote: custom MIA backend PostgreSQL (`backend/`) with TypeORM
- Local schema in `src/db/schema.ts`; remote entities in `backend/src/entities/`
- All tables have `business_id`, `created_at`, `updated_at`, `sync_status` (where applicable)
- Sync statuses: `pending`, `syncing`, `synced`, `failed`

## Multi-Tenant Security

- Every table has `business_id` column
- Backend JWT + membership checks enforce isolation
- Test: Business A cannot access Business B's data

## Offline-First

- Write to SQLite FIRST
- Never make user wait for the cloud API
- Background sync when online
- Idempotent UUIDs prevent duplicates
- Show "12 transactions waiting to sync" / "✓ Synced"

## Adding New Features

1. Create TypeScript types in `src/types/`
2. Add database table in local + backend schemas
3. Create repository in `src/repositories/`
4. Add service logic in `src/services/`
5. Create hooks in `src/hooks/`
6. Build UI components in `src/components/`
7. Create screens in `app/`
8. Add translations in `src/translations/en.ts` and `rw.ts`
9. Write tests in `__tests__/`
10. Expose sync route columns in `backend/src/routes/sync.ts` if the table syncs

## Code Style

- TypeScript strict mode
- No comments unless asked
- Functional components with hooks
- Zod for validation
- React Hook Form for forms
- NativeWind/Tailwind for styling

## Testing

- Unit tests for all financial calculations
- Tenant isolation test mandatory
- Run: `npm test`

## Languages

- English (en)
- Kinyarwanda (rw)
- Never hardcode user-facing text
- Use `useTranslation()` hook

## Currency

- Default: RWF
- Format: `420,000 RWF`
- Integer minor units for calculations
- Never use floating-point for money

## Roles & Permissions

| Role | Permissions |
|------|-------------|
| OWNER | Everything, manage business/users, close day |
| MANAGER | Products, purchases, sales, expenses, reports, close day |
| CASHIER | Create sales, customer payments, limited stock view |
| STAFF | Limited operational access |

## Common Commands

```bash
npm start # Start Expo dev server
npm run ios # Run on iOS simulator
npm run android # Run on Android emulator
npm run web # Run on web
npm test # Run tests
npm run typecheck # TypeScript check
npm run lint # ESLint
npm run backend:init-db # Apply backend/sql/schema.sql
npm run backend:dev # Start API on :4000
```

## Known Limitations

1. No real-time sync (polling-based)
2. No multi-device conflict resolution UI
3. No barcode scanning hardware integration yet
4. No print/receipt hardware integration yet
5. Single active business per user (MVP)

## Recommended Next Features

1. Multi-business switching
2. Barcode scanning
3. Receipt printing (Bluetooth thermal)
4. Advanced inventory (batches, expiry)
5. Customer credit management
6. Purchase orders
7. Bank reconciliation
8. Multi-location support
9. API for integrations
10. Web admin dashboard
