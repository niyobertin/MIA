import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Trash2 } from 'lucide-react';
import { api } from '../lib/auth';
import { formatMoney } from '../lib/format';
import { inputClass } from '../ui/kit';
import { Field, FormDialog, LIST_KEYS, MethodButtons, SelectField, TextField, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';
import { SupplierDialog } from './partyForms';
import { useSuppliersList } from './productForms';

export type ProductOption = { id: string; name: string; unit: string; stock: number; selling_price: number; average_cost?: number; track_inventory: boolean; active: boolean; category: string | null };

export function useProductOptions() {
  const me = useDashboard();
  return useQuery({
    queryKey: ['products', me.user.id],
    queryFn: async () => (await api.get<{ rows: ProductOption[] }>('/dashboard/products')).data,
    select: (data) => data.rows.filter((row) => row.active),
  });
}

export type Line = { productId: string; name: string; unit: string; quantity: number; price: number };

/** Search box plus editable lines; used for stock-in and waiter tabs. */
export function LinesEditor({ lines, onChange, priceLabel, priceOf, stockCheck }: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  priceLabel: string;
  priceOf: (product: ProductOption) => number;
  stockCheck?: boolean;
}) {
  const me = useDashboard();
  const products = useProductOptions();
  const [search, setSearch] = useState('');
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return (products.data ?? []).filter((p) => p.name.toLowerCase().includes(term)).slice(0, 8);
  }, [products.data, search]);
  const add = (product: ProductOption) => {
    const existing = lines.find((l) => l.productId === product.id);
    if (existing) onChange(lines.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l)));
    else onChange([...lines, { productId: product.id, name: product.name, unit: product.unit, quantity: 1, price: priceOf(product) }]);
    setSearch('');
  };
  const update = (id: string, patch: Partial<Line>) => onChange(lines.map((l) => (l.productId === id ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  const stockOf = (id: string) => products.data?.find((p) => p.id === id);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
        <input aria-label="Find a product" placeholder="Type a product name to add it" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} pl-9`} />
        {matches.length > 0 ? (
          <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50">
                  <span className="font-medium text-slate-900">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.track_inventory ? `${p.stock} ${p.unit}` : 'not counted'}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {lines.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No items yet.</p> : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {lines.map((line) => {
            const product = stockOf(line.productId);
            const short = stockCheck && product?.track_inventory && line.quantity > product.stock;
            return (
              <div key={line.productId} className="grid grid-cols-[1fr_auto] gap-2 p-3 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{line.name}</div>
                  {short ? <div className="text-xs font-semibold text-rose-700">Only {product?.stock} {line.unit} in stock</div> : null}
                </div>
                <button type="button" aria-label={`Remove ${line.name}`} onClick={() => onChange(lines.filter((l) => l.productId !== line.productId))} className="justify-self-end p-1 text-slate-400 hover:text-rose-600 sm:order-last">
                  <Trash2 size={16} />
                </button>
                <label className="text-xs text-slate-500">Qty
                  <input inputMode="numeric" aria-label={`Quantity of ${line.name}`} value={line.quantity} onChange={(e) => update(line.productId, { quantity: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} className={`${inputClass} mt-1 tabular-nums`} />
                </label>
                <label className="text-xs text-slate-500">{priceLabel}
                  <input inputMode="numeric" aria-label={`${priceLabel} of ${line.name}`} value={line.price.toLocaleString('en-US')} onChange={(e) => update(line.productId, { price: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${inputClass} mt-1 tabular-nums`} />
                </label>
              </div>
            );
          })}
          <div className="flex justify-between p-3 text-sm font-bold text-slate-900"><span>Total</span><span>{formatMoney(total, me.business.currency)}</span></div>
        </div>
      )}
    </div>
  );
}

export function StockInDialog({ onClose }: { onClose: () => void }) {
  const me = useDashboard();
  const suppliers = useSuppliersList();
  const [supplierId, setSupplierId] = useState('');
  const [method, setMethod] = useState<'cash' | 'mobile_money' | 'bank' | 'credit'>('cash');
  const [lines, setLines] = useState<Line[]>([]);
  const [reference, setReference] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);
  const save = useSave('post', LIST_KEYS);
  return (
    <>
      <FormDialog
        title="New stock-in"
        wide
        onClose={onClose}
        busy={save.isPending}
        error={save.error}
        submitLabel="Save stock-in"
        onSubmit={() => save.mutate({
          path: '/dashboard/purchases',
          body: { supplier_id: supplierId, payment_method: method, reference_number: reference || null, items: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, unit_cost: l.price })) },
        }, { onSuccess: onClose })}
      >
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <SelectField label="Supplier" value={supplierId} onChange={setSupplierId} required placeholder="Choose a supplier"
              options={(suppliers.data ?? []).filter((s) => s.active).map((s) => ({ value: String(s.id), label: String(s.name), hint: s.phone ? String(s.phone) : undefined }))} />
          </div>
          {me.permissions.includes('suppliersWrite') ? <button type="button" onClick={() => setAddingSupplier(true)} className="mb-0.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">New</button> : null}
        </div>
        <LinesEditor lines={lines} onChange={setLines} priceLabel="Unit cost" priceOf={(p) => p.average_cost ?? 0} />
        <Field label="Paid with">{() => <MethodButtons value={method} onChange={setMethod} includeCredit />}</Field>
        {method === 'credit' ? <p className="text-xs text-slate-500">On credit: you will owe this supplier. Pay them later from Suppliers.</p> : null}
        <TextField label="Supplier invoice number (optional)" value={reference} onChange={setReference} maxLength={60} />
      </FormDialog>
      {addingSupplier ? <SupplierDialog onClose={() => setAddingSupplier(false)} /> : null}
    </>
  );
}
