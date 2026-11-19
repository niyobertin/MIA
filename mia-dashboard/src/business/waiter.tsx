import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatDateTime, formatMoney } from '../lib/format';
import { Badge, Button, Dialog, inputClass, PagedTable, PageHeader, QueryBoundary, Skeleton } from '../ui/kit';
import { Select } from '../ui/Select';
import { Field, FormDialog, FormError, LIST_KEYS, MethodButtons, SelectField, TextField, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';
import { RowButton, useRowDialog } from './details';
import { LinesEditor, type Line } from './stockIn';
import { AddButton } from './tables';
import { useListFilters } from '../ui/ListFilters';

type Row = Record<string, any>;
type TabItem = { id: string; product: string; quantity: number; quantity_outstanding: number; selling_price: number; paid_amount: number; created_at: string };
type TabDetail = { id: string; status: string; waiter: string; client_label: string | null; paid_amount: number; total: number; balance: number; created_at: string; items: TabItem[] };

const STATUS: Record<string, { label: string; tone: 'info' | 'warn' | 'good' | 'bad' | 'neutral' }> = {
  draft: { label: 'Open', tone: 'info' },
  partial: { label: 'Part paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'good' },
  debt: { label: 'Debt', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function useWaiters() {
  const me = useDashboard();
  return useQuery({ queryKey: ['waiter-tabs', me.user.id, 'waiters'], queryFn: async () => (await api.get<{ rows: { id: string; name: string; role: string }[] }>('/dashboard/waiters')).data.rows });
}

export function WaiterTabs() {
  const me = useDashboard();
  const money = (n: number) => formatMoney(n, me.business.currency);
  const [status, setStatus] = useState('open');
  const [issuing, setIssuing] = useState(false);
  const open = useRowDialog<string>();
  const filters = useListFilters({ sortOptions: [
    { value: 'date', label: 'Started', kind: 'date' },
    { value: 'total', label: 'Total', kind: 'number' },
    { value: 'waiter', label: 'Waiter', kind: 'text' },
  ] });
  return (
    <>
      <PageHeader
        title="Waiter tabs"
        subtitle="Stock given to waiters. Unpaid tabs become the waiter's debt when the day closes."
        action={(
          <div className="flex flex-wrap gap-2">
            <Select ariaLabel="Show" className="w-40" value={status} onChange={setStatus} options={[
              { value: 'open', label: 'Open tabs' }, { value: 'debt', label: 'Debts' }, { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' },
            ]} />
            {me.day.open ? <AddButton onClick={() => setIssuing(true)}>Give to waiter</AddButton> : null}
          </div>
        )}
      />
      <PagedTable<Row>
        client={api}
        path="/dashboard/waiter-tabs"
        queryKey="waiter-tabs"
        params={{ status, ...filters.params }}
        toolbar={filters.controls}
        rowKey={(r) => String(r.id)}
        empty="No tabs here."
        columns={[
          { header: 'Waiter', cell: (r) => <div><div className="font-semibold text-slate-900">{r.waiter ?? '—'}</div>{r.client_label ? <div className="text-xs font-medium text-emerald-700">Client: {r.client_label}</div> : null}</div> },
          { header: 'Status', cell: (r) => <Badge tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Badge> },
          { header: 'Total', align: 'right', cell: (r) => money(r.total) },
          { header: 'Still to pay', align: 'right', cell: (r) => (r.balance > 0 ? <span className="font-semibold text-rose-700">{money(r.balance)}</span> : money(0)) },
          { header: 'Started', cell: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.created_at)}</span> },
          { header: 'Actions', align: 'right', cell: (r) => <RowButton label={`Open tab for ${r.waiter}`} onClick={() => open.open(String(r.id))}>Open</RowButton> },
        ]}
      />
      {issuing ? <IssueDialog onClose={() => setIssuing(false)} /> : null}
      {open.row ? <TabDialog tabId={open.row} onClose={open.close} /> : null}
    </>
  );
}

function IssueDialog({ onClose, tabId }: { onClose: () => void; tabId?: string }) {
  const waiters = useWaiters();
  const [waiterId, setWaiterId] = useState('');
  const [client, setClient] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [joined, setJoined] = useState<string | null>(null);
  const save = useSave<unknown, { joinedExisting?: boolean }>('post', LIST_KEYS);
  const adding = Boolean(tabId);
  const items = lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, selling_price: l.price }));
  if (joined) {
    return (
      <Dialog title="Added to the open tab" onClose={onClose}>
        <p className="text-sm text-slate-700">{joined} already had an open tab for this client today, so the items were added to it with today's time.</p>
        <div className="mt-4 flex justify-end"><Button tone="primary" onClick={onClose}>OK</Button></div>
      </Dialog>
    );
  }
  return (
    <FormDialog
      title={adding ? 'Add items to tab' : 'Give stock to a waiter'}
      wide
      onClose={onClose}
      busy={save.isPending}
      error={save.error}
      submitLabel={adding ? 'Add items' : 'Give stock'}
      onSubmit={() => save.mutate(
        adding ? { path: `/dashboard/waiter-tabs/${tabId}/items`, body: { items } } : { path: '/dashboard/waiter-tabs', body: { waiter_id: waiterId, client_label: client || null, items } },
        {
          onSuccess: (result) => {
            if (!adding && result?.joinedExisting) setJoined(waiters.data?.find((w) => w.id === waiterId)?.name ?? 'This waiter');
            else onClose();
          },
        },
      )}
    >
      {!adding ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Waiter" value={waiterId} onChange={setWaiterId} required placeholder="Choose a waiter"
            options={(waiters.data ?? []).map((w) => ({ value: w.id, label: w.name, hint: w.role === 'CASHIER' ? 'Cashier' : 'Staff' }))} />
          <TextField label="Client (name or table)" value={client} onChange={setClient} placeholder="e.g. Table 4" maxLength={60} />
        </div>
      ) : null}
      <LinesEditor lines={lines} onChange={setLines} priceLabel="Price" priceOf={(p) => p.selling_price} stockCheck />
      <p className="text-xs text-slate-500">Stock leaves the shelf now. The waiter pays later.</p>
    </FormDialog>
  );
}

