import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../lib/auth';
import { formatDateTime, formatMoney, humanize } from '../lib/format';
import { Badge, Button, Card, DataTable, inputClass, PagedTable, PageHeader, QueryBoundary, Stat } from '../ui/kit';
import { LIST_KEYS, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';
import { CustomerSalesDialog, ProductHistoryDialog, PurchaseDetailDialog, RowButton, SaleDetailDialog, useRowDialog } from './details';
import { AdjustStockDialog, CategoriesDialog, ProductDialog } from './productForms';
import { CustomerDialog, EXPENSE_CATEGORIES, ExpenseDialog, PartyPaymentDialog } from './partyForms';
import { StockInDialog } from './stockIn';
import { useListFilters } from '../ui/ListFilters';

type Row = Record<string, any>;

function matchesSearch(row: Row, search: string, keys: string[]) {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return keys.some((key) => String(row[key] ?? '').toLowerCase().includes(term));
}
const rowId = (row: Row) => String(row.id);
const dateCell = (value: unknown) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(value as string)}</span>;

const STATUS_TONE: Record<string, 'good' | 'info' | 'warn'> = { paid: 'good', partial: 'info', unpaid: 'warn', credit: 'warn' };

/** Summary numbers for the stat cards, read from the same list endpoint. */
function useSummary<T>(key: string, path: string) {
  const me = useDashboard();
  return useQuery({
    queryKey: [key, me.user.id, 'summary'],
    queryFn: async () => (await api.get<{ summary: T }>(path, { params: { limit: 1 } })).data.summary,
  });
}

export function AddButton({ children, onClick, to }: { children: string; onClick?: () => void; to?: string }) {
  const className = 'inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800';
  if (to) return <Link to={to} className={className}><Plus size={16} aria-hidden />{children}</Link>;
  return <button type="button" onClick={onClick} className={className}><Plus size={16} aria-hidden />{children}</button>;
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

function ToggleActive({ path, active, label }: { path: string; active: boolean; label: string }) {
  const save = useSave('patch', LIST_KEYS);
  return (
    <RowButton label={`${active ? 'Deactivate' : 'Reactivate'} ${label}`} onClick={() => save.mutate({ path, body: { active: !active } })}>
      {save.isPending ? '…' : active ? 'Deactivate' : 'Reactivate'}
    </RowButton>
  );
}

export function Sales({ unpaidOnly = false }: { unpaidOnly?: boolean }) {
  const me = useDashboard();
  const own = !me.permissions.includes('salesAll');
  const money = (value: number) => formatMoney(value, me.business.currency);
  const detail = useRowDialog<string>();
  const filters = useListFilters({ sortOptions: [
    { value: 'date', label: 'Date', kind: 'date' },
    { value: 'amount', label: 'Total', kind: 'number' },
    { value: 'customer', label: 'Customer', kind: 'text' },
    { value: 'reference', label: 'Reference', kind: 'text' },
  ] });
  return (
    <>
      <PageHeader
        title={unpaidOnly ? 'Unpaid sales' : 'Sales'}
        subtitle={own ? 'Sales you recorded.' : undefined}
        action={me.permissions.includes('salesCreate') ? <AddButton to="/new-sale">New sale</AddButton> : undefined}
      />
      <PagedTable<Row>
        client={api}
        path="/dashboard/sales"
        queryKey="sales"
        params={{ status: unpaidOnly ? 'unpaid' : 'all', ...filters.params }}
        toolbar={filters.controls}
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
          { header: 'Actions', align: 'right', cell: (row) => <RowButton label={`View sale ${row.reference_number ?? ''}`} onClick={() => detail.open(String(row.id))}>View</RowButton> },
        ]}
      />
      {detail.row ? <SaleDetailDialog saleId={detail.row} onClose={detail.close} /> : null}
    </>
  );
}

