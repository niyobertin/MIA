import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Ban, Eye, HandCoins as Pay, Pencil, Phone, RotateCcw, ScrollText, SlidersHorizontal, ArrowDownLeft, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ArrowUpRight, Boxes, CalendarDays, CalendarRange, CircleCheck, CreditCard, HandCoins, History, PackageSearch, PackageX, Plus, Receipt, Scale, ShoppingCart, Truck, Users, Warehouse } from 'lucide-react';
import { api } from '../lib/auth';
import { formatDateTime, formatMoney, humanize } from '../lib/format';
import { Badge, Button, Card, DataTable, inputClass, PagedTable, PageHeader, QueryBoundary, type Column } from '../ui/kit';
import { MetricCard } from '../ui/metrics';
import { ActionMenu } from '../ui/ActionMenu';
import { ExportMenu } from '../ui/ExportMenu';
import { rowsToTable } from '../lib/exportData';
import { KpiGridSkeleton, TableSkeleton } from '../ui/skeleton';
import { FormError, LIST_KEYS, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';
import { CustomerSalesDialog, ProductHistoryDialog, PurchaseDetailDialog, SaleDetailDialog, useRowDialog } from './details';
import { AdjustStockDialog, CategoriesDialog, ProductDialog } from './productForms';
import { CustomerDialog, EXPENSE_CATEGORIES, ExpenseDialog, PartyPaymentDialog } from './partyForms';
import { StockInDialog } from './stockIn';
import { PeriodFilter, type PeriodValue } from '../ui/PeriodFilter';
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
  return <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function callNumber(phone: unknown) {
  window.location.href = `tel:${String(phone).replace(/\s+/g, '')}`;
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
        exportTitle={unpaidOnly ? 'Unpaid sales' : 'Sales'}
        exportStats={(s: { count: number; total: number; paid: number; outstanding: number }) => [
          { label: 'Sales', value: s.count, kind: 'count' },
          { label: 'Total value', value: s.total },
          { label: 'Collected', value: s.paid },
          { label: 'Still owed', value: s.outstanding },
        ]}
        rowKey={rowId}
        empty={unpaidOnly ? 'No unpaid sales.' : 'No sales yet.'}
        stats={(s?: { count: number; total: number; paid: number; outstanding: number; unpaid_count: number }) => (
          <StatRow>
            <MetricCard loading={!s} icon={ShoppingCart} tone="green" label={unpaidOnly ? 'Unpaid sales' : 'Sales'} value={s?.count.toLocaleString()} hint={unpaidOnly ? 'In the chosen period' : s ? `${s.unpaid_count.toLocaleString()} not fully paid` : undefined} />
            <MetricCard loading={!s} icon={Receipt} tone="blue" label="Total value" value={s ? money(s.total) : null} hint="Cancelled sales not counted" />
            <MetricCard loading={!s} icon={CircleCheck} tone="green" label="Collected" value={s ? money(s.paid) : null} hint="Paid on these sales" />
            <MetricCard loading={!s} icon={HandCoins} tone="amber" label="Still owed" value={s ? money(s.outstanding) : null} hint="By customers" />
          </StatRow>
        )}
        columns={[
          { header: 'Reference', cell: (row) => <span className="font-semibold text-slate-900">{row.reference_number ?? '—'}</span> },
          { header: 'Customer', cell: (row) => row.customer ?? 'Walk-in' },
          { header: 'Recorded by', cell: (row) => row.cashier ?? '—' },
          { header: 'Status', cell: (row) => row.voided ? <Badge tone="bad">Voided</Badge> : <Badge tone={STATUS_TONE[row.payment_status] ?? 'neutral'}>{humanize(row.payment_status)}</Badge> },
          { header: 'Total', align: 'right', primary: true, cell: (row) => money(row.total_amount) },
          { header: 'Balance', align: 'right', cell: (row) => row.voided ? '—' : money(Math.max(0, row.total_amount - row.paid_amount)) },
          { header: 'Date', cell: (row) => dateCell(row.sale_date) },
          { header: 'Actions', align: 'right', cell: (row) => <ActionMenu label={`Actions for sale ${row.reference_number ?? ''}`} actions={[{ label: 'View sale', icon: Eye, onSelect: () => detail.open(String(row.id)) }]} /> },
        ]}
      />
      {detail.row ? <SaleDetailDialog saleId={detail.row} onClose={detail.close} /> : null}
    </>
  );
}

