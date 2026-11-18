import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Moon, Sun } from 'lucide-react';
import { api } from '../lib/auth';
import { formatDateTime, formatMoney } from '../lib/format';
import { Badge, Button, Card, DataTable, inputClass, PageHeader, QueryBoundary, Skeleton, Stat } from '../ui/kit';
import { FormDialog, FormError, LIST_KEYS, NumberField, TextField, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';
import { StatRow } from './tables';
import { ExpenseDialog } from './partyForms';
import { Link } from 'react-router-dom';

type Totals = {
  totalSales: number; cogs: number; grossProfit: number; expenses: number; netProfit: number;
  cashSales: number; momoSales: number; bankSales: number; creditSales: number;
  customerCashPayments: number; otherCashIncome: number; cashPurchases: number; cashExpenses: number; supplierCashPayments: number; withdrawals: number;
};
type StockLine = { product_id: string; name: string; unit: string; opening_qty: number; book_qty: number; unit_cost: number; counted_qty: number | null };
type DayData =
  | { open: false }
  | { open: true; session: { id: string; session_number: number; opened_at: string | null; business_date: string; opening_cash?: number }; totals?: Totals; expectedCash?: number; openWaiterTabs?: number; stock?: StockLine[] };

function useDay() {
  const me = useDashboard();
  return useQuery({ queryKey: ['day', me.user.id], queryFn: async () => (await api.get<DayData>('/dashboard/day')).data, refetchInterval: 30000 });
}

export function DayPage() {
  const me = useDashboard();
  const day = useDay();
  return (
    <>
      <PageHeader title="Day" subtitle="Open the day to sell; close it to count cash and lock the books." />
      <QueryBoundary query={day} skeleton={<Skeleton className="h-72" />}>
        {(data) => (data.open ? <OpenDay data={data} /> : <ClosedDay canOpen={me.permissions.includes('dayOpen')} />)}
      </QueryBoundary>
    </>
  );
}

function ClosedDay({ canOpen }: { canOpen: boolean }) {
  const me = useDashboard();
  const [cash, setCash] = useState<number | ''>('');
  const save = useSave('post', LIST_KEYS);
  return (
    <Card className="mx-auto max-w-lg p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Sun aria-hidden /></span>
        <div>
          <h3 className="text-lg font-bold text-slate-900">The day is not open</h3>
          <p className="text-sm text-slate-500">Sales, stock-in, expenses and payments need an open day.</p>
        </div>
      </div>
      {canOpen ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ path: '/dashboard/day/open', body: { opening_cash: cash === '' ? 0 : cash } }); }}>
          <NumberField label="Cash in the drawer now" value={cash} onChange={setCash} suffix={me.business.currency} hint="Count the notes and coins before you start." autoFocus />
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">If someone already opened the day on a phone that is offline, let that phone sync first. Otherwise there will be two open days.</p>
          <FormError error={save.error} />
          <Button type="submit" tone="primary" className="w-full" disabled={save.isPending}>{save.isPending ? 'Opening…' : 'Start the day'}</Button>
        </form>
      ) : <p className="text-sm text-slate-600">Ask a manager or cashier to start the day.</p>}
    </Card>
  );
}