export function Payments() {
  const me = useDashboard();
  const own = !me.permissions.includes('paymentsAll');
  const filters = useListFilters({ sortOptions: [
    { value: 'date', label: 'Date', kind: 'date' },
    { value: 'amount', label: 'Amount', kind: 'number' },
  ] });
  return (
    <>
      <PageHeader title="Payments" subtitle={own ? 'Payments you recorded.' : undefined} />
      <PagedTable<Row>
        client={api} path="/dashboard/payments" queryKey="payments" rowKey={rowId} empty="No payments in this period."
        params={filters.params} toolbar={filters.controls}
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
  const detail = useRowDialog<Row>();
  const edit = useRowDialog<Row | 'new'>();
  const pay = useRowDialog<Row>();
  const canWrite = me.permissions.includes('customersWrite');
  const canPay = me.permissions.includes('paymentsWrite');
  const canDeactivate = canWrite && me.user.role !== 'CASHIER';
  const summary = useSummary<{ active: number; owed: number; debtors: number }>('customers', '/dashboard/customers');
  const filters = useListFilters({ defaultSort: 'name', defaultDirection: 'asc', sortOptions: [
    { value: 'name', label: 'Name', kind: 'text' },
    { value: 'balance', label: 'Balance owed', kind: 'number' },
    { value: 'date', label: 'Date added', kind: 'date' },
  ] });
  return (
    <>
      <PageHeader title="Customers" action={canWrite ? <AddButton onClick={() => edit.open('new')}>Add customer</AddButton> : undefined} />
      <StatRow>
        <Stat label="Customers" value={summary.data?.active ?? '—'} hint="Active" />
        <Stat label="Owed to you" value={summary.data ? money(summary.data.owed) : '—'} hint="All unpaid sales" />
        <Stat label="Customers who owe" value={summary.data?.debtors ?? '—'} />
      </StatRow>
      <PagedTable<Row>
        client={api} path="/dashboard/customers" queryKey="customers" rowKey={rowId} searchPlaceholder="Search name or phone" empty="No customers found."
        params={filters.params} toolbar={filters.controls}
        columns={[
          { header: 'Name', cell: (row) => <div><span className="font-semibold text-slate-900">{row.name}</span>{row.active === false ? <span className="ml-2"><Badge>Inactive</Badge></span> : null}</div> },
          { header: 'Phone', cell: (row) => row.phone ?? '—' },
          { header: 'Credit limit', align: 'right', cell: (row) => money(row.credit_limit) },
          { header: 'Balance owed', align: 'right', cell: (row) => row.balance > 0 ? <span className="font-semibold text-rose-700">{money(row.balance)}</span> : money(0) },
          { header: 'Added', cell: (row) => dateCell(row.created_at) },
          { header: 'Actions', align: 'right', cell: (row) => (
            <div className="flex justify-end gap-1.5">
              {row.phone ? <a href={`tel:${String(row.phone).replace(/\s+/g, '')}`} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Call</a> : null}
              <RowButton label={`Sales to ${row.name}`} onClick={() => detail.open(row)}>Sales</RowButton>
              {canPay && row.balance > 0 ? <RowButton label={`Take payment from ${row.name}`} onClick={() => pay.open(row)}>Take payment</RowButton> : null}
              {canWrite ? <RowButton label={`Edit ${row.name}`} onClick={() => edit.open(row)}>Edit</RowButton> : null}
              {canDeactivate ? <ToggleActive path={`/dashboard/customers/${row.id}`} active={row.active !== false} label={row.name} /> : null}
            </div>
          ) },
        ]}
      />
      {detail.row ? <CustomerSalesDialog customer={detail.row} onClose={detail.close} /> : null}
      {edit.row ? <CustomerDialog customer={edit.row === 'new' ? undefined : edit.row} onClose={edit.close} /> : null}
      {pay.row ? <PartyPaymentDialog kind="customer" party={pay.row} onClose={pay.close} /> : null}
    </>
  );
}

const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));

export function Expenses() {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  const edit = useRowDialog<Row | 'new'>();
  const canWrite = me.permissions.includes('expensesWrite');
  const summary = useSummary<{ today: number; month: number; all_time: number }>('expenses', '/dashboard/expenses');
  const filters = useListFilters({ sortOptions: [
    { value: 'date', label: 'Date', kind: 'date' },
    { value: 'amount', label: 'Amount', kind: 'number' },
    { value: 'category', label: 'Category', kind: 'text' },
  ] });
  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={me.day.open ? undefined : 'Start the day to record an expense.'}
        action={canWrite && me.day.open ? <AddButton onClick={() => edit.open('new')}>Record expense</AddButton> : undefined}
      />
      <StatRow>
        <Stat label="This open day" value={summary.data ? money(summary.data.today) : '—'} />
        <Stat label="This month" value={summary.data ? money(summary.data.month) : '—'} />
        <Stat label="All time" value={summary.data ? money(summary.data.all_time) : '—'} />
      </StatRow>
      <PagedTable<Row>
        client={api} path="/dashboard/expenses" queryKey="expenses" rowKey={rowId} empty="No expenses in this period."
        searchPlaceholder="Search description or category"
        params={filters.params} toolbar={filters.controls}
        columns={[
          { header: 'Category', cell: (row) => <span className="font-medium text-slate-900">{EXPENSE_LABEL[row.category] ?? humanize(row.category)}</span> },
          { header: 'Description', cell: (row) => row.description ?? '—' },
          { header: 'Method', cell: (row) => humanize(row.payment_method) },
          { header: 'Recorded by', cell: (row) => row.recorded_by ?? '—' },
          { header: 'Amount', align: 'right', cell: (row) => money(row.amount) },
          { header: 'Date', cell: (row) => dateCell(row.expense_date) },
          ...(canWrite ? [{ header: 'Actions', align: 'right' as const, cell: (row: Row) => row.editable ? <RowButton label="Edit expense" onClick={() => edit.open(row)}>Edit</RowButton> : <span className="text-xs text-slate-400">Closed day</span> }] : []),
        ]}
      />
      {edit.row ? <ExpenseDialog expense={edit.row === 'new' ? undefined : edit.row} onClose={edit.close} /> : null}
    </>
  );
}

