import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Moon, PlusCircle, ReceiptText, ShoppingCart, Sun, TrendingUp, Vault } from 'lucide-react';
import { api } from '../lib/auth';
import { formatDate, formatDateTime, formatMoney } from '../lib/format';
import { Amount, Badge, Button, Card, DataTable, Dialog, ErrorNotice, inputClass, PagedTable, PageHeader } from '../ui/kit';
import { useListFilters } from '../ui/ListFilters';
import { StatRow } from './tables';
import { FormError, LIST_KEYS, NumberField, TextField, useSave } from '../ui/forms';
import { MetricCard, MetricGrid } from '../ui/metrics';
import { Bone, KpiGridSkeleton, LoadingRegion } from '../ui/skeleton';
import { useDashboard } from './BusinessApp';
import { ExpenseDialog } from './partyForms';
import { CashDrawerCard, CashDrawerSkeleton, cashFlows, PaymentSummary, type DayTotals } from './cashDrawer';

type StockLine = { product_id: string; name: string; unit: string; opening_qty: number; book_qty: number; unit_cost: number; counted_qty: number | null };
type OpenDayData = { open: true; session: { id: string; session_number: number; opened_at: string | null; business_date: string; opening_cash?: number }; totals?: DayTotals; expectedCash?: number; openWaiterTabs?: number; stock?: StockLine[] };
type DayData = { open: false } | OpenDayData;
type Money = (value: number) => string;

function useDay() {
  const me = useDashboard();
  return useQuery({ queryKey: ['day', me.user.id], queryFn: async () => (await api.get<DayData>('/dashboard/day')).data, refetchInterval: 30000 });
}

function DaySkeleton() {
  return (
    <LoadingRegion label="Loading the day" className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between" aria-hidden="true">
        <div className="flex items-center gap-4">
          <Bone className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2"><Bone className="h-5 w-40" /><Bone className="h-3 w-56" /></div>
        </div>
        <div className="flex flex-wrap gap-2"><Bone className="h-10 w-28 rounded-xl" /><Bone className="h-10 w-36 rounded-xl" /><Bone className="h-10 w-36 rounded-xl" /></div>
      </div>
      <KpiGridSkeleton count={4} />
      <CashDrawerSkeleton />
    </LoadingRegion>
  );
}

export function DayPage() {
  const me = useDashboard();
  const day = useDay();
  return (
    <>
      <PageHeader
        icon={CalendarClock}
        title="Day"
        subtitle="Open the day to sell; close it to count cash and lock the books."
        refreshing={day.isFetching && !day.isLoading}
      />
      {day.isLoading ? <DaySkeleton /> : day.isError && !day.data ? <ErrorNotice error={day.error} onRetry={() => day.refetch()} /> : day.data ? (
        day.data.open ? <OpenDay data={day.data} /> : <ClosedDay canOpen={me.permissions.includes('dayOpen')} />
      ) : null}
      {me.permissions.includes('reports') ? <PastDays /> : null}
    </>
  );
}

function ClosedDay({ canOpen }: { canOpen: boolean }) {
  const me = useDashboard();
  const [cash, setCash] = useState<number | ''>('');
  const save = useSave('post', LIST_KEYS);
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="p-6 lg:col-span-3">
        <div className="mb-5 flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Sun size={26} aria-hidden /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">The day is not open</h2>
              <Badge tone="warn">Closed</Badge>
            </div>
            <p className="text-sm text-muted">Sales, stock-in, expenses and payments need an open day.</p>
          </div>
        </div>
        {canOpen ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ path: '/dashboard/day/open', body: { opening_cash: cash === '' ? 0 : cash } }); }}>
            <NumberField label="Cash in the drawer now" value={cash} onChange={setCash} suffix={me.business.currency} hint="Count the notes and coins before you start." autoFocus />
            <FormError error={save.error} />
            <Button type="submit" tone="primary" className="inline-flex min-h-11 w-full items-center justify-center gap-2" disabled={save.isPending}>
              <Sun size={16} aria-hidden />{save.isPending ? 'Opening…' : 'Start the day'}
            </Button>
          </form>
        ) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Ask a manager or cashier to start the day.</p>}
      </Card>
      <Card title="Before you start" icon={ClipboardCheck} className="lg:col-span-2">
        <ul className="space-y-3 p-5 text-sm text-slate-600">
          <li className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />Count the cash in the drawer and enter it as opening cash.</li>
          <li className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />If someone already opened the day on a phone that is offline, let that phone sync first. Otherwise there will be two open days.</li>
          <li className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />Close the day at the end of business to count cash and lock the books.</li>
        </ul>
      </Card>
    </div>
  );
}

