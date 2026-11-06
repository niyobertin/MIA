import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatMoney, formatNumber, humanize } from '../lib/format';
import { platformApi } from '../lib/platformAuth';
import { Badge, Button, DataTable, Dialog, ErrorNotice, inputClass, PagedTable, PageHeader, QueryBoundary, ReasonAction, Stat } from '../ui/kit';
import { useCan } from './PlatformGate';

type Row = Record<string, any>;

function SubscriptionDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const client = useQueryClient();
  const [plan, setPlan] = useState<string>(row.plan);
  const [status, setStatus] = useState<string>(row.subscription_status);
  const [periodEnd, setPeriodEnd] = useState<string>(row.current_period_end ? String(row.current_period_end).slice(0, 10) : '');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => platformApi.patch(`/billing/${row.id}`, { plan, subscription_status: status, current_period_end: periodEnd || null, reason }),
    onSuccess: async () => {
      await client.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'billing' });
      onClose();
    },
  });
  return (
    <Dialog title={`Subscription for ${row.name}`} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="space-y-3">
        <div><label htmlFor="plan" className="block text-sm font-medium text-slate-700 mb-1.5">Plan</label><input id="plan" required minLength={2} value={plan} onChange={(e) => setPlan(e.target.value)} className={inputClass} /></div>
        <div>
          <label htmlFor="sub-status" className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
          <select id="sub-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div><label htmlFor="period-end" className="block text-sm font-medium text-slate-700 mb-1.5">Paid until</label><input id="period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputClass} /></div>
        <div><label htmlFor="sub-reason" className="block text-sm font-medium text-slate-700 mb-1.5">Reason (saved in the audit log)</label><textarea id="sub-reason" required minLength={5} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></div>
        {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" tone="primary" disabled={mutation.isPending}>Save</Button></div>
      </form>
    </Dialog>
  );
}

function InvoicesDialog({ row, canWrite, onClose }: { row: Row; canWrite: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [amount, setAmount] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const key = ['billing-invoices', row.id];
  const query = useQuery({ queryKey: key, queryFn: async () => (await platformApi.get<{ rows: Row[] }>(`/billing/${row.id}/invoices`)).data });
  const refresh = () => client.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'billing' || q.queryKey[0] === 'billing-invoices' });
  const create = useMutation({
    mutationFn: () => platformApi.post(`/billing/${row.id}/invoices`, { amount: Number(amount), period_start: start, period_end: end }),
    onSuccess: async () => { setAmount(''); setStart(''); setEnd(''); await refresh(); },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate(); };
  const setStatus = (id: string, status: string) => () => platformApi.post(`/billing/invoices/${id}/status`, { status });
  return (
    <Dialog title={`Invoices for ${row.name}`} onClose={onClose}>
      <QueryBoundary query={query}>
        {(data) => (
          <div className="-mx-6">
            <DataTable rows={data.rows} rowKey={(invoice) => invoice.id} empty="No invoices yet." columns={[
              { header: 'Period', cell: (invoice) => <span className="whitespace-nowrap text-xs">{formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}</span> },
              { header: 'Amount', align: 'right', cell: (invoice) => formatMoney(invoice.amount, invoice.currency) },
              { header: 'Status', cell: (invoice) => <Badge tone={invoice.status === 'paid' ? 'good' : invoice.status === 'void' ? 'neutral' : 'warn'}>{humanize(invoice.status)}</Badge> },
              ...(canWrite ? [{ header: '', cell: (invoice: Row) => invoice.status === 'open' ? (
                <div className="flex gap-1">
                  <ReasonAction label="Paid" needsReason={false} title="Mark this invoice as paid" invalidate={['billing', 'billing-invoices']} run={setStatus(invoice.id, 'paid')} />
                  <ReasonAction label="Void" needsReason={false} title="Void this invoice" invalidate={['billing', 'billing-invoices']} run={setStatus(invoice.id, 'void')} />
                </div>
              ) : null }] : []),
            ]} />
          </div>
        )}
      </QueryBoundary>
      {canWrite ? (
        <form onSubmit={submit} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="text-sm font-semibold text-slate-900">New invoice</div>
          <div><label htmlFor="inv-amount" className="block text-sm font-medium text-slate-700 mb-1.5">Amount ({row.currency})</label><input id="inv-amount" type="number" min={1} step={1} required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="inv-start" className="block text-sm font-medium text-slate-700 mb-1.5">From</label><input id="inv-start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></div>
            <div><label htmlFor="inv-end" className="block text-sm font-medium text-slate-700 mb-1.5">To</label><input id="inv-end" type="date" required value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></div>
          </div>
          {create.isError ? <ErrorNotice error={create.error} /> : null}
          <Button type="submit" tone="primary" disabled={create.isPending}>Create invoice</Button>
        </form>
      ) : null}
    </Dialog>
  );
}

export function Billing() {
  const canWrite = useCan('billing:write');
  const [editing, setEditing] = useState<Row | null>(null);
  const [invoices, setInvoices] = useState<Row | null>(null);
  const summary = useQuery({ queryKey: ['billing-summary'], queryFn: async () => (await platformApi.get<{ summary: { open_invoices: number; paid_30d: number } }>('/billing', { params: { limit: 1 } })).data.summary });
  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Plans and invoices tracked by hand. MIA doesn't collect payments here." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label="Open invoices" value={formatNumber(summary.data?.open_invoices)} />
        <Stat label="Paid in 30 days" value={formatNumber(summary.data?.paid_30d)} hint="Invoice totals as recorded" />
      </div>
      <PagedTable<Row>
        client={platformApi} path="/billing" queryKey="billing" rowKey={(row) => row.id} searchPlaceholder="Search business" empty="No businesses match."
        columns={[
          { header: 'Business', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{row.business_code}</div></div> },
          { header: 'Plan', cell: (row) => humanize(row.plan) },
          { header: 'Status', cell: (row) => <Badge tone={row.subscription_status === 'active' ? 'good' : row.subscription_status === 'past_due' ? 'bad' : row.subscription_status === 'trial' ? 'info' : 'neutral'}>{humanize(row.subscription_status)}</Badge> },
          { header: 'Paid until', cell: (row) => formatDate(row.current_period_end) },
          { header: 'Open balance', align: 'right', cell: (row) => formatMoney(row.open_balance, row.currency) },
          { header: 'Actions', align: 'right', cell: (row) => (
            <div className="flex justify-end gap-1.5">
              <Button className="!px-2.5 !py-1.5 !text-xs" onClick={() => setInvoices(row)}>Invoices</Button>
              {canWrite ? <Button className="!px-2.5 !py-1.5 !text-xs" onClick={() => setEditing(row)}>Edit</Button> : null}
            </div>
          ) },
        ]}
      />
      {editing ? <SubscriptionDialog row={editing} onClose={() => setEditing(null)} /> : null}
      {invoices ? <InvoicesDialog row={invoices} canWrite={canWrite} onClose={() => setInvoices(null)} /> : null}
    </>
  );
}
