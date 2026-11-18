import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/auth';
import { Badge, Button, DataTable, Dialog, QueryBoundary, Skeleton } from '../ui/kit';
import { CheckField, FormDialog, FormError, LIST_KEYS, NumberField, SelectField, TextField, useFormState, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';

type Row = Record<string, any>;
type Category = { id: string; name: string; description: string | null; active: boolean; products: number };

export function useCategories() {
  const me = useDashboard();
  return useQuery({
    queryKey: ['categories', me.user.id],
    queryFn: async () => (await api.get<{ rows: Category[] }>('/dashboard/categories')).data.rows,
  });
}

export function useSuppliersList() {
  const me = useDashboard();
  return useQuery({
    queryKey: ['suppliers', me.user.id, 'options'],
    queryFn: async () => (await api.get<{ rows: Row[] }>('/dashboard/suppliers', { params: { limit: 200 } })).data.rows,
    enabled: me.permissions.includes('suppliers'),
  });
}

export function ProductDialog({ product, onClose }: { product?: Row; onClose: () => void }) {
  const me = useDashboard();
  const dayOpen = me.day.open;
  const categories = useCategories();
  const suppliers = useSuppliersList();
  const editing = Boolean(product);
  const { form, set } = useFormState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    unit: product?.unit ?? 'pcs',
    selling_price: (product?.selling_price ?? '') as number | '',
    reorder_level: (product?.reorder_level ?? 5) as number | '',
    track_inventory: product?.track_inventory ?? true,
    category_id: (product?.category_id ?? '') as string,
    preferred_supplier_id: (product?.preferred_supplier_id ?? '') as string,
    opening_qty: '' as number | '',
    opening_cost: '' as number | '',
  });
  const save = useSave(editing ? 'patch' : 'post', LIST_KEYS);
  const submit = () => {
    const body: Record<string, unknown> = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      unit: form.unit || 'pcs',
      selling_price: form.selling_price === '' ? 0 : form.selling_price,
      reorder_level: form.reorder_level === '' ? 0 : form.reorder_level,
      track_inventory: form.track_inventory,
      category_id: form.category_id || null,
      preferred_supplier_id: form.preferred_supplier_id || null,
    };
    if (!editing) {
      body.opening_qty = form.opening_qty === '' ? 0 : form.opening_qty;
      body.opening_cost = form.opening_cost === '' ? 0 : form.opening_cost;
    }
    save.mutate({ path: editing ? `/dashboard/products/${product!.id}` : '/dashboard/products', body }, { onSuccess: onClose });
  };
  return (
    <FormDialog title={editing ? `Edit ${product!.name}` : 'Add product'} onClose={onClose} onSubmit={submit} busy={save.isPending} error={save.error} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><TextField label="Product name" value={form.name} onChange={set('name')} required autoFocus maxLength={120} /></div>
        <NumberField label="Selling price" value={form.selling_price} onChange={set('selling_price')} required suffix={me.business.currency} />
        <TextField label="Unit" value={form.unit} onChange={set('unit')} hint="For example pcs, bottle, kg, crate" maxLength={20} />
        <SelectField label="Category" value={form.category_id} onChange={set('category_id')} placeholder="No category"
          options={[{ value: '', label: 'No category' }, ...(categories.data ?? []).filter((c) => c.active || c.id === form.category_id).map((c) => ({ value: c.id, label: c.name }))]} />
        <SelectField label="Usual supplier" value={form.preferred_supplier_id} onChange={set('preferred_supplier_id')} placeholder="None"
          options={[{ value: '', label: 'None' }, ...(suppliers.data ?? []).filter((s) => s.active).map((s) => ({ value: String(s.id), label: String(s.name) }))]} />
        <TextField label="Code (SKU)" value={form.sku} onChange={set('sku')} maxLength={60} />
        <TextField label="Barcode" value={form.barcode} onChange={set('barcode')} maxLength={60} />
        <NumberField label="Warn me when stock is at or below" value={form.reorder_level} onChange={set('reorder_level')} />
        <div className="sm:col-span-2"><CheckField label="Track stock for this product" hint="Turn off for services or items you do not count." checked={form.track_inventory} onChange={set('track_inventory')} /></div>
        {!editing && form.track_inventory ? (
          <>
            <NumberField label="Stock you have now" value={form.opening_qty} onChange={set('opening_qty')} hint={dayOpen ? 'Recorded as opening stock.' : 'Start the day first to add opening stock.'} />
            <NumberField label="What one unit cost you" value={form.opening_cost} onChange={set('opening_cost')} suffix={me.business.currency} hint="Used for profit and stock value." />
          </>
        ) : null}
      </div>
    </FormDialog>
  );
}

