import { useEffect, useRef, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Select } from './Select';
import { Button, inputClass } from './kit';

export type PresetPeriod = 'all' | 'today' | 'yesterday' | '7d' | '30d' | '90d';
export type PeriodValue = { period: PresetPeriod } | { period: 'custom'; from: string; to: string };

const PRESETS: { value: PresetPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const MAX_DAYS = 366;

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shortDay(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function rangeProblem(from: string, to: string, today = isoDay(new Date())): string | null {
  if (!from || !to) return 'Choose a start and an end date.';
  if (from > to) return 'The start date must be on or before the end date.';
  if (to > today) return 'The end date cannot be in the future.';
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (span > MAX_DAYS) return 'Choose a range of one year or less.';
  return null;
}

export function PeriodFilter({ value, onChange, includeAll = false, className = 'w-56' }: { value: PeriodValue; onChange: (value: PeriodValue) => void; includeAll?: boolean; className?: string }) {
  const today = isoDay(new Date());
  const [panelOpen, setPanelOpen] = useState(false);
  const [from, setFrom] = useState(() => (value.period === 'custom' ? value.from : isoDay(new Date(Date.now() - 6 * 86_400_000))));
  const [to, setTo] = useState(value.period === 'custom' ? value.to : today);
  const [problem, setProblem] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [panelOpen]);

  const customLabel = value.period === 'custom' ? `${shortDay(value.from)} – ${shortDay(value.to)}` : 'Custom range…';
  const options = [...(includeAll ? [{ value: 'all' as const, label: 'All time' }] : []), ...PRESETS, { value: 'custom' as const, label: customLabel }];

  const apply = () => {
    const issue = rangeProblem(from, to, today);
    setProblem(issue);
    if (issue) return;
    onChange({ period: 'custom', from, to });
    setPanelOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <Select
        ariaLabel="Period"
        className={className}
        value={value.period}
        options={options}
        onChange={(next) => {
          if (next === 'custom') {
            setProblem(null);
            setPanelOpen(true);
            return;
          }
          setPanelOpen(false);
          onChange({ period: next });
        }}
      />
      {panelOpen ? (
        <div
          role="dialog"
          aria-label="Custom date range"
          className="absolute left-0 sm:left-auto sm:right-0 z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10"
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <CalendarRange size={16} className="text-emerald-700" aria-hidden />
            Custom range
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label htmlFor="range-from" className="mb-1.5 block text-xs font-semibold text-slate-600">From</label>
              <input id="range-from" type="date" max={to || today} value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="range-to" className="mb-1.5 block text-xs font-semibold text-slate-600">To</label>
              <input id="range-to" type="date" min={from} max={today} value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
          </div>
          {problem ? <p role="alert" className="mt-2 text-xs font-medium text-rose-700">{problem}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" onClick={() => setPanelOpen(false)} className="!py-1.5">Cancel</Button>
            <Button type="button" tone="primary" onClick={apply} className="!py-1.5">Apply</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