function DayStatusPanel({ data, onExpense, onClose }: { data: OpenDayData; onExpense?: () => void; onClose?: () => void }) {
  const me = useDashboard();
  const action = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors';
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <span className="text-[10px] font-bold uppercase leading-none">Day</span>
            <span className="text-xl font-extrabold leading-tight tabular-nums">{data.session.session_number}</span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">Day #{data.session.session_number}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
                Open
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
              <span>Opened {formatDateTime(data.session.opened_at)}</span>
              <span>Business date {formatDate(data.session.business_date)}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          {me.permissions.includes('salesCreate') ? <Link to="/new-sale" className={`${action} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}><PlusCircle size={16} aria-hidden />New sale</Link> : null}
          {onExpense ? <button type="button" onClick={onExpense} className={`${action} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}><ReceiptText size={16} aria-hidden />Record expense</button> : null}
          {onClose ? <button type="button" onClick={onClose} className={`${action} bg-emerald-700 text-white hover:bg-emerald-800`}><Moon size={16} aria-hidden />Close the day</button> : null}
        </div>
      </div>
      {data.openWaiterTabs ? (
        <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50 px-5 py-2.5 text-sm text-amber-900">
          <AlertTriangle size={15} className="shrink-0" aria-hidden />
          {data.openWaiterTabs} waiter tab(s) are still unpaid.
        </div>
      ) : null}
    </Card>
  );
}

