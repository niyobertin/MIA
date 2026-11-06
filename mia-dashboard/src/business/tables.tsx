import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { formatDateTime, formatMoney, humanize } from '../lib/format';
import { Badge, Card, DataTable, PagedTable, PageHeader, QueryBoundary, Stat } from '../ui/kit';
import { useDashboard } from './BusinessApp';

type Row = Record<string, any>;
const rowId = (row: Row) => String(row.id);
const dateCell = (value: unknown) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(value as string)}</span>;

const STATUS_TONE: Record<string, 'good' | 'info' | 'warn'> = { paid: 'good', partial: 'info', unpaid: 'warn', credit: 'warn' };

export function Sales({ unpaidOnly = false }: { unpaidOnly?: boolean }) {
  const me = useDashboard();
  const own = !me.permissions.includes('salesAll');
  const money = (value: number) => formatMoney(value, me.business.currency);
  return (
    <>
      <PageHeader
        title={unpaidOnly ? 'Unpaid sales' : 'Sales'}
        subtitle={own ? 'Sales you recorded. New sales are made in the MIA app.' : 'New sales are made in the MIA app.'}
      />
      <PagedTable<Row>
        client={api}
        path="/dashboard/sales"
        queryKey="sales"
        params={{ status: unpaidOnly ? 'unpaid' : 'all' }}
        searchPlaceholder="Search reference or customer"
        rowKey={rowId}
        empty={unpaidOnly ? 'No unpaid sales.' : 'No sales yet.'}
        columns={[
          { header: 'Reference', cell: (row) => <span className="font-semibold text-slate-900">{row.reference_number ?? '—'}</span> },
          { header: 'Customer', cell: (row) => row.customer ?? 'Walk-in' },
          { header: 'Recorded by', cell: (row) => row.cashier ?? '—' },
          { header: 'Status', cell: (row) => row.voided ? <Badge tone="bad">Voided</Badge> : <Badge tone={STATUS_TONE[row.payment_status] ?? 'neutral'}>{humanize(row.payment_status)}</Badge> },
          { header: 'Total', align: 'right', cell: (row) => money(row.total_amount) },
          { header: 'Balance', align: 'right', cell: (row) => row.voided ? '—' : money(Math.max(0, row.total_amount - row.paid_amount)) },
          { header: 'Date', cell: (row) => dateCell(row.sale_date) },
        ]}
      />
    </>
  );
}

export function Payments() {
  const me = useDashboard();
  const own = !me.permissions.includes('paymentsAll');
  return (
    <>
      <PageHeader title="Payments" subtitle={own ? 'Payments you recorded.' : undefined} />
      <PagedTable<Row>
        client={api} path="/dashboard/payments" queryKey="payments" rowKey={rowId} empty="No payments yet."
        columns={[
          { header: 'Type', cell: (row) => <span className="font-medium text-slate-900">{humanize(row.type)}</span> },
          { header: 'Method', cell: (row) => humanize(row.payment_method) },
          { header: 'Recorded by', cell: (row) => row.recorded_by ?? '—' },
          { header: 'Amount', align: 'right', cell: (row) => formatMoney(row.amount, me.business.currency) },
          { header: 'Date', cell: (row) => dateCell(row.payment_date) },
        ]}
      />
    </>
  );
}

export function Customers() {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  return (
    <>
      <PageHeader title="Customers" />
      <PagedTable<Row>
        client={api} path="/dashboard/customers" queryKey="customers" rowKey={rowId} searchPlaceholder="Search name or phone" empty="No customers yet."
        columns={[
          { header: 'Name', cell: (row) => <span className="font-semibold text-slate-900">{row.name}</span> },
          { header: 'Phone', cell: (row) => row.phone ?? '—' },
          { header: 'Credit limit', align: 'right', cell: (row) => money(row.credit_limit) },
          { header: 'Balance owed', align: 'right', cell: (row) => row.balance > 0 ? <span className="font-semibold text-rose-700">{money(row.balance)}</span> : money(0) },
        ]}
      />
    </>
  );
}

export function Expenses() {
  const me = useDashboard();
  return (
    <>
      <PageHeader title="Expenses" />
      <PagedTable<Row>
        client={api} path="/dashboard/expenses" queryKey="expenses" rowKey={rowId} empty="No expenses yet."
        columns={[
          { header: 'Category', cell: (row) => <span className="font-medium text-slate-900">{row.category}</span> },
          { header: 'Description', cell: (row) => row.description ?? '—' },
          { header: 'Method', cell: (row) => humanize(row.payment_method) },
          { header: 'Amount', align: 'right', cell: (row) => formatMoney(row.amount, me.business.currency) },
          { header: 'Date', cell: (row) => dateCell(row.expense_date) },
        ]}
      />
    </>
  );
}