function TabDialog({ tabId, onClose }: { tabId: string; onClose: () => void }) {
  const me = useDashboard();
  const money = (n: number) => formatMoney(n, me.business.currency);
  const tab = useQuery({ queryKey: ['waiter-tab', tabId], queryFn: async () => (await api.get<TabDetail>(`/dashboard/waiter-tabs/${tabId}`)).data });
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'mobile_money' | 'bank'>('cash');
  const [adding, setAdding] = useState(false);
  const [returning, setReturning] = useState(false);
  const pay = useSave('post', LIST_KEYS);
  return (
    <Dialog title="Waiter tab" onClose={onClose} wide>
      <QueryBoundary query={tab} skeleton={<Skeleton className="h-48" />}>
        {(t) => {
          const lines = t.items.filter((i) => i.quantity_outstanding > 0);
          const unpaidOf = (ids: string[]) => lines.filter((i) => ids.includes(i.id)).reduce((s, i) => s + Math.max(0, i.quantity_outstanding * i.selling_price - i.paid_amount), 0);
          const payable = ['draft', 'partial', 'debt'].includes(t.status) && t.balance > 0;
          const editable = ['draft', 'partial'].includes(t.status) && me.day.open;
          const toggle = (id: string) => {
            const next = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
            setPicked(next);
            setAmount(String(next.length ? unpaidOf(next) : t.balance));
          };
          const amountValue = Number((amount || String(t.balance)).replace(/\D/g, '')) || 0;
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-slate-50 p-3">
                <div>
                  <div className="font-bold text-slate-900">{t.waiter}</div>
                  {t.client_label ? <div className="text-sm font-medium text-emerald-700">Client: {t.client_label}</div> : null}
                  <div className="text-xs text-slate-500">{formatDateTime(t.created_at)}</div>
                </div>
                <div className="text-right text-sm">
                  <Badge tone={STATUS[t.status]?.tone ?? 'neutral'}>{STATUS[t.status]?.label ?? t.status}</Badge>
                  <div className="mt-1 text-slate-600">Total {money(t.total)} · Paid {money(t.paid_amount)}</div>
                  <div className="font-bold text-slate-900">Still to pay {money(t.balance)}</div>
                </div>
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {lines.map((i) => {
                  const value = i.quantity_outstanding * i.selling_price;
                  const state = i.paid_amount >= value ? 'paid' : i.paid_amount > 0 ? 'part' : 'unpaid';
                  return (
                    <li key={i.id} className="flex items-center gap-3 p-3">
                      {payable && state !== 'paid' ? (
                        <input type="checkbox" aria-label={`Paying for ${i.product}`} checked={picked.includes(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4 accent-emerald-700" />
                      ) : <span className="w-4" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">{i.product}</div>
                        <div className="text-xs text-slate-500">{new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {money(i.selling_price)} × {i.quantity_outstanding}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-semibold tabular-nums">{money(value)}</div>
                        <div className={`text-xs font-semibold ${state === 'paid' ? 'text-emerald-700' : state === 'part' ? 'text-amber-700' : 'text-slate-500'}`}>
                          {state === 'paid' ? 'Paid' : state === 'part' ? `Paid ${money(i.paid_amount)}` : 'Not paid'}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {payable ? (
                <form className="space-y-3 rounded-xl border border-slate-200 p-3" onSubmit={(e) => {
                  e.preventDefault();
                  pay.mutate({ path: `/dashboard/waiter-tabs/${t.id}/payments`, body: { amount: amountValue, method, item_ids: picked } }, { onSuccess: () => { setPicked([]); setAmount(''); } });
                }}>
                  <div className="text-sm font-semibold text-slate-800">Record payment</div>
                  <p className="text-xs text-slate-500">Tick the items being paid and the amount fills in. You can also type any amount.</p>
                  <Field label="Amount">{(id) => <input id={id} inputMode="numeric" value={(amount || String(t.balance)).replace(/\D/g, '') ? Number((amount || String(t.balance)).replace(/\D/g, '')).toLocaleString('en-US') : ''} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} className={`${inputClass} tabular-nums`} />}</Field>
                  <MethodButtons value={method} onChange={(v) => setMethod(v as 'cash' | 'mobile_money' | 'bank')} />
                  <FormError error={pay.error} />
                  <Button type="submit" tone="primary" className="w-full" disabled={pay.isPending || amountValue < 1}>{pay.isPending ? 'Saving…' : `Record ${money(amountValue)}`}</Button>
                </form>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                {editable ? <Button onClick={() => setAdding(true)}>Add items</Button> : null}
                {me.day.open && t.status !== 'cancelled' && lines.length > 0 ? <Button onClick={() => setReturning(true)}>Return items</Button> : null}
              </div>
              {adding ? <IssueDialog tabId={t.id} onClose={() => setAdding(false)} /> : null}
              {returning ? <ReturnDialog tab={t} onClose={() => setReturning(false)} /> : null}
            </div>
          );
        }}
      </QueryBoundary>
    </Dialog>
  );
}

function ReturnDialog({ tab, onClose }: { tab: TabDetail; onClose: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const save = useSave('post', LIST_KEYS);
  const lines = tab.items.filter((i) => i.quantity_outstanding > 0);
  const returns = Object.entries(qty).filter(([, q]) => q > 0).map(([item_id, quantity]) => ({ item_id, quantity }));
  return (
    <FormDialog title="Return items to stock" onClose={onClose} busy={save.isPending} error={save.error} submitLabel="Return"
      onSubmit={() => save.mutate({ path: `/dashboard/waiter-tabs/${tab.id}/returns`, body: { returns, reason: reason || null } }, { onSuccess: onClose })}>
      {lines.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-800">{i.product} <span className="text-xs text-slate-500">(up to {i.quantity_outstanding})</span></span>
          <input inputMode="numeric" aria-label={`Return ${i.product}`} value={qty[i.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.min(i.quantity_outstanding, Number(e.target.value.replace(/\D/g, '')) || 0) }))} className={`${inputClass} !w-20 text-right`} />
        </div>
      ))}
      <TextField label="Reason (optional)" value={reason} onChange={setReason} maxLength={300} />
    </FormDialog>
  );
}
