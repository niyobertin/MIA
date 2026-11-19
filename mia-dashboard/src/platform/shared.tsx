import { useQuery } from '@tanstack/react-query';
import { platformApi } from '../lib/platformAuth';
import { Select } from '../ui/Select';

export type BusinessOption = { id: string; name: string; business_code: string };

export function useBusinessOptions(enabled = true) {
  return useQuery({
    queryKey: ['platform-business-options'],
    queryFn: async () => (await platformApi.get<{ rows: BusinessOption[] }>('/businesses', { params: { limit: 200, sort_by: 'name', sort: 'asc' } })).data.rows,
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function BusinessPicker({ id, value, onChange, allowAll = false, className = '', label = 'Organization' }: { id?: string; value: string; onChange: (value: string) => void; allowAll?: boolean; className?: string; label?: string }) {
  const options = useBusinessOptions();
  return (
    <Select
      id={id}
      ariaLabel={label}
      value={value}
      onChange={onChange}
      className={className}
      placeholder={options.isPending ? 'Loading organizations…' : 'Choose an organization'}
      options={[...(allowAll ? [{ value: '', label: 'All organizations' }] : []), ...(options.data ?? []).map((row) => ({ value: row.id, label: row.name, hint: row.business_code }))]}
    />
  );
}

export const ROLE_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'OWNER', label: 'Owner' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'STAFF', label: 'Staff' },
];

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value);
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
