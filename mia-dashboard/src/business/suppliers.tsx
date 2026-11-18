import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatMoney } from '../lib/format';
import { Badge, PagedTable, PageHeader, Stat } from '../ui/kit';
import { LIST_KEYS, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';
import { RowButton, useRowDialog } from './details';
import { PartyPaymentDialog, SupplierDialog } from './partyForms';
import { AddButton, StatRow } from './tables';

type Row = Record<string, any>;

export function Suppliers() {
  const me = useDashboard();
  const money = (n: number) => formatMoney(n, me.business.currency);
  const canWrite = me.permissions.includes('suppliersWrite');
  const canPay = me.permissions.includes('paymentsWrite') && me.day.open;
  const canDeactivate = canWrite && me.user.role !== 'CASHIER';
  const edit = useRowDialog<Row | 'new'>();
  const pay = useRowDialog<Row>();
  const toggle = useSave('patch', LIST_KEYS);
  const summary = useQuery({
    queryKey: ['suppliers', me.user.id, 'summary'],
    queryFn: async () => (await api.get<{ summary: { active: number; owed: number } }>('/dashboard/suppliers', { params: { limit: 1 } })).data.summary,
  });
  return (
    <>
      <PageHeader title="Suppliers" action={canWrite ? <AddButton onClick={() => edit.open('new')}>Add supplier</AddButton> : undefined} />
      <StatRow>
        <Stat label="Suppliers" value={summary.data?.active ?? '—'} hint="Active" />
        <Stat label="You owe suppliers" value={summary.data ? money(summary.data.owed) : '—'} hint="Stock bought on credit" />
      </StatRow>
      <PagedTable<Row>
        client={api}
        path="/dashboard/suppliers"
        queryKey="suppliers"
        rowKey={(r) => String(r.id)}
        searchPlaceholder="Search name or phone"
        empty="No suppliers yet."
        columns={[
          { header: 'Name', cell: (r) => <div><span className="font-semibold text-slate-900">{r.name}</span>{r.active ? null : <span className="ml-2"><Badge>Inactive</Badge></span>}</div> },
          { header: 'Phone', cell: (r) => r.phone ?? '—' },
          { header: 'You owe', align: 'right', cell: (r) => (r.balance > 0 ? <span className="font-semibold text-rose-700">{money(r.balance)}</span> : money(0)) },
          { header: 'Actions', align: 'right', cell: (r) => (
            <div className="flex justify-end gap-1.5">
              {r.phone ? <a href={`tel:${String(r.phone).replace(/\s+/g, '')}`} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Call</a> : null}
              {canPay && r.balance > 0 ? <RowButton label={`Pay ${r.name}`} onClick={() => pay.open(r)}>Pay</RowButton> : null}
              {canWrite ? <RowButton label={`Edit ${r.name}`} onClick={() => edit.open(r)}>Edit</RowButton> : null}
              {canDeactivate ? (
                <RowButton label={`${r.active ? 'Deactivate' : 'Reactivate'} ${r.name}`} onClick={() => toggle.mutate({ path: `/dashboard/suppliers/${r.id}`, body: { active: !r.active } })}>
                  {r.active ? 'Deactivate' : 'Reactivate'}
                </RowButton>
              ) : null}
            </div>
          ) },
        ]}
      />
      {edit.row ? <SupplierDialog supplier={edit.row === 'new' ? undefined : edit.row} onClose={edit.close} /> : null}
      {pay.row ? <PartyPaymentDialog kind="supplier" party={pay.row} onClose={pay.close} /> : null}
    </>
  );
}
