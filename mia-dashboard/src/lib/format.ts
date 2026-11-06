export function formatMoney(amount: number | null | undefined, currency = 'RWF') {
  return `${new Intl.NumberFormat('en-US').format(amount ?? 0)} ${currency}`;
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function formatDay(day: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

export function humanize(value: string | null | undefined) {
  if (!value) return '—';
  const text = value.replace(/[_.-]+/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  const response = (error as { response?: { data?: { error?: unknown } } })?.response;
  if (typeof response?.data?.error === 'string') return response.data.error;
  if ((error as { request?: unknown })?.request && !response) return 'Could not reach the MIA server. Check your connection and try again.';
  return fallback;
}