export function Products() {
  const me = useDashboard();
  const showCosts = me.permissions.includes('costs');
  const canSeeHistory = me.permissions.includes('movements');
  const canWrite = me.permissions.includes('productsWrite');
  const canAdjust = me.permissions.includes('stockAdjust') && me.day.open;
  const money = (value: number) => formatMoney(value, me.business.currency);
  const history = useRowDialog<Row>();
  const edit = useRowDialog<Row | 'new'>();
  const adjust = useRowDialog<Row>();
  const [showCategories, setShowCategories] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [search, setSearch] = useState('');
  const filters = useListFilters({ defaultSort: 'name', defaultDirection: 'asc', sortOptions: [
    { value: 'name', label: 'Name', kind: 'text' },
    { value: 'stock', label: 'In stock', kind: 'number' },
    { value: 'price', label: 'Selling price', kind: 'number' },
    { value: 'category', label: 'Category', kind: 'text' },
    { value: 'date', label: 'Date added', kind: 'date' },
  ] });
  const query = useQuery({
    queryKey: ['products', me.user.id],
    queryFn: async () => (await api.get<{ rows: Row[]; summary: { active: number; low_stock: number; out_of_stock: number; stock_value?: number } }>('/dashboard/products')).data,
  });
  const summary = query.data?.summary;
  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Stock is worked out from recorded stock movements."
        action={canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowCategories(true)}>Categories</Button>
            <AddButton onClick={() => edit.open('new')}>Add product</AddButton>
          </div>
        ) : undefined}
      />
      <StatRow>
        <Stat label="Products" value={summary?.active ?? '—'} hint="Active" />
        <Stat label="Running low" value={summary?.low_stock ?? '—'} hint="At or below the warning level" />
        <Stat label="Out of stock" value={summary?.out_of_stock ?? '—'} />
        {showCosts ? <Stat label="Stock value" value={summary?.stock_value != null ? money(summary.stock_value) : '—'} hint="At average cost" /> : null}
      </StatRow>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <input aria-label="Search products" placeholder="Search name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} sm:max-w-xs`} />
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
              Show deactivated
            </label>
          </div>
          {filters.controls}
        </div>
        <div className={query.isError ? 'p-4' : ''}>
          <QueryBoundary query={query}>
            {(data) => (
              <DataTable
                rows={filters.apply(
                  data.rows.filter((row) => (showHidden || row.active) && matchesSearch(row, search, ['name', 'sku', 'barcode', 'category'])),
                  (row) => row.created_at,
                  { name: (row) => row.name, stock: (row) => (row.track_inventory ? row.stock : null), price: (row) => row.selling_price, category: (row) => row.category, date: (row) => row.created_at },
                )}
                rowKey={rowId}
                empty={search || filters.period.period !== 'all' ? 'No products match these filters.' : 'No products yet.'}
                columns={[
                  { header: 'Product', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}{row.active ? null : <span className="ml-2"><Badge>Inactive</Badge></span>}</div><div className="text-xs text-slate-500">{row.sku ?? ''}</div></div> },
                  { header: 'Category', cell: (row) => row.category ?? '—' },
                  { header: 'In stock', align: 'right', cell: (row) => row.track_inventory ? <Badge tone={row.stock <= row.reorder_level ? 'warn' : 'neutral'}>{row.stock} {row.unit}</Badge> : '—' },
                  { header: 'Selling price', align: 'right', cell: (row) => money(row.selling_price) },
                  ...(showCosts ? [{ header: 'Average cost', align: 'right' as const, cell: (row: Row) => money(row.average_cost) }] : []),
                  ...(canSeeHistory || canWrite ? [{ header: 'Actions', align: 'right' as const, cell: (row: Row) => (
                    <div className="flex justify-end gap-1.5">
                      {canWrite ? <RowButton label={`Edit ${row.name}`} onClick={() => edit.open(row)}>Edit</RowButton> : null}
                      {canAdjust && row.track_inventory && row.active ? <RowButton label={`Adjust stock for ${row.name}`} onClick={() => adjust.open(row)}>Adjust</RowButton> : null}
                      {canSeeHistory ? <RowButton label={`Stock history for ${row.name}`} onClick={() => history.open(row)}>History</RowButton> : null}
                      {canWrite ? <ToggleActive path={`/dashboard/products/${row.id}`} active={row.active} label={row.name} /> : null}
                    </div>
                  ) }] : []),
                ]}
              />
            )}
          </QueryBoundary>
        </div>
      </Card>
      {history.row ? <ProductHistoryDialog product={history.row} onClose={history.close} /> : null}
      {edit.row ? <ProductDialog product={edit.row === 'new' ? undefined : edit.row} onClose={edit.close} /> : null}
      {adjust.row ? <AdjustStockDialog product={adjust.row} onClose={adjust.close} /> : null}
      {showCategories ? <CategoriesDialog onClose={() => setShowCategories(false)} /> : null}
    </>
  );
}

