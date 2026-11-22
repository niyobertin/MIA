import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, Building2, CreditCard, Smartphone, Vault, type LucideIcon } from 'lucide-react';
import { Card } from '../ui/kit';
import { Bone, SummaryPanelSkeleton } from '../ui/skeleton';

export type DayTotals = {
  totalSales: number; cogs: number; grossProfit: number; expenses: number; netProfit: number;
  cashSales: number; momoSales: number; bankSales: number; creditSales: number;
  customerCashPayments: number; otherCashIncome: number; cashPurchases: number; cashExpenses: number; supplierCashPayments: number; withdrawals: number;
};

type Money = (value: number) => string;

function FlowList({ title, icon: Icon, tone, rows, total, money }: { title: string; icon: LucideIcon; tone: 'in' | 'out'; rows: [string, number][]; total: number; money: Money }) {
  const color = tone === 'in' ? 'text-emerald-700' : 'text-rose-700';
  const sign = tone === 'in' ? '+' : '−';
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${tone === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}><Icon size={14} aria-hidden /></span>
        {title}
      </div>
      <dl className="text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-50 py-2">
            <dt className="text-slate-600">{label}</dt>
            <dd className={`whitespace-nowrap font-semibold tabular-nums ${value === 0 ? 'text-slate-400' : 'text-slate-900'}`}>{value === 0 ? money(0) : `${sign}${money(value)}`}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 pt-2.5">
          <dt className="font-semibold text-slate-900">Total {tone === 'in' ? 'in' : 'out'}</dt>
          <dd className={`whitespace-nowrap font-bold tabular-nums ${total === 0 ? 'text-slate-500' : color}`}>{total === 0 ? money(0) : `${sign}${money(total)}`}</dd>
        </div>
      </dl>
    </div>
  );
}

export function cashFlows(totals: DayTotals) {
  const inflows: [string, number][] = [
    ['Cash sales', totals.cashSales],
    ['Debt collected in cash', totals.customerCashPayments],
    ['Other cash received', totals.otherCashIncome],
  ];
  const outflows: [string, number][] = [
    ['Stock bought with cash', totals.cashPurchases],
    ['Expenses paid in cash', totals.cashExpenses],
    ['Suppliers paid in cash', totals.supplierCashPayments],
    ['Cash taken out', totals.withdrawals],
  ];
  const sum = (rows: [string, number][]) => rows.reduce((acc, [, value]) => acc + value, 0);
  return { inflows, outflows, totalIn: sum(inflows), totalOut: sum(outflows) };
}

function PaymentTile({ icon: Icon, label, value, hint, money }: { icon: LucideIcon; label: string; value: number; hint: string; money: Money }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm"><Icon size={17} aria-hidden /></span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="truncate font-bold tabular-nums text-slate-900">{money(value)}</div>
        <div className="truncate text-[11px] text-slate-400">{hint}</div>
      </div>
    </div>
  );
}

export function PaymentSummary({ totals, money, includeCash = false }: { totals: DayTotals; money: Money; includeCash?: boolean }) {
  return (
    <div className={`grid gap-3 ${includeCash ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
      {includeCash ? <PaymentTile icon={Banknote} label="Cash" value={totals.cashSales} hint="Sales paid in cash" money={money} /> : null}
      <PaymentTile icon={Smartphone} label="Mobile money" value={totals.momoSales} hint="Not in the drawer" money={money} />
      <PaymentTile icon={Building2} label="Bank" value={totals.bankSales} hint="Not in the drawer" money={money} />
      <PaymentTile icon={CreditCard} label="Credit" value={totals.creditSales} hint="Owed by customers" money={money} />
    </div>
  );
}

export function ExpectedCashBar({ opening, totalIn, totalOut, expected, money, children }: { opening: number; totalIn: number; totalOut: number; expected: number; money: Money; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[#0e3b36] p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><Vault size={22} aria-hidden /></span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-200/80">Expected in the drawer</div>
          <div className="text-[11px] text-emerald-100/70 tabular-nums">Opening {money(opening)} + in {money(totalIn)} − out {money(totalOut)}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <div className="text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl">{money(expected)}</div>
        {children}
      </div>
    </div>
  );
}

export function CashDrawerCard({ totals, openingCash, expectedCash, money, action }: { totals: DayTotals; openingCash: number; expectedCash: number; money: Money; action?: ReactNode }) {
  const { inflows, outflows, totalIn, totalOut } = cashFlows(totals);
  return (
    <Card title="Cash drawer" icon={Banknote} subtitle="What should be in the drawer right now">
      <div className="space-y-5 p-5">
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
          <span className="font-medium text-slate-600">Opening cash</span>
          <span className="font-bold tabular-nums text-slate-900">{money(openingCash)}</span>
        </div>
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          <FlowList title="Cash in" icon={ArrowDownLeft} tone="in" rows={inflows} total={totalIn} money={money} />
          <FlowList title="Cash out" icon={ArrowUpRight} tone="out" rows={outflows} total={totalOut} money={money} />
        </div>
        <ExpectedCashBar opening={openingCash} totalIn={totalIn} totalOut={totalOut} expected={expectedCash} money={money}>{action}</ExpectedCashBar>
      </div>
      <div className="border-t border-slate-100 p-5">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Other payment methods</div>
        <PaymentSummary totals={totals} money={money} />
      </div>
    </Card>
  );
}

export function CashDrawerSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-white" aria-hidden="true">
      <div className="flex items-center gap-2 px-5 py-4"><Bone className="h-5 w-5 rounded-md" /><Bone className="h-4 w-32" /></div>
      <div className="space-y-5 border-t border-slate-100 p-5">
        <Bone className="h-11 w-full rounded-xl" />
        <SummaryPanelSkeleton rows={4} />
        <Bone className="h-20 w-full rounded-2xl" />
      </div>
      <div className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-3">{[0, 1, 2].map((i) => <Bone key={i} className="h-[74px] rounded-xl" />)}</div>
    </div>
  );
}