function OpenDay({ data }: { data: OpenDayData }) {
  const me = useDashboard();
  const money = (n: number) => formatMoney(n, me.business.currency);
  const canClose = me.permissions.includes('dayClose');
  const canCount = me.permissions.includes('stockAdjust');
  const [closing, setClosing] = useState(false);
  const [expense, setExpense] = useState(false);
  const t = data.totals;
  const expected = data.expectedCash ?? 0;
  return (
    <div className="space-y-6">
      <DayStatusPanel data={data} onExpense={me.permissions.includes('expensesWrite') ? () => setExpense(true) : undefined} onClose={canClose ? () => setClosing(true) : undefined} />

      {t ? (
        <>
          <MetricGrid>
            <MetricCard icon={ShoppingCart} tone="green" label="Sales" value={money(t.totalSales)} hint={`Credit ${money(t.creditSales)}`} />
            <MetricCard icon={Vault} tone="violet" label="Expected cash" value={money(expected)} hint="What should be in the drawer" />
            <MetricCard icon={ReceiptText} tone="red" label="Expenses" value={money(t.expenses)} hint={`Paid in cash ${money(t.cashExpenses)}`} />
            <MetricCard icon={TrendingUp} tone="blue" label="Net profit" value={money(t.netProfit)} valueTone={t.netProfit < 0 ? 'bad' : 'default'} hint="After cost of goods and expenses" />
          </MetricGrid>
          <CashDrawerCard totals={t} openingCash={data.session.opening_cash ?? 0} expectedCash={expected} money={money} />
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
    <Card title="Count stock (optional)" icon={ClipboardCheck} subtitle="Type what you counted on the shelf. Differences show here; use Products → Adjust to fix the books.">
      <DataTable<StockLine>
        rows={lines}
        rowKey={(l) => l.product_id}
        empty="No counted products."
        columns={[
          { header: 'Product', sortValue: (l) => l.name, cell: (l) => <span className="font-medium text-slate-900">{l.name}</span> },
          { header: 'In the books', align: 'right', sortValue: (l) => l.book_qty, cell: (l) => `${l.book_qty} ${l.unit}` },
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
      {save.error ? <div className="px-5 pb-4"><FormError error={save.error} /></div> : null}
    </Card>
  );
}

const STEPS = ['Review', 'Count cash', 'Confirm'] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-5 flex items-center gap-2" aria-label="Closing steps">
      {STEPS.map((label, index) => {
        const state = index < step ? 'done' : index === step ? 'current' : 'todo';
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${state === 'todo' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-700 text-white'}`}>
              {state === 'done' ? <CheckCircle2 size={15} aria-hidden /> : index + 1}
            </span>
            <span className={`hidden text-xs font-semibold sm:inline ${state === 'todo' ? 'text-slate-400' : 'text-ink'}`}>{label}</span>
            {index < STEPS.length - 1 ? <span className={`h-px flex-1 ${index < step ? 'bg-emerald-600' : 'bg-slate-200'}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2 text-sm ${strong ? 'border-t border-slate-200 pt-3 font-bold text-ink' : 'border-b border-slate-50 text-slate-600'}`}>
      <dt>{label}</dt>
      <dd className={`whitespace-nowrap tabular-nums ${strong ? '' : 'font-semibold text-slate-900'}`}>{value}</dd>
    </div>
  );
}

function VarianceCard({ expected, counted, money }: { expected: number; counted: number | ''; money: Money }) {
  const diff = counted === '' ? null : counted - expected;
  const tone = diff === null ? 'border-slate-200 bg-slate-50 text-slate-500' : diff === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : diff < 0 ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Expected</div>
        <div className="mt-1 text-sm font-bold tabular-nums text-ink">{money(expected)}</div>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Counted</div>
        <div className="mt-1 text-sm font-bold tabular-nums text-ink">{counted === '' ? '—' : money(counted)}</div>
      </div>
      <div className={`rounded-xl border p-3 ${tone}`} aria-live="polite">
        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Variance</div>
        <div className="mt-1 text-sm font-bold tabular-nums">{diff === null ? '—' : diff === 0 ? 'Matches' : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}</div>
      </div>
    </div>
  );
}

function CloseDayDialog({ data, onClose }: { data: OpenDayData; onClose: () => void }) {
  const me = useDashboard();
  const money = (n: number) => formatMoney(n, me.business.currency);
  const [step, setStep] = useState(0);
  const [cash, setCash] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const save = useSave<unknown, { variance: number }>('post', LIST_KEYS);
  const expected = data.expectedCash ?? 0;
  const t = data.totals;
  const diff = cash === '' ? null : cash - expected;
  const flows = t ? cashFlows(t) : null;
  const busy = save.isPending;
  const submit = () => save.mutate({ path: '/dashboard/day/close', body: { actual_cash: cash === '' ? 0 : cash, notes: notes.trim() || null } }, { onSuccess: onClose });

  return (
    <Dialog title={`Close day #${data.session.session_number}`} onClose={busy ? () => undefined : onClose} wide>
      <Stepper step={step} />
      {step === 0 ? (
        <div className="space-y-4">
          {t ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <dl>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Today's results</div>
                <SummaryRow label="Sales" value={money(t.totalSales)} />
                <SummaryRow label="Gross profit" value={<Amount value={t.grossProfit} format={money} signed />} />
                <SummaryRow label="Expenses" value={money(t.expenses)} />
                <SummaryRow label="Net profit" value={<Amount value={t.netProfit} format={money} signed />} strong />
              </dl>
              <dl>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Cash drawer</div>
                <SummaryRow label="Opening cash" value={money(data.session.opening_cash ?? 0)} />
                <SummaryRow label="Cash in" value={`${flows?.totalIn ? '+' : ''}${money(flows?.totalIn ?? 0)}`} />
                <SummaryRow label="Cash out" value={`${flows?.totalOut ? '−' : ''}${money(flows?.totalOut ?? 0)}`} />
                <SummaryRow label="Expected cash" value={money(expected)} strong />
              </dl>
            </div>
          ) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Expected in the drawer: <span className="font-bold">{money(expected)}</span></p>}
          {t ? <PaymentSummary totals={t} money={money} includeCash /> : null}
          {data.openWaiterTabs ? <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />{data.openWaiterTabs} waiter tab(s) are still unpaid. Closing turns them into debt owed by the waiter.</p> : null}
        </div>
      ) : null}

      {step === 1 ? (
        <form id="count-cash" className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (cash !== '') setStep(2); }}>
          <NumberField label="Cash you counted in the drawer" value={cash} onChange={setCash} required suffix={me.business.currency} hint="Count every note and coin. Do not include mobile money or bank payments." autoFocus />
          <VarianceCard expected={expected} counted={cash} money={money} />
          {diff !== null && diff !== 0 ? (
            <p className={`flex gap-2 text-sm ${diff < 0 ? 'text-rose-700' : 'text-amber-800'}`}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              {diff < 0 ? `${money(-diff)} is missing from the drawer.` : `There is ${money(diff)} more than expected.`} Count again, or explain the difference below.
            </p>
          ) : null}
          <TextField label={diff ? 'Why is the cash different? (recommended)' : 'Note (optional)'} value={notes} onChange={setNotes} maxLength={500} />
        </form>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <VarianceCard expected={expected} counted={cash} money={money} />
          {notes.trim() ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Note: </span>{notes.trim()}</p> : null}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Closing locks day #{data.session.session_number}. Sales, expenses and payments for this day can no longer be changed, and a new day must be started before selling again.
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
            <span className="font-medium text-slate-800">I counted the drawer and want to close day #{data.session.session_number}.</span>
          </label>
          <FormError error={save.error} />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
        <Button type="button" className="min-h-11" disabled={busy} onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {step === 0 ? <Button type="button" tone="primary" className="min-h-11" onClick={() => setStep(1)}>Count the cash</Button> : null}
        {step === 1 ? <Button type="submit" form="count-cash" tone="primary" className="min-h-11" disabled={cash === ''}>Review and confirm</Button> : null}
        {step === 2 ? (
          <Button type="button" tone="primary" className="inline-flex min-h-11 items-center justify-center gap-2" disabled={!confirmed || busy || cash === ''} onClick={submit}>
            <Moon size={16} aria-hidden />{busy ? 'Closing…' : 'Close the day'}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}

function PastDays() {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  const filters = useListFilters({ defaultPeriod: { period: 'month' }, sortOptions: [
    { value: 'date', label: 'Date', kind: 'date' },
    { value: 'sales', label: 'Sales', kind: 'number' },
    { value: 'profit', label: 'Net profit', kind: 'number' },
  ] });
  return (
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="text-lg font-extrabold tracking-tight text-ink">Past days</h2>
        <p className="text-[13px] text-muted sm:text-sm">Every day you opened, with what was sold and how the cash count went.</p>
      </div>
      <PagedTable<Record<string, any>>
        client={api}
        path="/dashboard/reports/closings"
        queryKey="closings"
        rowKey={(row) => String(row.id)}
        empty="No days in this period."
        params={filters.params}
        toolbar={filters.controls}
        exportTitle="Past days"
        exportStats={(s: { count: number; sales: number; profit: number; variance: number }) => [
          { label: 'Days', value: s.count, kind: 'count' },
          { label: 'Sales', value: s.sales },
          { label: 'Net profit', value: s.profit },
          { label: 'Cash over / short', value: s.variance },
        ]}
        stats={(s?: { count: number; sales: number; profit: number; variance: number; short_days: number }) => (
          <StatRow>
            <MetricCard loading={!s} icon={CalendarClock} tone="slate" label="Days" value={s?.count.toLocaleString()} hint="In the chosen period" />
            <MetricCard loading={!s} icon={ShoppingCart} tone="green" label="Sales" value={s ? money(s.sales) : null} hint="Closed days only" />
            <MetricCard loading={!s} icon={TrendingUp} tone="blue" label="Net profit" value={s ? money(s.profit) : null} valueTone={s && s.profit < 0 ? 'bad' : 'default'} hint="After expenses" />
            <MetricCard loading={!s} icon={Vault} tone={s && s.variance !== 0 ? 'amber' : 'green'} label="Cash over / short" value={s ? money(s.variance) : null} valueTone={s && s.variance < 0 ? 'bad' : 'default'} hint={s ? `${s.short_days.toLocaleString()} days did not match` : undefined} />
          </StatRow>
        )}
        columns={[
          { header: 'Date', cell: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{formatDate(row.business_date)}</span> },
          { header: 'Day no.', align: 'right', cell: (row) => row.session_number },
          { header: 'Status', cell: (row) => <Badge tone={row.status === 'closed' ? 'good' : 'info'}>{row.status === 'closed' ? 'Closed' : 'Open'}</Badge> },
          { header: 'Sales', align: 'right', cell: (row) => money(row.total_sales) },
          { header: 'Expenses', align: 'right', cell: (row) => money(row.expenses) },
          { header: 'Net profit', align: 'right', cell: (row) => <Amount value={row.net_profit} format={money} signed /> },
          { header: 'Expected cash', align: 'right', cell: (row) => money(row.expected_cash) },
          { header: 'Counted cash', align: 'right', cell: (row) => (row.status === 'closed' ? money(row.actual_cash) : '—') },
          { header: 'Over / short', align: 'right', cell: (row) => (row.status === 'closed' ? <Amount value={row.cash_variance} format={money} signed /> : '—') },
        ]}
      />
    </section>
  );
}
