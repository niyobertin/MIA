import { generateUUID } from './uuid';

export function formatCurrency(amount: number, currency = 'RWF'): string {
  const formatted = (amount ?? 0).toLocaleString();
  return currency ? `${formatted} ${currency}` : formatted;
}

export function parseCurrency(value: string): number {
  return parseInt(value.replace(/[^\d-]/g, ''), 10) || 0;
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

export function formatDate(date: string | Date, locale = 'en-RW'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date, locale = 'en-RW'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(date: string | Date, locale = 'en-RW'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

export function getWeekStartDateString(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export function getWeekEndDateString(): string {
  const monday = new Date(getWeekStartDateString());
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return sunday.toISOString().split('T')[0];
}

export function getMonthStartDateString(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

export function getMonthEndDateString(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
}

export function getLastMonthStartDateString(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
}

export function getLastMonthEndDateString(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
}

export function generateId(): string {
  return generateUUID();
}

export function generateReferenceNumber(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[\d\s-]{8,}$/.test(phone);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}