import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/auth';
import { getErrorMessage } from '../lib/format';
import { Button, Dialog, inputClass } from './kit';
import { Select, type SelectOption } from './Select';

/** Saves to the API and refreshes every list whose query key starts with one of `refresh`. */
export function useSave<TBody = unknown, TResult = unknown>(method: 'post' | 'patch', refresh: string[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: TBody }) => (await api[method]<TResult>(path, body ?? {})).data,
    onSuccess: () => client.invalidateQueries({ predicate: (q) => refresh.includes(String(q.queryKey[0])) }),
  });
}

export const LIST_KEYS = ['products', 'customers', 'suppliers', 'expenses', 'sales', 'payments', 'purchases', 'movements', 'overview', 'day', 'stock-report', 'customer-sales', 'product-movements', 'sale', 'purchase', 'waiter-tabs', 'waiter-tab', 'dashboard-me', 'categories', 'closings'];

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{getErrorMessage(error)}</div>;
}

export function FormDialog({ title, onClose, onSubmit, busy, error, submitLabel = 'Save', children, wide }: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  busy?: boolean;
  error?: unknown;
  submitLabel?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog title={title} onClose={onClose} wide={wide}>
      <form
        className="space-y-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
        <FormError error={error} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" tone="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function Field({ label, hint, children, id }: { label: string; hint?: string; children: (id: string) => ReactNode; id?: string }) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children(fieldId)}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function TextField({ label, value, onChange, required, hint, type = 'text', placeholder, maxLength, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; hint?: string; type?: string; placeholder?: string; maxLength?: number; autoFocus?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <input id={id} type={type} required={required} value={value} placeholder={placeholder} maxLength={maxLength} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} className={inputClass} />}
    </Field>
  );
}

/** Whole numbers only; shows thousands separators while typing. Money is in whole francs. */
export function NumberField({ label, value, onChange, required, hint, suffix, min = 0, autoFocus }: {
  label: string; value: number | ''; onChange: (v: number | '') => void; required?: boolean; hint?: string; suffix?: string; min?: number; autoFocus?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="relative">
          <input
            id={id}
            inputMode="numeric"
            required={required}
            autoFocus={autoFocus}
            value={value === '' ? '' : value.toLocaleString('en-US')}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '');
              onChange(digits === '' ? '' : Math.max(min, Number(digits)));
            }}
            className={`${inputClass} tabular-nums ${suffix ? 'pr-14' : ''}`}
          />
          {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-400">{suffix}</span> : null}
        </div>
      )}
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, hint, required, placeholder }: {
  label: string; value: T; onChange: (v: T) => void; options: SelectOption<T>[]; hint?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <Select id={id} value={value} onChange={onChange} options={options} required={required} placeholder={placeholder} />}
    </Field>
  );
}

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export const PAY_METHODS: SelectOption<'cash' | 'mobile_money' | 'bank'>[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank', label: 'Bank' },
];

/** Keeps a form's state in one object. */
export function useFormState<T extends Record<string, unknown>>(initial: T) {
  const [form, setForm] = useState<T>(initial);
  const set = <K extends keyof T>(key: K) => (value: T[K]) => setForm((current) => ({ ...current, [key]: value }));
  return { form, set, setForm };
}

export function MethodButtons({ value, onChange, includeCredit }: { value: string; onChange: (v: 'cash' | 'mobile_money' | 'bank' | 'credit') => void; includeCredit?: boolean }) {
  const options = [...PAY_METHODS, ...(includeCredit ? [{ value: 'credit' as const, label: 'Credit' }] : [])];
  return (
    <div role="radiogroup" className={`grid gap-2 ${includeCredit ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${active ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
