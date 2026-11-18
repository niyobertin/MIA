import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatDateTime, formatMoney, humanize } from '../lib/format';
import { Badge, Button, DataTable, Dialog, PagedTable, QueryBoundary, ReasonAction, Skeleton } from '../ui/kit';
import { LIST_KEYS } from '../ui/forms';
import { useDashboard } from './BusinessApp';

type Row = Record<string, any>;
const rowId = (row: Row) => String(row.id);
const dateCell = (value: unknown) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(value as string)}</span>;
const STATUS_TONE: Record<string, 'good' | 'info' | 'warn'> = { paid: 'good', partial: 'info', unpaid: 'warn', credit: 'warn', received: 'good', ordered: 'info' };

export function RowButton({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <Button type="button" aria-label={label} onClick={onClick} className="!px-2.5 !py-1.5 !text-xs whitespace-nowrap">
      {children}
    </Button>
  );
}

/** Keeps one dialog per row action: the button opens it, the dialog closes itself. */
export function useRowDialog<T>() {
  const [row, setRow] = useState<T | null>(null);
  return { row, open: setRow, close: () => setRow(null) };
}

function Summary({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3 text-sm mb-4">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="font-semibold text-slate-900 truncate">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SaleDetailDialog({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  const query = useQuery({ queryKey: ['sale', saleId], queryFn: async () => (await api.get<Row>(`/dashboard/sales/${saleId}`)).data });
  return (
    <Dialog title="Sale details" onClose={onClose} wide>
      <QueryBoundary query={query} skeleton={<Skeleton className="h-40" />}>
        {(sale) => (
          <>
            <Summary items={[
              ['Reference', sale.reference_number ?? '—'],
              ['Date', formatDateTime(sale.sale_date)],
              ['Customer', sale.customer ?? 'Walk-in'],
              ['Recorded by', sale.cashier ?? '—'],
              ['Status', sale.voided ? <Badge key="s" tone="bad">Voided</Badge> : <Badge key="s" tone={STATUS_TONE[sale.payment_status] ?? 'neutral'}>{humanize(sale.payment_status)}</Badge>],
              ['Balance', sale.voided ? '—' : money(Math.max(0, sale.total_amount - sale.paid_amount))],
            ]} />
            <DataTable<Row>
              rows={sale.items}
              rowKey={rowId}
              empty="This sale has no items."
              columns={[
                { header: 'Product', cell: (item) => <span className="font-medium text-slate-900">{item.product ?? '—'}</span> },
                { header: 'Qty', align: 'right', cell: (item) => `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` },
                { header: 'Price', align: 'right', cell: (item) => money(item.selling_price) },
                { header: 'Total', align: 'right', cell: (item) => money(item.total_amount) },
              ]}
            />
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Paid {money(sale.paid_amount)}</span>
              <span className="text-base font-extrabold text-slate-900">Total {money(sale.total_amount)}</span>
            </div>
            {sale.notes ? <p className="mt-3 text-xs text-slate-500">Note: {sale.notes}</p> : null}
            {me.permissions.includes('salesVoid') && !sale.voided && me.day.open ? (
              <div className="mt-4 flex justify-end">
                <ReasonAction label="Void sale" tone="danger" title={`Void ${sale.reference_number ?? 'this sale'}`}
                  description="Stock goes back on the shelf and the money is taken out of today's books. Only sales from the open day can be voided."
                  invalidate={LIST_KEYS} run={(reason) => api.post(`/dashboard/sales/${saleId}/void`, { reason })} onDone={onClose} />
              </div>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </Dialog>
  );
}

export function PurchaseDetailDialog({ purchaseId, onClose }: { purchaseId: string; onClose: () => void }) {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  const query = useQuery({ queryKey: ['purchase', purchaseId], queryFn: async () => (await api.get<Row>(`/dashboard/purchases/${purchaseId}`)).data });
  return (
    <Dialog title="Stock-in details" onClose={onClose} wide>
      <QueryBoundary query={query} skeleton={<Skeleton className="h-40" />}>
        {(purchase) => (
          <>
            <Summary items={[
              ['Reference', purchase.reference_number ?? '—'],
              ['Date', formatDateTime(purchase.purchase_date)],
              ['Supplier', purchase.supplier ?? '—'],
              ['Status', <Badge key="s" tone={STATUS_TONE[purchase.status] ?? 'neutral'}>{humanize(purchase.status)}</Badge>],
              ['Paid', money(purchase.paid_amount)],
              ['Still to pay', money(Math.max(0, purchase.total_amount - purchase.paid_amount))],
            ]} />
            <DataTable<Row>
              rows={purchase.items}
              rowKey={rowId}
              empty="No items on this stock-in."
              columns={[
                { header: 'Product', cell: (item) => <span className="font-medium text-slate-900">{item.product ?? '—'}</span> },
                { header: 'Qty', align: 'right', cell: (item) => `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` },
                { header: 'Unit cost', align: 'right', cell: (item) => money(item.unit_cost) },
                { header: 'Total', align: 'right', cell: (item) => money(item.total_cost) },
              ]}
            />
            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3 text-base font-extrabold text-slate-900">Total {money(purchase.total_amount)}</div>
            {me.permissions.includes('purchasesVoid') && purchase.status !== 'cancelled' && me.day.open ? (
              <div className="mt-4 flex justify-end">
                <ReasonAction label="Cancel stock-in" tone="danger" title={`Cancel ${purchase.reference_number ?? 'this stock-in'}`}
                  description="The stock is taken back off the shelf. Only stock-in from the open day can be cancelled, and only if it has not been sold."
                  invalidate={LIST_KEYS} run={(reason) => api.post(`/dashboard/purchases/${purchaseId}/void`, { reason })} onDone={onClose} />
              </div>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </Dialog>
  );
}

export function CustomerSalesDialog({ customer, onClose }: { customer: Row; onClose: () => void }) {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  const sale = useRowDialog<string>();
  return (
    <Dialog title={`Sales to ${customer.name}`} onClose={onClose} wide>
      <Summary items={[
        ['Phone', customer.phone ?? '—'],
        ['Balance owed', money(customer.balance ?? 0)],
      ]} />
      <PagedTable<Row>
        client={api}
        path="/dashboard/sales"
        queryKey="customer-sales"
        params={{ customer_id: String(customer.id), status: 'all' }}
        rowKey={rowId}
        empty="No sales to this customer yet."
        columns={[
          { header: 'Reference', cell: (row) => <span className="font-semibold text-slate-900">{row.reference_number ?? '—'}</span> },
          { header: 'Status', cell: (row) => row.voided ? <Badge tone="bad">Voided</Badge> : <Badge tone={STATUS_TONE[row.payment_status] ?? 'neutral'}>{humanize(row.payment_status)}</Badge> },
          { header: 'Balance', align: 'right', cell: (row) => row.voided ? '—' : money(Math.max(0, row.total_amount - row.paid_amount)) },
          { header: 'Date', cell: (row) => dateCell(row.sale_date) },
          { header: '', align: 'right', cell: (row) => <RowButton onClick={() => sale.open(String(row.id))}>View</RowButton> },
        ]}
      />
      {sale.row ? <SaleDetailDialog saleId={sale.row} onClose={sale.close} /> : null}
    </Dialog>
  );
}

export function ProductHistoryDialog({ product, onClose }: { product: Row; onClose: () => void }) {
  return (
    <Dialog title={`Stock history: ${product.name}`} onClose={onClose} wide>
      <PagedTable<Row>
        client={api}
        path="/dashboard/movements"
        queryKey="product-movements"
        params={{ product_id: String(product.id) }}
        rowKey={rowId}
        empty="No stock changes for this product yet."
        columns={[
          { header: 'Type', cell: (row) => <span className="font-medium text-slate-900">{humanize(row.type)}</span> },
          { header: 'Quantity', align: 'right', cell: (row) => row.quantity },
          { header: 'New balance', align: 'right', cell: (row) => row.new_quantity },
          { header: 'User', cell: (row) => row.user_name ?? '—' },
          { header: 'Date', cell: (row) => dateCell(row.occurred_at) },
        ]}
      />
    </Dialog>
  );
}
