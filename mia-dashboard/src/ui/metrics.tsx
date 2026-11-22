import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { surfaceCard, TONES, type Tone } from './tokens';
import { Bone } from './skeleton';

export function Sparkline({ values, tone = 'green' }: { values: number[]; tone?: Tone }) {
  const gradient = useId().replace(/:/g, '');
  if (values.length < 2 || Math.max(...values) === 0) return null;
  const width = 80;
  const height = 32;
  const max = Math.max(...values);
  const points = values.map((value, index) => [(index / (values.length - 1)) * width, height - 3 - (Math.max(0, value) / max) * (height - 6)]);
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="-my-1 hidden h-6 w-16 shrink-0 sm:block">
      <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={TONES[tone].stroke} stopOpacity="0.25" /><stop offset="100%" stopColor={TONES[tone].stroke} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradient})`} />
      <path d={line} fill="none" stroke={TONES[tone].stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Trend({ growth, label = 'vs previous period', inverse = false }: { growth: number | null | undefined; label?: string; inverse?: boolean }) {
  if (growth === null || growth === undefined) return null;
  const up = growth >= 0;
  const good = inverse ? !up : up;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted" title={label ? `${up ? '+' : ''}${growth}% ${label}` : undefined}>
      <span className={`inline-flex shrink-0 items-center gap-0.5 font-semibold ${growth === 0 ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-rose-600'}`}><Arrow size={12} aria-hidden />{up ? '+' : ''}{growth}%</span>
      {label ? <span className="truncate">{label}</span> : null}
    </span>
  );
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

const VALUE_TONES = { default: 'text-ink', good: 'text-emerald-700', bad: 'text-rose-700' } as const;

export function MetricCard({ icon: Icon, tone = 'green', label, value, hint, growth, growthLabel, growthInverse, spark, soft = false, loading = false, valueTone = 'default' }: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  growth?: number | null;
  growthLabel?: string;
  growthInverse?: boolean;
  spark?: number[];
  soft?: boolean;
  loading?: boolean;
  valueTone?: keyof typeof VALUE_TONES;
}) {
  return (
    <div className={`${surfaceCard} ${soft ? TONES[tone].soft : ''} flex min-w-0 items-start sm:min-h-[116px] gap-3.5 p-4 sm:gap-4 sm:p-5`} aria-busy={loading || undefined}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl ${TONES[tone].icon}`}><Icon size={22} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="pt-0.5 text-[13px] font-semibold text-ink/75 sm:text-sm">{label}</div>
          {spark && !loading ? <Sparkline values={spark} tone={tone} /> : null}
        </div>
        {loading ? (
          <div className="space-y-2 pt-1.5"><Bone className="h-6 w-32 max-w-full" /><Bone className="h-3 w-24" /></div>
        ) : (
          <>
            <div className={`mt-0.5 break-words text-xl font-extrabold leading-tight tracking-tight tabular-nums sm:text-2xl ${VALUE_TONES[valueTone]}`}>{value}</div>
            <div className="mt-1 space-y-0.5">
              <Trend growth={growth} label={growthLabel} inverse={growthInverse} />
              {hint ? <div className="line-clamp-2 text-xs text-muted" title={typeof hint === 'string' ? hint : undefined}>{hint}</div> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function MetricGrid({ children, columns = 4, className = '' }: { children: ReactNode; columns?: 2 | 3 | 4; className?: string }) {
  const cols = columns === 4 ? 'xl:grid-cols-4' : columns === 3 ? 'lg:grid-cols-3' : '';
  return <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols} ${className}`}>{children}</div>;
}
