# MIA - Daily Trading & Stock Management Mobile App

A production-quality MVP mobile application for small retail, wholesale, and trading businesses. Built with React Native, Expo, TypeScript, and Supabase.

## Features

- **Multi-business Architecture**: Complete tenant isolation with Supabase RLS
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
- **Database**: expo-sqlite (local), Supabase/PostgreSQL (remote)
- **Sync**: Custom sync engine with idempotency
- **Styling**: NativeWind (Tailwind CSS)
- **i18n**: react-i18next
- **Auth**: Supabase Auth

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator / Android Emulator
- Supabase account

### Installation

```bash
# Clone the repository
cd MIA

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure Supabase credentials in .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Start development server
npm start
```

### Supabase Setup

1. Create a new Supabase project
2. Run the migrations in `supabase/migrations/`:
   - `001_initial_schema.sql` - Creates all tables and indexes
   - `002_rls_policies.sql` - Enables RLS with tenant isolation policies
3. Enable Email/Password authentication in Supabase Auth settings

### Running on Devices

```bash
# iOS
npm run ios

# Android
npm run android

# Web
npm run web
```

## Project Structure

```
MIA/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Auth flow screens
│   └── (tabs)/            # Main tab screens
├── src/
│   ├── components/        # Reusable UI components
│   ├── constants/         # App constants
│   ├── db/                # SQLite database & migrations
│   ├── hooks/             # React hooks (TanStack Query)
│   ├── i18n/              # Internationalization
│   ├── repositories/      # Data access layer
│   ├── services/          # Business logic services
│   ├── stores/            # Zustand state stores
│   ├── translations/      # Translation files (en, rw)
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
├── supabase/
│   └── migrations/        # Supabase/PostgreSQL migrations
├── assets/                # Static assets
└── __tests__/             # Unit tests
```

## Key Architecture Decisions

### Offline-First Design
- All writes go to SQLite first
- UI updates immediately
- Background sync to Supabase when online
- Idempotent operations prevent duplicates

### Multi-Tenant Security
- Every table has `business_id` column
- Supabase RLS enforces tenant isolation
- No client-side filtering for security

### Financial Calculations
- Pure functions in `src/services/financial/calculations.ts`
- Integer-based arithmetic (minor units)
- Single source of truth for all formulas
- Comprehensive unit tests

### Immutable Transactions
- Sales, purchases, payments, closings are immutable
- Corrections use void/refund/reversal patterns
- Audit trail preserved

## Development Phases

1. **Phase 1**: Project setup, Expo, TypeScript, NativeWind, SQLite, base architecture ✅
2. **Phase 2**: Business & authentication, Supabase Auth, RLS ✅
3. **Phase 3**: Products & inventory, categories, stock movements ✅
4. **Phase 4**: Purchases, suppliers, stock-in ✅
5. **Phase 5**: Sales, customers, payments, COGS, profit ✅
6. **Phase 6**: Expenses, payments, cash tracking ✅
7. **Phase 7**: End-of-day, cash reconciliation, daily snapshots ✅
8. **Phase 8**: Reports, analytics ✅
9. **Phase 9**: Offline sync, network detection, retry logic ✅
10. **Phase 10**: Production prep, localization, tests, accessibility ✅

## Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm test -- --coverage
```

## Building for Production

```bash
# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Support

For support, email support@mia.app or visit our [documentation](https://mia.app/docs).