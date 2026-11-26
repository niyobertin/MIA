import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatMoney } from '../lib/format';
import { Ban, Building2, HandCoins, Pencil, Phone, RotateCcw } from 'lucide-react';
import { ActionMenu } from '../ui/ActionMenu';
import { Badge, PagedTable, PageHeader } from '../ui/kit';
import { MetricCard } from '../ui/metrics';
import { FormError, LIST_KEYS, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';
import { useRowDialog } from './details';
import { PartyPaymentDialog, SupplierDialog } from './partyForms';
import { AddButton, StatRow } from './tables';
import { useListFilters } from '../ui/ListFilters';

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
  const filters = useListFilters({ defaultSort: 'name', defaultDirection: 'asc', sortOptions: [
    { value: 'name', label: 'Name', kind: 'text' },
    { value: 'balance', label: 'You owe', kind: 'number' },
    { value: 'date', label: 'Date added', kind: 'date' },
  ] });
  const summary = useQuery({
    queryKey: ['suppliers', me.user.id, 'summary'],
    queryFn: async () => (await api.get<{ summary: { active: number; owed: number } }>('/dashboard/suppliers', { params: { limit: 1 } })).data.summary,
  });
  return (
    <>
      <PageHeader title="Suppliers" action={canWrite ? <AddButton onClick={() => edit.open('new')}>Add supplier</AddButton> : undefined} />
      <StatRow>
        <MetricCard loading={!summary.data} icon={Building2} tone="green" label="Suppliers" value={summary.data?.active} hint="Active" />
        <MetricCard loading={!summary.data} icon={HandCoins} tone="amber" label="You owe suppliers" value={summary.data ? money(summary.data.owed) : null} hint="Stock bought on credit" />
      </StatRow>
      <PagedTable<Row>
        client={api}
        path="/dashboard/suppliers"
        queryKey="suppliers"
        exportTitle="Suppliers"
        exportStats={(s: { active: number; owed: number }) => [
          { label: 'Suppliers', value: s.active, kind: 'count' },
          { label: 'You owe suppliers', value: s.owed },
        ]}
        rowKey={(r) => String(r.id)}
        searchPlaceholder="Search name or phone"
        empty="No suppliers found."
        params={filters.params}
        toolbar={filters.controls}
        columns={[
          { header: 'Name', cell: (r) => <div><span className="font-semibold text-slate-900">{r.name}</span>{r.active ? null : <span className="ml-2"><Badge>Inactive</Badge></span>}</div> },
          { header: 'Phone', cell: (r) => r.phone ?? '—' },
          { header: 'You owe', align: 'right', cell: (r) => (r.balance > 0 ? <span className="font-semibold text-rose-700">{money(r.balance)}</span> : money(0)), total: (_, t) => <span className="text-rose-700">{money(t?.balance ?? 0)}</span> },
          { header: 'Actions', align: 'right', cell: (r) => (
            <ActionMenu label={`Actions for ${r.name}`} actions={[
              { label: 'Pay supplier', icon: HandCoins, onSelect: () => pay.open(r), hidden: !(canPay && r.balance > 0) },
              { label: 'Call', icon: Phone, onSelect: () => { window.location.href = `tel:${String(r.phone).replace(/\s+/g, '')}`; }, hidden: !r.phone },
              { label: 'Edit', icon: Pencil, onSelect: () => edit.open(r), hidden: !canWrite },
              { label: r.active ? 'Deactivate' : 'Reactivate', icon: r.active ? Ban : RotateCcw, tone: r.active ? 'danger' : undefined, hidden: !canDeactivate, disabled: toggle.isPending, onSelect: () => toggle.mutate({ path: `/dashboard/suppliers/${r.id}`, body: { active: !r.active } }) },
            ]} />
          ) },
        ]}
      />
      {toggle.error ? <div className="mt-3"><FormError error={toggle.error} /></div> : null}
      {edit.row ? <SupplierDialog supplier={edit.row === 'new' ? undefined : edit.row} onClose={edit.close} /> : null}
      {pay.row ? <PartyPaymentDialog kind="supplier" party={pay.row} onClose={pay.close} /> : null}
    </>
  );
}