export function Products() {
  const me = useDashboard();
  const showCosts = me.permissions.includes('costs');
  const money = (value: number) => formatMoney(value, me.business.currency);
  const query = useQuery({
    queryKey: ['products', me.user.id],
    queryFn: async () => (await api.get<{ rows: Row[] }>('/dashboard/products')).data,
  });
  return (
    <>
      <PageHeader title="Products" subtitle={`Current stock is worked out from recorded stock movements.`} />
      <Card>
        <div className={query.isError ? 'p-4' : ''}>
          <QueryBoundary query={query}>
            {(data) => (
              <DataTable
                rows={data.rows}
                rowKey={rowId}
                empty="No products yet."
                columns={[
                  { header: 'Product', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{row.sku ?? ''}</div></div> },
                  { header: 'Category', cell: (row) => row.category ?? '—' },
                  { header: 'In stock', align: 'right', cell: (row) => row.track_inventory ? <Badge tone={row.stock <= row.reorder_level ? 'warn' : 'neutral'}>{row.stock} {row.unit}</Badge> : '—' },
                  { header: 'Selling price', align: 'right', cell: (row) => money(row.selling_price) },
                  ...(showCosts ? [{ header: 'Average cost', align: 'right' as const, cell: (row: Row) => money(row.average_cost) }] : []),
                ]}
              />
            )}
          </QueryBoundary>
        </div>
      </Card>
    </>
  );
}

export function Purchases() {
  const me = useDashboard();
  return (
    <>
      <PageHeader title="Stock-in" subtitle="Purchases from suppliers. New stock is recorded in the MIA app." />
      <PagedTable<Row>
        client={api} path="/dashboard/purchases" queryKey="purchases" rowKey={rowId} empty="No purchases yet."
        columns={[
          { header: 'Reference', cell: (row) => <span className="font-semibold text-slate-900">{row.reference_number ?? '—'}</span> },
          { header: 'Supplier', cell: (row) => row.supplier ?? '—' },
          { header: 'Status', cell: (row) => <Badge>{humanize(row.status)}</Badge> },
          { header: 'Total', align: 'right', cell: (row) => formatMoney(row.total_amount, me.business.currency) },
          { header: 'Paid', align: 'right', cell: (row) => formatMoney(row.paid_amount, me.business.currency) },
          { header: 'Date', cell: (row) => dateCell(row.purchase_date) },
        ]}
      />
    </>
  );
}

export function Movements() {
  return (
    <>
      <PageHeader title="Stock movements" />
      <PagedTable<Row>
        client={api} path="/dashboard/movements" queryKey="movements" rowKey={rowId} empty="No stock movements yet."
        columns={[
          { header: 'Product', cell: (row) => <span className="font-medium text-slate-900">{row.product ?? '—'}</span> },
          { header: 'Type', cell: (row) => humanize(row.type) },
          { header: 'Quantity', align: 'right', cell: (row) => row.quantity },
          { header: 'New balance', align: 'right', cell: (row) => row.new_quantity },
          { header: 'User', cell: (row) => row.user_name ?? '—' },
          { header: 'Date', cell: (row) => dateCell(row.occurred_at) },
        ]}
      />
    </>
  );
}

export function StockReport() {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  const query = useQuery({
    queryKey: ['stock-report', me.user.id],
    queryFn: async () => (await api.get<{ total_value: number; low_count: number; rows: Row[] }>('/dashboard/stock-report')).data,
  });
  return (
    <>
      <PageHeader title="Stock report" />
      <QueryBoundary query={query}>
        {(data) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat label="Stock value" value={money(data.total_value)} hint="At average cost" />
              <Stat label="Low-stock items" value={data.low_count} />
            </div>
            <Card>
              <DataTable
                rows={data.rows}
                rowKey={rowId}
                empty="No tracked products yet."
                columns={[
                  { header: 'Product', cell: (row) => <span className="font-semibold text-slate-900">{row.name}</span> },
                  { header: 'In stock', align: 'right', cell: (row) => row.low ? <Badge tone="warn">{row.stock} {row.unit}</Badge> : `${row.stock} ${row.unit}` },
                  { header: 'Reorder at', align: 'right', cell: (row) => row.reorder_level },
                  { header: 'Average cost', align: 'right', cell: (row) => money(row.average_cost) },
                  { header: 'Value', align: 'right', cell: (row) => money(row.stock_value) },
                ]}
              />
            </Card>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
