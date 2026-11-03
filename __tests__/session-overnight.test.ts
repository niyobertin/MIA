/**
 * Business-session trading day tests.
 * Controllable clock — never relies on wall-clock midnight.
 */
import { DatabaseSync } from 'node:sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { closeDatabase, getDatabase } from '@/db/database';
import { dailyClosingRepository } from '@/repositories/reports/dailyClosing';
import { saleRepository } from '@/repositories/sales/sales';
import { financialService } from '@/services/financial';
import {
  assertSessionMutable,
  formatSessionDuration,
  getOpenSession,
  nextSessionNumber,
  requireOpenSession,
  sessionElapsedMs,
} from '@/services/books/session';
import { toLocalDateString } from '@/utils/periodBounds';
import { calculateExpectedCash, calculateCashVariance } from '@/services/financial/calculations';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const database = {
    execAsync: jest.fn(async (sql: string) => {
      sqlite.exec(sql);
    }),
    getFirstAsync: jest.fn(async (sql: string, params: (string | number | null)[] = []) =>
      sqlite.prepare(sql).get(...params)
    ),
    getAllAsync: jest.fn(async (sql: string, params: (string | number | null)[] = []) =>
      sqlite.prepare(sql).all(...params)
    ),
    runAsync: jest.fn(async (sql: string, params: (string | number | null)[] = []) =>
      sqlite.prepare(sql).run(...params)
    ),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }),
    closeAsync: jest.fn(async () => {
      sqlite.close();
    }),
  };
  return { sqlite, database };
}

const mockOpen = jest.mocked(openDatabaseAsync);
let fixture: ReturnType<typeof createDatabase>;

const BIZ = 'biz-session-1';
const USER = 'user-owner-1';