export function Purchases() {
  const me = useDashboard();
  const detail = useRowDialog<string>();
  const [adding, setAdding] = useState(false);
  const canCreate = me.permissions.includes('purchasesCreate');
  const filters = useListFilters({ sortOptions: [
    { value: 'date', label: 'Date', kind: 'date' },
    { value: 'amount', label: 'Total', kind: 'number' },
    { value: 'supplier', label: 'Supplier', kind: 'text' },
  ] });
  return (
    <>
      <PageHeader
        title="Stock-in"
        subtitle={me.day.open ? 'Stock bought from suppliers.' : 'Start the day to record new stock.'}
        action={canCreate && me.day.open ? <AddButton onClick={() => setAdding(true)}>New stock-in</AddButton> : undefined}
      />
      <PagedTable<Row>
        client={api} path="/dashboard/purchases" queryKey="purchases" rowKey={rowId} empty="No stock-in in this period."
        searchPlaceholder="Search reference or supplier"
        params={filters.params} toolbar={filters.controls}
        columns={[
          { header: 'Reference', cell: (row) => <span className="font-semibold text-slate-900">{row.reference_number ?? '—'}</span> },
          { header: 'Supplier', cell: (row) => row.supplier ?? '—' },
          { header: 'Status', cell: (row) => <Badge>{humanize(row.status)}</Badge> },
          { header: 'Total', align: 'right', cell: (row) => formatMoney(row.total_amount, me.business.currency) },
          { header: 'Paid', align: 'right', cell: (row) => formatMoney(row.paid_amount, me.business.currency) },
          { header: 'Date', cell: (row) => dateCell(row.purchase_date) },
          { header: 'Actions', align: 'right', cell: (row) => <RowButton label={`View stock-in ${row.reference_number ?? ''}`} onClick={() => detail.open(String(row.id))}>View</RowButton> },
        ]}
      />
      {detail.row ? <PurchaseDetailDialog purchaseId={detail.row} onClose={detail.close} /> : null}
      {adding ? <StockInDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}

export function Movements() {
  const filters = useListFilters({ sortOptions: [
    { value: 'date', label: 'Date', kind: 'date' },
    { value: 'quantity', label: 'Quantity', kind: 'number' },
    { value: 'product', label: 'Product', kind: 'text' },
  ] });
  return (
    <>
      <PageHeader title="Stock movements" />
      <PagedTable<Row>
        client={api} path="/dashboard/movements" queryKey="movements" rowKey={rowId} empty="No stock movements in this period."
        searchPlaceholder="Search product"
        params={filters.params} toolbar={filters.controls}
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
  const filters = useListFilters({ withPeriod: false, defaultSort: 'value', sortOptions: [
    { value: 'value', label: 'Value', kind: 'number' },
    { value: 'stock', label: 'In stock', kind: 'number' },
    { value: 'name', label: 'Name', kind: 'text' },
  ] });
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
              <div className="flex justify-end border-b border-slate-100 p-4">{filters.controls}</div>
              <DataTable
                rows={filters.apply(data.rows, () => null, { value: (row) => row.stock_value, stock: (row) => row.stock, name: (row) => row.name })}
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
