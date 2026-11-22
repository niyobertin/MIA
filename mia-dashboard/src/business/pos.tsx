import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { ProductThumb } from '../ui/ProductThumb';
import { api } from '../lib/auth';
import { formatMoney, getErrorMessage } from '../lib/format';
import { Button, Card, Dialog, inputClass, PageHeader } from '../ui/kit';
import { TileGridSkeleton } from '../ui/skeleton';
import { Select } from '../ui/Select';
import { FormError, LIST_KEYS, MethodButtons, useSave } from '../ui/forms';
import { useDashboard } from './BusinessApp';
import { CustomerDialog } from './partyForms';
import { useProductOptions, type ProductOption } from './stockIn';

type CartLine = { product: ProductOption; quantity: number; price: number };
type Method = 'cash' | 'mobile_money' | 'bank' | 'credit';

function useCustomerOptions() {
  const me = useDashboard();
  return useQuery({
    queryKey: ['customers', me.user.id, 'options'],
    queryFn: async () => (await api.get<{ rows: Record<string, any>[] }>('/dashboard/customers', { params: { limit: 200 } })).data.rows,
  });
}

/** Web point of sale: tap products, review, pick how the customer paid. Same checks as the phone. */
export function NewSale() {
  const me = useDashboard();
  const money = (n: number) => formatMoney(n, me.business.currency);
  const canEditPrice = me.user.role === 'OWNER' || me.user.role === 'MANAGER';
  const products = useProductOptions();
  const customers = useCustomerOptions();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<Method>('cash');
  const [customerId, setCustomerId] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [belowCost, setBelowCost] = useState<{ productName?: string; shortfall?: number } | null>(null);
  const [done, setDone] = useState<{ reference: string; total: number } | null>(null);
  const save = useSave<unknown, { reference_number: string; total: number }>('post', LIST_KEYS);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => !term || p.name.toLowerCase().includes(term));
  }, [products.data, search]);
  const total = cart.reduce((s, l) => s + l.quantity * l.price, 0);
  const inCart = (id: string) => cart.find((l) => l.product.id === id)?.quantity ?? 0;

  const add = (product: ProductOption) => {
    if (product.track_inventory && inCart(product.id) >= product.stock) return;
    setDone(null);
    setCart((current) => {
      const found = current.find((l) => l.product.id === product.id);
      if (found) return current.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...current, { product, quantity: 1, price: product.selling_price }];
    });
  };
  const setQty = (id: string, quantity: number) =>
    setCart((current) => current.flatMap((l) => {
      if (l.product.id !== id) return [l];
      if (quantity < 1) return [];
      const cap = l.product.track_inventory ? Math.min(quantity, l.product.stock) : quantity;
      return [{ ...l, quantity: cap }];
    }));

  const submit = (allowBelowCost = false) => {
    if (method === 'credit' && !customerId) return;
    save.mutate(
      {
        path: '/dashboard/sales',
        body: {
          payment_method: method,
          customer_id: customerId || null,
          allow_below_cost: allowBelowCost || undefined,
          items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity, selling_price: l.price })),
        },
      },
      {
        onSuccess: (sale) => {
          setDone({ reference: sale.reference_number, total: sale.total });
          setCart([]);
          setCustomerId('');
          setMethod('cash');
          setBelowCost(null);
        },
        onError: (error) => {
          const data = (error as { response?: { data?: { code?: string; productName?: string; shortfall?: number; canOverride?: boolean } } }).response?.data;
          if (data?.code === 'BELOW_COST' && data.canOverride) setBelowCost({ productName: data.productName, shortfall: data.shortfall });
        },
      },
    );
  };

  if (!me.day.open) {
    return (
      <>
        <PageHeader title="New sale" />
        <Card className="p-6 text-center">
          <p className="text-slate-700">Start the day before you sell.</p>
          <Link to="/day" className="mt-3 inline-block rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Go to Day</Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New sale" subtitle="Tap products to add them, then choose how the customer paid." />
      {done ? (
        <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle2 className="shrink-0" aria-hidden />
          <span className="font-semibold">Sale saved · {done.reference} · {money(done.total)}</span>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_24rem]">
        <div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input aria-label="Search products" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} pl-9`} />
          </div>
          {products.isLoading ? <TileGridSkeleton count={9} /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((p) => {
                const qty = inCart(p.id);
                const out = p.track_inventory && p.stock <= 0;
                const full = p.track_inventory && qty >= p.stock;
                const lowStock = p.track_inventory && !out && p.stock <= 5;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={out || full}
                    onClick={() => add(p)}
                    aria-pressed={qty > 0}
                    aria-label={`${p.name}, ${money(p.selling_price)}${qty ? `, ${qty} in cart` : ''}`}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm ${qty ? 'border-emerald-600 bg-emerald-50/60 ring-4 ring-emerald-100' : 'border-slate-200 hover:border-emerald-300'}`}
                  >
                    <div className="relative">
                      <ProductThumb name={p.name} src={(p as ProductOption & { image_url?: string | null }).image_url} className="aspect-[4/3] w-full" />
                      {qty ? (
                        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border-2 border-white bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white shadow">
                          <Check size={12} strokeWidth={3} aria-hidden />{qty}
                        </span>
                      ) : null}
                      {p.track_inventory ? (
                        <span className={`absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold shadow-sm ${out ? 'text-rose-700' : lowStock ? 'text-amber-700' : 'text-slate-700'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${out ? 'bg-rose-500' : lowStock ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden />
                          {out ? 'Out of stock' : `${p.stock} ${p.unit}`}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <span className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-slate-900">{p.name}</span>
                      {p.category ? <span className="truncate text-xs text-slate-500">{p.category}</span> : null}
                      <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                        <span className={`whitespace-nowrap text-sm font-extrabold tabular-nums ${qty ? 'text-emerald-800' : 'text-slate-900'}`}>{money(p.selling_price)}</span>
                        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${qty ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-emerald-600 text-emerald-700 group-hover:bg-emerald-50'}`} aria-hidden>
                          <Plus size={14} strokeWidth={3} />
                        </span>
                      </span>
                      {qty ? <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Selected</span> : null}
                    </div>
                  </button>
                );
              })}
              {visible.length === 0 ? <p className="col-span-full text-sm text-slate-500">No products match.</p> : null}
            </div>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 font-bold text-slate-900">
            <ShoppingCart size={18} aria-hidden />Cart
            {cart.length ? <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{cart.reduce((n, l) => n + l.quantity, 0)} items</span> : null}
          </div>
          <div className="space-y-4 p-5">
            {cart.length === 0 ? <p className="text-sm text-slate-500">Tap a product to add it.</p> : (
              <ul className="divide-y divide-slate-100">
                {cart.map((line) => (
                  <li key={line.product.id} className="space-y-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <ProductThumb name={line.product.name} className="h-9 w-9 shrink-0 rounded-lg" iconSize={16} />
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{line.product.name}</span>
                      <button type="button" aria-label={`Remove ${line.product.name}`} onClick={() => setQty(line.product.id, 0)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center rounded-xl border border-slate-200">
                        <button type="button" aria-label="One less" onClick={() => setQty(line.product.id, line.quantity - 1)} className="p-2 text-slate-600"><Minus size={14} /></button>
                        <span className="w-8 text-center text-sm font-bold tabular-nums">{line.quantity}</span>
                        <button type="button" aria-label="One more" onClick={() => setQty(line.product.id, line.quantity + 1)} className="p-2 text-slate-600"><Plus size={14} /></button>
                      </div>
                      <span className="text-xs text-slate-500">×</span>
                      {canEditPrice ? (
                        <input inputMode="numeric" aria-label={`Price of ${line.product.name}`} value={line.price.toLocaleString('en-US')}
                          onChange={(e) => setCart((c) => c.map((l) => (l.product.id === line.product.id ? { ...l, price: Number(e.target.value.replace(/\D/g, '')) || 0 } : l)))}
                          className={`${inputClass} !w-28 tabular-nums`} />
                      ) : <span className="text-sm text-slate-700">{money(line.price)}</span>}
                      <span className="ml-auto text-sm font-bold tabular-nums text-slate-900">{money(line.quantity * line.price)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-semibold text-slate-700">Total</span>
              <span className="text-2xl font-extrabold text-slate-900">{money(total)}</span>
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700">Paid with</div>
              <MethodButtons value={method} onChange={setMethod} includeCredit />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-700">
                <span>Customer {method === 'credit' ? '(needed for credit)' : '(optional)'}</span>
                {me.permissions.includes('customersWrite') ? <button type="button" onClick={() => setAddingCustomer(true)} className="text-xs font-semibold text-emerald-700 hover:underline">New customer</button> : null}
              </div>
              <Select ariaLabel="Customer" value={customerId} onChange={setCustomerId} placeholder="Walk-in customer"
                options={[{ value: '', label: 'Walk-in customer' }, ...(customers.data ?? []).filter((c) => c.active !== false).map((c) => ({ value: String(c.id), label: String(c.name), hint: c.balance > 0 ? `Owes ${money(c.balance)}` : c.phone ?? undefined }))]} />
            </div>
            <FormError error={save.isError && !belowCost ? save.error : null} />
            <Button tone="primary" className="w-full !py-3 !text-base" disabled={cart.length === 0 || save.isPending || (method === 'credit' && !customerId)} onClick={() => submit(false)}>
              {save.isPending ? 'Saving…' : `Complete sale · ${money(total)}`}
            </Button>
          </div>
        </Card>
      </div>

      {belowCost ? (
        <Dialog title="Sell below cost?" onClose={() => setBelowCost(null)}>
          <p className="text-sm text-slate-700">{belowCost.productName ?? 'An item'} is priced below what it cost you. You would lose {money(belowCost.shortfall ?? 0)} on this sale.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setBelowCost(null)}>Change price</Button>
            <Button tone="danger" onClick={() => submit(true)} disabled={save.isPending}>Sell anyway</Button>
          </div>
          {save.isError && belowCost ? <p className="mt-2 text-sm text-rose-700">{getErrorMessage(save.error)}</p> : null}
        </Dialog>
      ) : null}
      {addingCustomer ? <CustomerDialog onClose={() => setAddingCustomer(false)} /> : null}
    </>
  );
}