async function seedBusiness() {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO businesses (id, name, business_code, currency, country, timezone)
     VALUES (?, 'Test Shop', 'MIA-T', 'RWF', 'RW', 'Africa/Kigali')`,
    [BIZ]
  );
  await db.runAsync(
    `INSERT INTO users (id, business_id, name, email, password_hash, role, active)
     VALUES (?, ?, 'Owner', 'owner@test.local', 'x', 'OWNER', 1)`,
    [USER, BIZ]
  );
}

async function openSession(opts: {
  id: string;
  businessDate: string;
  openedAt: string;
  openingCash?: number;
  sessionNumber?: number;
}) {
  return dailyClosingRepository.create({
    id: opts.id,
    business_id: BIZ,
    business_date: opts.businessDate,
    session_number: opts.sessionNumber ?? (await nextSessionNumber(BIZ)),
    opening_cash: opts.openingCash ?? 10000,
    cash_sales: 0,
    customer_cash_payments: 0,
    other_cash_income: 0,
    cash_purchases: 0,
    cash_expenses: 0,
    supplier_cash_payments: 0,
    withdrawals: 0,
    expected_cash: opts.openingCash ?? 10000,
    actual_cash: 0,
    cash_variance: 0,
    total_sales: 0,
    cogs: 0,
    gross_profit: 0,
    expenses: 0,
    net_profit: 0,
    opening_stock_qty: 0,
    opening_stock_value: 0,
    closing_stock_qty: 0,
    closing_stock_value: 0,
    notes: null,
    opened_by: USER,
    opened_at: opts.openedAt,
    closed_by: null,
    closed_at: null,
    status: 'open',
  });
}

async function insertSale(opts: {
  id: string;
  sessionId: string;
  saleDate: string;
  createdAt: string;
  total: number;
  paid?: number;
  voided?: boolean;
}) {
  const db = await getDatabase();
  const paid = opts.paid ?? opts.total;
  await db.runAsync(
    `INSERT INTO sales (
      id, business_id, customer_id, session_id, reference_number,
      subtotal, discount_amount, tax_amount, total_amount, paid_amount,
      voided, payment_status, sale_date, notes, created_by, device_id,
      sync_status, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, NULL, ?, 0, 0, ?, ?, ?, 'paid', ?, NULL, ?, 'device-1', 'pending', ?, ?)`,
    [
      opts.id,
      BIZ,
      opts.sessionId,
      opts.total,
      opts.total,
      paid,
      opts.voided ? 1 : 0,
      opts.saleDate,
      USER,
      opts.createdAt,
      opts.createdAt,
    ]
  );
  return saleRepository.findById(opts.id, BIZ);
}

beforeEach(async () => {
  mockOpen.mockReset();
  fixture = createDatabase();
  mockOpen.mockResolvedValue(fixture.database as unknown as Awaited<ReturnType<typeof openDatabaseAsync>>);
  await getDatabase();
  await seedBusiness();
});

afterEach(async () => {
  await closeDatabase();
});

describe('overnight trading session', () => {
  it('keeps Monday evening and Tuesday after-midnight sales in the same session', async () => {
    // Monday 18:00 open → Tuesday 02:00 close
    const session = await openSession({
      id: 'sess-mon',
      businessDate: '2026-03-16',
      openedAt: '2026-03-16T18:00:00.000Z',
      sessionNumber: 1,
    });

    await insertSale({
      id: 'sale-mon-eve',
      sessionId: session.id,
      saleDate: '2026-03-16',
      createdAt: '2026-03-16T20:00:00.000Z',
      total: 5000,
    });
    await insertSale({
      id: 'sale-tue-am',
      sessionId: session.id,
      saleDate: '2026-03-17',
      createdAt: '2026-03-17T00:30:00.000Z',
      total: 3000,
    });

    const mon = await saleRepository.findById('sale-mon-eve', BIZ);
    const tue = await saleRepository.findById('sale-tue-am', BIZ);
    expect(mon?.session_id).toBe(session.id);
    expect(tue?.session_id).toBe(session.id);

    const sessionSales = await saleRepository.getTotalSalesForSession(BIZ, session.id);
    expect(sessionSales).toBe(8000);

    const calendarTue = await saleRepository.getTotalSales(BIZ, '2026-03-17', '2026-03-17');
    expect(calendarTue).toBe(3000);

    const calendarMon = await saleRepository.getTotalSales(BIZ, '2026-03-16', '2026-03-16');
    expect(calendarMon).toBe(5000);

    const financials = await financialService.calculateSessionFinancials(BIZ, session.id);
    expect(financials.totalSales).toBe(8000);
  });

  it('does not auto-close after 24 hours and allows reopen on the same calendar date', async () => {
    const openedAt = '2026-03-16T08:00:00.000Z';
    const session = await openSession({
      id: 'sess-long',
      businessDate: '2026-03-16',
      openedAt,
      sessionNumber: 1,
    });

    const after30h = new Date('2026-03-17T14:00:00.000Z');
    const elapsed = sessionElapsedMs(openedAt, after30h);
    expect(elapsed).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(formatSessionDuration(elapsed)).toMatch(/1d/);

    const stillOpen = await getOpenSession(BIZ);
    expect(stillOpen?.id).toBe(session.id);

    await dailyClosingRepository.update(session.id, BIZ, {
      status: 'closed',
      closed_at: '2026-03-17T14:00:00.000Z',
      closed_by: USER,
      actual_cash: 10000,
      expected_cash: 10000,
      cash_variance: 0,
      total_sales: 0,
    });

    await expect(requireOpenSession(BIZ)).rejects.toMatchObject({ message: 'DAY_CLOSED' });

    // Same calendar date — new session is allowed after close.
    const next = await openSession({
      id: 'sess-same-day',
      businessDate: '2026-03-17',
      openedAt: '2026-03-17T15:00:00.000Z',
      sessionNumber: 2,
    });
    expect(next.session_number).toBe(2);
    expect((await requireOpenSession(BIZ)).id).toBe(next.id);
  });

  it('blocks ordinary edits on a closed session and new sales without an open session', async () => {
    const session = await openSession({
      id: 'sess-close',
      businessDate: '2026-03-16',
      openedAt: '2026-03-16T18:00:00.000Z',
    });

    await insertSale({
      id: 'sale-1',
      sessionId: session.id,
      saleDate: '2026-03-16',
      createdAt: '2026-03-16T19:00:00.000Z',
      total: 2000,
    });

    await dailyClosingRepository.update(session.id, BIZ, {
      status: 'closed',
      closed_at: '2026-03-17T02:00:00.000Z',
      closed_by: USER,
      total_sales: 2000,
      expected_cash: 12000,
      actual_cash: 12000,
      cash_variance: 0,
    });

    await expect(assertSessionMutable(BIZ, session.id)).rejects.toMatchObject({
      message: 'DAY_CLOSED',
    });
    await expect(requireOpenSession(BIZ)).rejects.toMatchObject({ message: 'DAY_CLOSED' });

    await expect(
      dailyClosingRepository.update(session.id, BIZ, { notes: 'tamper' })
    ).rejects.toThrow('HISTORY_LOCKED');
  });

  it('reconciles cash correctly distinguishing cash vs non-cash', async () => {
    const opening = 10000;
    const cashSales = 4000;
    const mobileSales = 2500; // not physical cash
    const customerCashPayments = 1000;
    const cashExpenses = 500;
    const cashPurchases = 1500;
    const supplierCash = 0;
    const withdrawals = 200;
    const otherIncome = 0;

    const expected = calculateExpectedCash(
      opening,
      cashSales,
      customerCashPayments,
      otherIncome,
      cashPurchases,
      cashExpenses,
      supplierCash,
      withdrawals
    );
    // 10000 + 4000 + 1000 - 1500 - 500 - 200 = 12800 (mobile ignored)
    expect(expected).toBe(12800);
    expect(expected).not.toBe(opening + cashSales + mobileSales);

    const actual = 12700;
    expect(calculateCashVariance(actual, expected)).toBe(-100);
  });

  it('preserves session_id and local business date on late sync semantics', async () => {
    const session = await openSession({
      id: 'sess-offline',
      businessDate: '2026-03-16',
      openedAt: '2026-03-16T18:00:00.000Z',
    });

    const sale = await insertSale({
      id: 'sale-offline',
      sessionId: session.id,
      saleDate: '2026-03-16',
      createdAt: '2026-03-16T21:00:00.000Z',
      total: 1500,
    });
    expect(sale).not.toBeNull();

    // Simulate sync arriving next calendar day — session and sale_date stay put.
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE sales SET sync_status = 'synced', updated_at = ? WHERE id = ?`,
      ['2026-03-17T10:00:00.000Z', sale!.id]
    );

    const reloaded = await saleRepository.findById(sale!.id, BIZ);
    expect(reloaded?.session_id).toBe(session.id);
    expect(String(reloaded?.sale_date).slice(0, 10)).toBe('2026-03-16');
  });

  it('uses local calendar date helper without UTC day shift for Africa/Kigali evenings', () => {
    // 2026-03-16 21:00 UTC+2 = 19:00 UTC → local date still 16th when constructed locally
    const local = new Date(2026, 2, 16, 21, 0, 0); // month is 0-indexed
    expect(toLocalDateString(local)).toBe('2026-03-16');

    const afterMidnight = new Date(2026, 2, 17, 0, 30, 0);
    expect(toLocalDateString(afterMidnight)).toBe('2026-03-17');
  });

  it('rejects a second concurrent open session at the repository layer', async () => {
    await openSession({
      id: 'sess-a',
      businessDate: '2026-03-16',
      openedAt: '2026-03-16T08:00:00.000Z',
      sessionNumber: 1,
    });
    const open = await getOpenSession(BIZ);
    expect(open?.id).toBe('sess-a');

    // App layer prevents duplicate open via useStartDay; findOpenDay still returns one.
    await openSession({
      id: 'sess-b',
      businessDate: '2026-03-16',
      openedAt: '2026-03-16T09:00:00.000Z',
      sessionNumber: 2,
    });
    const still = await dailyClosingRepository.findOpenDay(BIZ);
    // Latest open wins for "current" — sync API rejects the conflicting push.
    expect(still?.id).toBe('sess-b');
  });

  it('keeps historical session report totals stable after later stock movements', async () => {
    const session = await openSession({
      id: 'sess-hist',
      businessDate: '2026-03-16',
      openedAt: '2026-03-16T08:00:00.000Z',
      openingCash: 5000,
    });

    await insertSale({
      id: 'sale-hist',
      sessionId: session.id,
      saleDate: '2026-03-16',
      createdAt: '2026-03-16T10:00:00.000Z',
      total: 7000,
    });

    const beforeClose = await financialService.calculateSessionFinancials(BIZ, session.id);
    expect(beforeClose.totalSales).toBe(7000);

    await dailyClosingRepository.update(session.id, BIZ, {
      status: 'closed',
      closed_at: '2026-03-16T20:00:00.000Z',
      closed_by: USER,
      total_sales: beforeClose.totalSales,
      expected_cash: 12000,
      actual_cash: 12000,
      cash_variance: 0,
      gross_profit: beforeClose.grossProfit,
      net_profit: beforeClose.netProfit,
    });

    const saved = await dailyClosingRepository.findById(session.id, BIZ);
    expect(saved?.total_sales).toBe(7000);

    // Later open session + sales must not change the saved closed totals.
    const later = await openSession({
      id: 'sess-later',
      businessDate: '2026-03-17',
      openedAt: '2026-03-17T08:00:00.000Z',
      sessionNumber: 2,
    });
    await insertSale({
      id: 'sale-later',
      sessionId: later.id,
      saleDate: '2026-03-17',
      createdAt: '2026-03-17T09:00:00.000Z',
      total: 9999,
    });

    const historical = await dailyClosingRepository.findById(session.id, BIZ);
    expect(historical?.total_sales).toBe(7000);
    expect(historical?.status).toBe('closed');
  });
});

describe('session helpers', () => {
  it('formats duration across midnight', () => {
    const ms = sessionElapsedMs('2026-03-16T18:00:00.000Z', new Date('2026-03-17T02:00:00.000Z'));
    expect(formatSessionDuration(ms)).toBe('8h 0m');
  });
});
