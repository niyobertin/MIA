import { formatMoney } from '../lib/format';
import { FormDialog, LIST_KEYS, MethodButtons, NumberField, SelectField, TextField, useFormState, useSave, Field } from '../ui/forms';
import { useDashboard } from './BusinessApp';

type Row = Record<string, any>;

export const EXPENSE_CATEGORIES = [
  { value: 'transport', label: 'Transport' },
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'food', label: 'Food' },
  { value: 'salary', label: 'Salary' },
  { value: 'communication', label: 'Phone and internet' },
  { value: 'maintenance', label: 'Repairs' },
  { value: 'tax', label: 'Tax' },
  { value: 'other', label: 'Other' },
] as const;

export function CustomerDialog({ customer, onClose }: { customer?: Row; onClose: () => void }) {
  const me = useDashboard();
  const canLimit = me.user.role !== 'CASHIER';
  const editing = Boolean(customer);
  const { form, set } = useFormState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    credit_limit: (customer?.credit_limit ?? '') as number | '',
  });
  const save = useSave(editing ? 'patch' : 'post', LIST_KEYS);
  const submit = () => {
    const body: Record<string, unknown> = { name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null };
    if (canLimit) body.credit_limit = form.credit_limit === '' ? 0 : form.credit_limit;
    save.mutate({ path: editing ? `/dashboard/customers/${customer!.id}` : '/dashboard/customers', body }, { onSuccess: onClose });
  };
  return (
    <FormDialog title={editing ? `Edit ${customer!.name}` : 'Add customer'} onClose={onClose} onSubmit={submit} busy={save.isPending} error={save.error}>
      <TextField label="Name" value={form.name} onChange={set('name')} required autoFocus maxLength={120} />
      <TextField label="Phone" value={form.phone} onChange={set('phone')} type="tel" placeholder="0788 123 456" maxLength={30} />
      <TextField label="Email" value={form.email} onChange={set('email')} type="email" maxLength={200} />
      <TextField label="Address" value={form.address} onChange={set('address')} maxLength={300} />
      {canLimit ? <NumberField label="Credit limit" value={form.credit_limit} onChange={set('credit_limit')} suffix={me.business.currency} hint="0 means no limit." /> : null}
    </FormDialog>
  );
}

export function SupplierDialog({ supplier, onClose }: { supplier?: Row; onClose: () => void }) {
  const editing = Boolean(supplier);
  const { form, set } = useFormState({ name: supplier?.name ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', address: supplier?.address ?? '' });
  const save = useSave(editing ? 'patch' : 'post', LIST_KEYS);
  return (
    <FormDialog
      title={editing ? `Edit ${supplier!.name}` : 'Add supplier'}
      onClose={onClose}
      busy={save.isPending}
      error={save.error}
      onSubmit={() => save.mutate({ path: editing ? `/dashboard/suppliers/${supplier!.id}` : '/dashboard/suppliers', body: { name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null } }, { onSuccess: onClose })}
    >
      <TextField label="Name" value={form.name} onChange={set('name')} required autoFocus maxLength={120} />
      <TextField label="Phone" value={form.phone} onChange={set('phone')} type="tel" maxLength={30} />
      <TextField label="Email" value={form.email} onChange={set('email')} type="email" maxLength={200} />
      <TextField label="Address" value={form.address} onChange={set('address')} maxLength={300} />
    </FormDialog>
  );
}

/** Money in from a customer who owes, or money out to a supplier we owe. */
export function PartyPaymentDialog({ kind, party, onClose }: { kind: 'customer' | 'supplier'; party: Row; onClose: () => void }) {
  const me = useDashboard();
  const owed = Number(party.balance ?? 0);
  const { form, set } = useFormState({ amount: (owed > 0 ? owed : '') as number | '', method: 'cash' as 'cash' | 'mobile_money' | 'bank', notes: '' });
  const save = useSave('post', LIST_KEYS);
  const title = kind === 'customer' ? `Take payment from ${party.name}` : `Pay ${party.name}`;
  return (
    <FormDialog
      title={title}
      onClose={onClose}
      busy={save.isPending}
      error={save.error}
      submitLabel={kind === 'customer' ? 'Record payment' : 'Record payment'}
      onSubmit={() => save.mutate({
        path: `/dashboard/payments/${kind}`,
        body: { [`${kind}_id`]: party.id, amount: form.amount === '' ? 0 : form.amount, method: form.method, notes: form.notes || null },
      }, { onSuccess: onClose })}
    >
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        {kind === 'customer' ? 'Owes you' : 'You owe'}: <span className="font-bold text-slate-900">{formatMoney(owed, me.business.currency)}</span>
        <span className="block text-xs text-slate-500">The payment pays the oldest unpaid {kind === 'customer' ? 'sales' : 'stock-in'} first.</span>
      </p>
      <NumberField label="Amount" value={form.amount} onChange={set('amount')} required suffix={me.business.currency} autoFocus />
      <Field label="Paid with">{() => <MethodButtons value={form.method} onChange={(v) => set('method')(v as 'cash' | 'mobile_money' | 'bank')} />}</Field>
      <TextField label="Note (optional)" value={form.notes} onChange={set('notes')} maxLength={300} />
    </FormDialog>
  );
}

export function ExpenseDialog({ expense, onClose }: { expense?: Row; onClose: () => void }) {
  const me = useDashboard();
  const editing = Boolean(expense);
  const { form, set } = useFormState({
    category: (expense?.category ?? 'other') as (typeof EXPENSE_CATEGORIES)[number]['value'],
    amount: (expense?.amount ?? '') as number | '',
    payment_method: (expense?.payment_method ?? 'cash') as 'cash' | 'mobile_money' | 'bank',
    description: expense?.description ?? '',
    reference_number: expense?.reference_number ?? '',
  });
  const save = useSave(editing ? 'patch' : 'post', LIST_KEYS);
  return (
    <FormDialog
      title={editing ? 'Edit expense' : 'Record expense'}
      onClose={onClose}
      busy={save.isPending}
      error={save.error}
      onSubmit={() => save.mutate({
        path: editing ? `/dashboard/expenses/${expense!.id}` : '/dashboard/expenses',
        body: { ...form, amount: form.amount === '' ? 0 : form.amount, description: form.description || null, reference_number: form.reference_number || null },
      }, { onSuccess: onClose })}
    >
      <SelectField label="What for" value={form.category} onChange={set('category')} options={[...EXPENSE_CATEGORIES]} />
      <NumberField label="Amount" value={form.amount} onChange={set('amount')} required suffix={me.business.currency} autoFocus />
      <Field label="Paid with">{() => <MethodButtons value={form.payment_method} onChange={(v) => set('payment_method')(v as 'cash' | 'mobile_money' | 'bank')} />}</Field>
      <TextField label="Description (optional)" value={form.description} onChange={set('description')} maxLength={300} />
      <TextField label="Receipt number (optional)" value={form.reference_number} onChange={set('reference_number')} maxLength={60} />
    </FormDialog>
  );
}