export function AdjustStockDialog({ product, onClose }: { product: Row; onClose: () => void }) {
  const { form, set } = useFormState({ kind: 'adjustment_out' as 'adjustment_in' | 'adjustment_out' | 'damaged', quantity: '' as number | '', reason: '' });
  const save = useSave('post', LIST_KEYS);
  return (
    <FormDialog
      title={`Adjust stock: ${product.name}`}
      onClose={onClose}
      busy={save.isPending}
      error={save.error}
      onSubmit={() => save.mutate({ path: '/dashboard/stock/adjust', body: { product_id: product.id, kind: form.kind, quantity: form.quantity === '' ? 0 : form.quantity, reason: form.reason } }, { onSuccess: onClose })}
    >
      <p className="text-sm text-slate-600">In stock now: <span className="font-semibold text-slate-900">{product.stock} {product.unit}</span></p>
      <SelectField label="What happened" value={form.kind} onChange={set('kind')} options={[
        { value: 'adjustment_out', label: 'Remove stock', hint: 'Count was lower than the books' },
        { value: 'adjustment_in', label: 'Add stock', hint: 'Count was higher than the books' },
        { value: 'damaged', label: 'Damaged or expired', hint: 'Counts as a loss' },
      ]} />
      <NumberField label="Quantity" value={form.quantity} onChange={set('quantity')} required min={0} suffix={product.unit} />
      <TextField label="Reason" value={form.reason} onChange={set('reason')} required placeholder="For example: 2 bottles broke" maxLength={300} />
    </FormDialog>
  );
}

export function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState('');
  const add = useSave('post', ['categories', 'products']);
  const update = useSave('patch', ['categories', 'products']);
  const [editing, setEditing] = useState<Category | null>(null);
  return (
    <Dialog title="Categories" onClose={onClose} wide>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate({ path: '/dashboard/categories', body: { name } }, { onSuccess: () => setName('') });
        }}
      >
        <input aria-label="New category name" placeholder="New category, e.g. Beers" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        <Button type="submit" tone="primary" disabled={add.isPending}>Add</Button>
      </form>
      <FormError error={add.error ?? update.error} />
      <QueryBoundary query={categories} skeleton={<Skeleton className="h-32" />}>
        {(rows) => (
          <DataTable<Category>
            rows={rows}
            rowKey={(r) => r.id}
            empty="No categories yet."
            columns={[
              { header: 'Name', cell: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
              { header: 'Products', align: 'right', cell: (r) => r.products },
              { header: 'Status', cell: (r) => (r.active ? <Badge tone="good">Active</Badge> : <Badge>Hidden</Badge>) },
              { header: 'Actions', align: 'right', cell: (r) => (
                <div className="flex justify-end gap-1.5">
                  <Button className="!px-2.5 !py-1.5 !text-xs" onClick={() => setEditing(r)}>Rename</Button>
                  <Button className="!px-2.5 !py-1.5 !text-xs" disabled={update.isPending} onClick={() => update.mutate({ path: `/dashboard/categories/${r.id}`, body: { active: !r.active } })}>
                    {r.active ? 'Hide' : 'Show'}
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </QueryBoundary>
      {editing ? <RenameCategory category={editing} onClose={() => setEditing(null)} /> : null}
    </Dialog>
  );
}

function RenameCategory({ category, onClose }: { category: Category; onClose: () => void }) {
  const [name, setName] = useState(category.name);
  const save = useSave('patch', ['categories', 'products']);
  return (
    <FormDialog title="Rename category" onClose={onClose} busy={save.isPending} error={save.error}
      onSubmit={() => save.mutate({ path: `/dashboard/categories/${category.id}`, body: { name } }, { onSuccess: onClose })}>
      <TextField label="Name" value={name} onChange={setName} required autoFocus maxLength={80} />
    </FormDialog>
  );
}