export function Payments() {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
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
        exportTitle="Payments"
        exportStats={(s: { count: number; money_in: number; money_out: number }) => [
          { label: 'Payments', value: s.count, kind: 'count' },
          { label: 'Money in', value: s.money_in },
          { label: 'Money out', value: s.money_out },
          { label: 'Net', value: s.money_in - s.money_out },
        ]}
        params={filters.params} toolbar={filters.controls}
        stats={(s?: { count: number; money_in: number; money_out: number }) => (
          <StatRow>
            <MetricCard loading={!s} icon={CreditCard} tone="slate" label="Payments" value={s?.count.toLocaleString()} hint="In the chosen period" />
            <MetricCard loading={!s} icon={ArrowDownLeft} tone="green" label="Money in" value={s ? money(s.money_in) : null} hint="Sales, customers, other income" />
            <MetricCard loading={!s} icon={ArrowUpRight} tone="red" label="Money out" value={s ? money(s.money_out) : null} hint="Suppliers, expenses, withdrawals" />
            <MetricCard loading={!s} icon={Scale} tone="blue" label="Net" value={s ? money(s.money_in - s.money_out) : null} valueTone={s && s.money_in - s.money_out < 0 ? 'bad' : 'default'} hint="Money in less money out" />
          </StatRow>
        )}
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
  const toggle = useSave('patch', LIST_KEYS);
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
        <MetricCard loading={!summary.data} icon={Users} tone="green" label="Customers" value={summary.data?.active} hint="Active" />
        <MetricCard loading={!summary.data} icon={HandCoins} tone="amber" label="Owed to you" value={summary.data ? money(summary.data.owed) : null} hint="All unpaid sales" />
        <MetricCard loading={!summary.data} icon={AlertTriangle} tone="red" label="Customers who owe" value={summary.data?.debtors} hint="With an unpaid balance" />
      </StatRow>
      <PagedTable<Row>
        client={api} path="/dashboard/customers" queryKey="customers" rowKey={rowId} searchPlaceholder="Search name or phone" empty="No customers found."
        exportTitle="Customers"
        exportStats={(s: { active: number; owed: number; debtors: number }) => [
          { label: 'Customers', value: s.active, kind: 'count' },
          { label: 'Owed to you', value: s.owed },
          { label: 'Customers who owe', value: s.debtors, kind: 'count' },
        ]}
        params={filters.params} toolbar={filters.controls}
        columns={[
          { header: 'Name', cell: (row) => <div><span className="font-semibold text-slate-900">{row.name}</span>{row.active === false ? <span className="ml-2"><Badge>Inactive</Badge></span> : null}</div> },
          { header: 'Phone', cell: (row) => row.phone ?? '—' },
          { header: 'Credit limit', align: 'right', cell: (row) => money(row.credit_limit) },
          { header: 'Balance owed', align: 'right', cell: (row) => row.balance > 0 ? <span className="font-semibold text-rose-700">{money(row.balance)}</span> : money(0) },
          { header: 'Added', cell: (row) => dateCell(row.created_at) },
          { header: 'Actions', align: 'right', cell: (row) => (
            <ActionMenu label={`Actions for ${row.name}`} actions={[
              { label: 'Sales history', icon: ScrollText, onSelect: () => detail.open(row) },
              { label: 'Take payment', icon: Pay, onSelect: () => pay.open(row), hidden: !(canPay && row.balance > 0) },
              { label: 'Call', icon: Phone, onSelect: () => callNumber(row.phone), hidden: !row.phone },
              { label: 'Edit', icon: Pencil, onSelect: () => edit.open(row), hidden: !canWrite },
              { label: row.active !== false ? 'Deactivate' : 'Reactivate', icon: row.active !== false ? Ban : RotateCcw, tone: row.active !== false ? 'danger' : undefined, hidden: !canDeactivate, disabled: toggle.isPending, onSelect: () => toggle.mutate({ path: `/dashboard/customers/${row.id}`, body: { active: row.active === false } }) },
            ]} />
          ) },
        ]}
      />
      {toggle.error ? <div className="mt-3"><FormError error={toggle.error} /></div> : null}
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
        <MetricCard loading={!summary.data} icon={CalendarDays} tone="red" label="This open day" value={summary.data ? money(summary.data.today) : null} hint="Recorded since the day opened" />
        <MetricCard loading={!summary.data} icon={CalendarRange} tone="amber" label="This month" value={summary.data ? money(summary.data.month) : null} hint="Since the 1st of the month" />
        <MetricCard loading={!summary.data} icon={History} tone="slate" label="All time" value={summary.data ? money(summary.data.all_time) : null} hint="Every recorded expense" />
      </StatRow>
      <PagedTable<Row>
        client={api} path="/dashboard/expenses" queryKey="expenses" rowKey={rowId} empty="No expenses in this period."
        exportTitle="Expenses"
        searchPlaceholder="Search description or category"
        params={filters.params} toolbar={filters.controls}
        columns={[
          { header: 'Category', cell: (row) => <span className="font-medium text-slate-900">{EXPENSE_LABEL[row.category] ?? humanize(row.category)}</span> },
          { header: 'Description', cell: (row) => row.description ?? '—' },
          { header: 'Method', cell: (row) => humanize(row.payment_method) },
          { header: 'Recorded by', cell: (row) => row.recorded_by ?? '—' },
          { header: 'Amount', align: 'right', cell: (row) => money(row.amount) },
          { header: 'Date', cell: (row) => dateCell(row.expense_date) },
          ...(canWrite ? [{ header: 'Actions', align: 'right' as const, cell: (row: Row) => row.editable ? <ActionMenu label="Expense actions" actions={[{ label: 'Edit expense', icon: Pencil, onSelect: () => edit.open(row) }]} /> : <span className="text-xs text-slate-400">Closed day</span> }] : []),
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
  const toggle = useSave('patch', LIST_KEYS);
  const visibleRows = (rows: Row[]) => filters.apply(
    rows.filter((row) => (showHidden || row.active) && matchesSearch(row, search, ['name', 'sku', 'barcode', 'category'])),
    (row) => row.created_at,
    { name: (row) => row.name, stock: (row) => (row.track_inventory ? row.stock : null), price: (row) => row.selling_price, category: (row) => row.category, date: (row) => row.created_at },
  );
  const productColumns: Column<Row>[] = [
                  { header: 'Product', cell: (row) => <div><div className="font-semibold text-slate-900">{row.name}{row.active ? null : <span className="ml-2"><Badge>Inactive</Badge></span>}</div><div className="text-xs text-slate-500">{row.sku ?? ''}</div></div> },
                  { header: 'Category', cell: (row) => row.category ?? '—' },
                  { header: 'In stock', align: 'right', primary: true, cell: (row) => row.track_inventory ? <Badge tone={row.stock <= row.reorder_level ? 'warn' : 'neutral'}>{row.stock} {row.unit}</Badge> : '—' },
                  { header: 'Selling price', align: 'right', cell: (row) => money(row.selling_price) },
                  ...(showCosts ? [{ header: 'Average cost', align: 'right' as const, cell: (row: Row) => money(row.average_cost) }] : []),
                  ...(canSeeHistory || canWrite ? [{ header: 'Actions', align: 'right' as const, cell: (row: Row) => (
                    <ActionMenu label={`Actions for ${row.name}`} actions={[
                      { label: 'Edit product', icon: Pencil, onSelect: () => edit.open(row), hidden: !canWrite },
                      { label: 'Adjust stock', icon: SlidersHorizontal, onSelect: () => adjust.open(row), hidden: !(canAdjust && row.track_inventory && row.active) },
                      { label: 'Stock history', icon: History, onSelect: () => history.open(row), hidden: !canSeeHistory },
                      { label: row.active ? 'Deactivate' : 'Reactivate', icon: row.active ? Ban : RotateCcw, tone: row.active ? 'danger' : undefined, hidden: !canWrite, disabled: toggle.isPending, onSelect: () => toggle.mutate({ path: `/dashboard/products/${row.id}`, body: { active: !row.active } }) },
                    ]} />
                  ) }] : []),
  ];
  const exportProducts = async () => ({
    businessName: me.business.name,
    currency: me.business.currency,
    title: 'Products',
    period: filters.period,
    stats: summary ? [
      { label: 'Products', value: summary.active, kind: 'count' as const },
      { label: 'Running low', value: summary.low_stock, kind: 'count' as const },
      { label: 'Out of stock', value: summary.out_of_stock, kind: 'count' as const },
      ...(showCosts && summary.stock_value != null ? [{ label: 'Stock value', value: summary.stock_value }] : []),
    ] : [],
    tables: [await rowsToTable('Products', productColumns, visibleRows(query.data?.rows ?? []))],
  });
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
        <MetricCard loading={!summary} icon={PackageSearch} tone="green" label="Products" value={summary?.active} hint="Active" />
        <MetricCard loading={!summary} icon={AlertTriangle} tone="amber" label="Running low" value={summary?.low_stock} hint="At or below the warning level" />
        <MetricCard loading={!summary} icon={PackageX} tone="red" label="Out of stock" value={summary?.out_of_stock} hint="Nothing left to sell" />
        {showCosts ? <MetricCard loading={!summary} icon={Warehouse} tone="blue" label="Stock value" value={summary?.stock_value != null ? money(summary.stock_value) : '—'} hint="At average cost" /> : null}
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
          <div className="flex flex-wrap items-center gap-2">{filters.controls}<ExportMenu build={exportProducts} disabled={!query.data} /></div>
        </div>
        {toggle.error ? <div className="px-4 pt-4"><FormError error={toggle.error} /></div> : null}
        <div className={query.isError ? 'p-4' : ''}>
          <QueryBoundary query={query} skeleton={<TableSkeleton rows={8} columns={[{ header: 'Product' }, { header: 'Category' }, { header: 'In stock', align: 'right' }, { header: 'Selling price', align: 'right' }, ...(showCosts ? [{ header: 'Average cost', align: 'right' as const }] : []), { header: 'Actions', align: 'right' }]} />}>
            {(data) => (
              <DataTable
                rows={visibleRows(data.rows)}
                rowKey={rowId}
                empty={search || filters.period.period !== 'all' ? 'No products match these filters.' : 'No products yet.'}
                columns={productColumns}
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
        exportTitle="Stock-in"
        exportStats={(s: { count: number; total: number; paid: number; owed: number }) => [
          { label: 'Stock-ins', value: s.count, kind: 'count' },
          { label: 'Total bought', value: s.total },
          { label: 'Paid', value: s.paid },
          { label: 'Still owed', value: s.owed },
        ]}
        searchPlaceholder="Search reference or supplier"
        params={filters.params} toolbar={filters.controls}
        stats={(s?: { count: number; total: number; paid: number; owed: number }) => (
          <StatRow>
            <MetricCard loading={!s} icon={Truck} tone="green" label="Stock-ins" value={s?.count.toLocaleString()} hint="In the chosen period" />
            <MetricCard loading={!s} icon={Receipt} tone="blue" label="Total bought" value={s ? formatMoney(s.total, me.business.currency) : null} hint="Cancelled stock-ins not counted" />
            <MetricCard loading={!s} icon={CircleCheck} tone="green" label="Paid" value={s ? formatMoney(s.paid, me.business.currency) : null} hint="Paid to suppliers" />
            <MetricCard loading={!s} icon={HandCoins} tone="amber" label="Still owed" value={s ? formatMoney(s.owed, me.business.currency) : null} hint="To suppliers" />
          </StatRow>
        )}
        columns={[
          { header: 'Reference', cell: (row) => <span className="font-semibold text-slate-900">{row.reference_number ?? '—'}</span> },
          { header: 'Supplier', cell: (row) => row.supplier ?? '—' },
          { header: 'Status', cell: (row) => <Badge>{humanize(row.status)}</Badge> },
          { header: 'Total', align: 'right', primary: true, cell: (row) => formatMoney(row.total_amount, me.business.currency) },
          { header: 'Paid', align: 'right', cell: (row) => formatMoney(row.paid_amount, me.business.currency) },
          { header: 'Date', cell: (row) => dateCell(row.purchase_date) },
          { header: 'Actions', align: 'right', cell: (row) => <ActionMenu label={`Actions for stock-in ${row.reference_number ?? ''}`} actions={[{ label: 'View stock-in', icon: Eye, onSelect: () => detail.open(String(row.id)) }]} /> },
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
        exportTitle="Stock movements"
        exportStats={(s: { count: number; qty_in: number; qty_out: number; products: number }) => [
          { label: 'Movements', value: s.count, kind: 'count' },
          { label: 'Units in', value: s.qty_in, kind: 'count' },
          { label: 'Units out', value: s.qty_out, kind: 'count' },
          { label: 'Products moved', value: s.products, kind: 'count' },
        ]}
        searchPlaceholder="Search product"
        params={filters.params} toolbar={filters.controls}
        stats={(s?: { count: number; qty_in: number; qty_out: number; products: number }) => (
          <StatRow>
            <MetricCard loading={!s} icon={ArrowLeftRight} tone="slate" label="Movements" value={s?.count.toLocaleString()} hint="In the chosen period" />
            <MetricCard loading={!s} icon={ArrowDownToLine} tone="green" label="Units in" value={s?.qty_in.toLocaleString()} hint="Stock-in, returns, increases" />
            <MetricCard loading={!s} icon={ArrowUpFromLine} tone="red" label="Units out" value={s?.qty_out.toLocaleString()} hint="Sales, damage, decreases" />
            <MetricCard loading={!s} icon={Boxes} tone="blue" label="Products moved" value={s?.products.toLocaleString()} hint="Different products" />
          </StatRow>
        )}
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

const STOCK_REPORT_SKELETON: Pick<Column<unknown>, 'header' | 'align'>[] = [{ header: 'Product' }, { header: 'Opening', align: 'right' }, { header: 'In', align: 'right' }, { header: 'Out', align: 'right' }, { header: 'Closing', align: 'right' }, { header: 'Value', align: 'right' }];

export function StockReport() {
  const me = useDashboard();
  const money = (value: number) => formatMoney(value, me.business.currency);
  const [period, setPeriod] = useState<PeriodValue>({ period: 'today' });
  const params = period.period === 'custom' ? { period: 'custom', from: period.from, to: period.to } : { period: period.period };
  const query = useQuery({
    queryKey: ['stock-report', me.user.id, params],
    queryFn: async () => (await api.get<{ total_value: number; low_count: number; qty_in: number; qty_out: number; rows: Row[] }>('/dashboard/stock-report', { params })).data,
    placeholderData: keepPreviousData,
  });
  const filters = useListFilters({ withPeriod: false, defaultSort: 'value', sortOptions: [
    { value: 'value', label: 'Value', kind: 'number' },
    { value: 'stock', label: 'Closing stock', kind: 'number' },
    { value: 'moved', label: 'Units sold / out', kind: 'number' },
    { value: 'name', label: 'Name', kind: 'text' },
  ] });
  const columns: Column<Row>[] = [
    { header: 'Product', cell: (row) => <span className="font-semibold text-slate-900">{row.name}</span> },
    { header: 'Opening', align: 'right', cell: (row) => `${row.opening} ${row.unit}` },
    { header: 'In', align: 'right', cell: (row) => (row.qty_in > 0 ? <span className="text-emerald-700">+{row.qty_in}</span> : 0) },
    { header: 'Out', align: 'right', cell: (row) => (row.qty_out > 0 ? <span className="text-rose-700">−{row.qty_out}</span> : 0) },
    { header: 'Closing', align: 'right', primary: true, cell: (row) => row.low ? <Badge tone="warn">{row.stock} {row.unit}</Badge> : `${row.stock} ${row.unit}` },
    { header: 'Reorder at', align: 'right', cell: (row) => row.reorder_level },
    { header: 'Average cost', align: 'right', cell: (row) => money(row.average_cost) },
    { header: 'Value', align: 'right', cell: (row) => money(row.stock_value) },
  ];
  const sorted = (rows: Row[]) => filters.apply(rows, () => null, { value: (row) => row.stock_value, stock: (row) => row.stock, moved: (row) => row.qty_out, name: (row) => row.name });
  const exportStock = async () => {
    const data = query.data!;
    return {
      businessName: me.business.name,
      currency: me.business.currency,
      title: 'Stock report',
      period,
      stats: [
        { label: 'Products tracked', value: data.rows.length, kind: 'count' as const },
        { label: 'Closing stock value', value: data.total_value },
        { label: 'Units in', value: data.qty_in, kind: 'count' as const },
        { label: 'Units out', value: data.qty_out, kind: 'count' as const },
        { label: 'Low-stock items', value: data.low_count, kind: 'count' as const },
      ],
      tables: [await rowsToTable('Stock', columns, sorted(data.rows))],
    };
  };
  return (
    <>
      <PageHeader title="Stock report" subtitle="Opening stock, what came in and went out, and closing stock for the period. Values use today's average cost." />
      <QueryBoundary query={query} skeleton={<div className="space-y-6"><KpiGridSkeleton count={4} columns={4} /><Card><TableSkeleton rows={8} columns={STOCK_REPORT_SKELETON} /></Card></div>}>
        {(data) => (
          <div className="space-y-6">
            <StatRow>
              <MetricCard icon={Warehouse} tone="blue" label="Closing stock value" value={money(data.total_value)} hint={`${data.rows.length.toLocaleString()} products · at average cost`} />
              <MetricCard icon={ArrowDownToLine} tone="green" label="Units in" value={data.qty_in.toLocaleString()} hint="Stock-in, returns, increases" />
              <MetricCard icon={ArrowUpFromLine} tone="red" label="Units out" value={data.qty_out.toLocaleString()} hint="Sales, damage, decreases" />
              <MetricCard icon={AlertTriangle} tone={data.low_count > 0 ? 'amber' : 'green'} label="Low-stock items" value={data.low_count.toLocaleString()} hint={`${data.rows.filter((row) => row.stock <= 0).length.toLocaleString()} out of stock`} />
            </StatRow>
            <Card>
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-end">
                <div className="flex flex-wrap items-center gap-2"><PeriodFilter value={period} onChange={setPeriod} className="w-44" />{filters.controls}<ExportMenu build={exportStock} /></div>
              </div>
              <DataTable rows={sorted(data.rows)} rowKey={rowId} empty="No tracked products in this period." columns={columns} />
            </Card>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