function OpenDay({ data }: { data: Extract<DayData, { open: true }> }) {
  const me = useDashboard();
  const money = (n: number) => formatMoney(n, me.business.currency);
  const canClose = me.permissions.includes('dayClose');
  const canCount = me.permissions.includes('stockAdjust');
  const [closing, setClosing] = useState(false);
  const [expense, setExpense] = useState(false);
  const t = data.totals;
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden />
          <div>
            <div className="font-bold text-slate-900">Day #{data.session.session_number} is open</div>
            <div className="text-sm text-slate-500">Since {formatDateTime(data.session.opened_at)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {me.permissions.includes('salesCreate') ? <Link to="/new-sale" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">New sale</Link> : null}
          {me.permissions.includes('expensesWrite') ? <Button onClick={() => setExpense(true)}>Record expense</Button> : null}
          {canClose ? <Button tone="primary" onClick={() => setClosing(true)}><Moon size={16} className="mr-1.5 inline" aria-hidden />Close the day</Button> : null}
        </div>
      </Card>

      {t ? (
        <>
          <StatRow>
            <Stat label="Sales" value={money(t.totalSales)} hint={`Credit ${money(t.creditSales)}`} />
            <Stat label="Expected cash" value={money(data.expectedCash ?? 0)} hint="What should be in the drawer" />
            <Stat label="Expenses" value={money(t.expenses)} />
            <Stat label="Net profit" value={money(t.netProfit)} hint="After cost of goods and expenses" />
          </StatRow>
          <Card title="Cash drawer">
            <dl className="grid gap-x-8 gap-y-2 p-5 text-sm sm:grid-cols-2">
              {[
                ['Opening cash', data.session.opening_cash ?? 0, 1],
                ['Cash sales', t.cashSales, 1],
                ['Debt collected in cash', t.customerCashPayments, 1],
                ['Other cash in', t.otherCashIncome, 1],
                ['Stock bought with cash', t.cashPurchases, -1],
                ['Expenses paid in cash', t.cashExpenses, -1],
                ['Suppliers paid in cash', t.supplierCashPayments, -1],
                ['Cash taken out', t.withdrawals, -1],
              ].map(([label, value, sign]) => (
                <div key={label as string} className="flex justify-between border-b border-slate-50 py-1">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className={`font-semibold tabular-nums ${sign === -1 && (value as number) > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{sign === -1 && (value as number) > 0 ? '−' : ''}{money(value as number)}</dd>
                </div>
              ))}
              <div className="flex justify-between pt-2 sm:col-span-2"><dt className="font-bold text-slate-900">Expected in drawer</dt><dd className="text-lg font-extrabold text-slate-900">{money(data.expectedCash ?? 0)}</dd></div>
            </dl>
            <div className="grid grid-cols-3 gap-3 border-t border-slate-100 p-5 text-sm">
              <div><div className="text-slate-500">Mobile money</div><div className="font-bold">{money(t.momoSales)}</div></div>
              <div><div className="text-slate-500">Bank</div><div className="font-bold">{money(t.bankSales)}</div></div>
              <div><div className="text-slate-500">On credit</div><div className="font-bold">{money(t.creditSales)}</div></div>
            </div>
          </Card>
        </>
      ) : null}

      {data.stock && canCount ? <StockCount lines={data.stock} /> : null}
      {closing ? <CloseDayDialog data={data} onClose={() => setClosing(false)} /> : null}
      {expense ? <ExpenseDialog onClose={() => setExpense(false)} /> : null}
    </div>
  );
}

function StockCount({ lines }: { lines: StockLine[] }) {
  const save = useSave('post', ['day']);
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <Card title="Count stock (optional)">
      <p className="px-5 pt-4 text-sm text-slate-500">Type what you counted on the shelf. Differences show here; use Products → Adjust to fix the books.</p>
      <div className="p-2">
        <DataTable<StockLine>
          rows={lines}
          rowKey={(l) => l.product_id}
          empty="No counted products."
          columns={[
            { header: 'Product', cell: (l) => <span className="font-medium text-slate-900">{l.name}</span> },
            { header: 'In the books', align: 'right', cell: (l) => `${l.book_qty} ${l.unit}` },
            { header: 'Counted', align: 'right', cell: (l) => (
              <input
                inputMode="numeric"
                aria-label={`Counted ${l.name}`}
                value={draft[l.product_id] ?? (l.counted_qty == null ? '' : String(l.counted_qty))}
                onChange={(e) => setDraft((d) => ({ ...d, [l.product_id]: e.target.value.replace(/\D/g, '') }))}
                onBlur={() => {
                  const value = draft[l.product_id];
                  if (value === undefined || value === '') return;
                  save.mutate({ path: '/dashboard/day/count', body: { product_id: l.product_id, counted_qty: Number(value) } });
                }}
                className={`${inputClass} !w-24 text-right tabular-nums`}
              />
            ) },
            { header: 'Difference', align: 'right', cell: (l) => {
              const counted = draft[l.product_id] !== undefined && draft[l.product_id] !== '' ? Number(draft[l.product_id]) : l.counted_qty;
              if (counted == null) return '—';
              const diff = counted - l.book_qty;
              return diff === 0 ? <Badge tone="good">Matches</Badge> : <Badge tone="warn">{diff > 0 ? '+' : ''}{diff}</Badge>;
            } },
          ]}
        />
      </div>
      <div className="px-5 pb-4"><FormError error={save.error} /></div>
    </Card>
  );
}

function CloseDayDialog({ data, onClose }: { data: Extract<DayData, { open: true }>; onClose: () => void }) {
  const me = useDashboard();
  const money = (n: number) => formatMoney(n, me.business.currency);
  const [cash, setCash] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const save = useSave<unknown, { variance: number }>('post', LIST_KEYS);
  const expected = data.expectedCash ?? 0;
  const diff = cash === '' ? null : cash - expected;
  return (
    <FormDialog title="Close the day" onClose={onClose} busy={save.isPending} error={save.error} submitLabel="Close the day"
      onSubmit={() => save.mutate({ path: '/dashboard/day/close', body: { actual_cash: cash === '' ? 0 : cash, notes: notes || null } }, { onSuccess: onClose })}>
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Expected in the drawer: <span className="font-bold">{money(expected)}</span></p>
      {data.openWaiterTabs ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{data.openWaiterTabs} waiter tab(s) are still unpaid. Closing turns them into debt owed by the waiter.</p> : null}
      <NumberField label="Cash you counted" value={cash} onChange={setCash} required suffix={me.business.currency} autoFocus />
      {diff != null ? (
        <p className={`text-sm font-semibold ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {diff === 0 ? 'The drawer matches.' : diff < 0 ? `${money(-diff)} missing` : `${money(diff)} extra`}
        </p>
      ) : null}
      <TextField label="Note (optional)" value={notes} onChange={setNotes} maxLength={500} />
    </FormDialog>
  );
}
