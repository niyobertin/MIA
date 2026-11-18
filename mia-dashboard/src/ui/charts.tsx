import { useEffect, useId, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { EmptyNotice } from './kit';
import { CHART_COLORS, compactNumber, monotonePath, axisLabelIndexes } from './chartUtils';

export type TrendPoint = { label: string; value: number };
export type Series = { name: string; color: string; values: number[] };


const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 30, left: 52 };

function useWidth<T extends HTMLElement>(fallback = 720) {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!node) return;
    const update = () => setWidth(Math.max(240, Math.round(node.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width] as const;
}

function niceScale(value: number) {
  if (value <= 0) return { top: 1, ticks: [0, 1] };
  const raw = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= raw) ?? 10) * magnitude;
  const count = Math.ceil(value / step);
  return { top: step * count, ticks: Array.from({ length: count + 1 }, (_, index) => index * step) };
}



export function CurveChart({ labels, series, format, name }: { labels: string[]; series: Series[]; format: (value: number) => string; name: string }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradientBase = useId().replace(/:/g, '');
  const peak = Math.max(0, ...series.flatMap((item) => item.values));
  if (labels.length === 0 || peak === 0) return <EmptyNotice>No {name.toLowerCase()} in this period.</EmptyNotice>;

  const { top, ticks } = niceScale(peak);
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + innerH;
  const x = (index: number) => PAD.left + (labels.length === 1 ? innerW / 2 : (index / (labels.length - 1)) * innerW);
  const y = (value: number) => baseline - (Math.max(0, value) / top) * innerH;
  const maxLabels = Math.max(2, Math.floor(innerW / 64));

  const pick = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = labels.length === 1 ? 0 : (px - PAD.left) / innerW;
    setActive(Math.min(labels.length - 1, Math.max(0, Math.round(ratio * (labels.length - 1)))));
  };

  const tooltipLeft = active === null ? 0 : Math.min(width - 90, Math.max(90, x(active)));
  const summary = series.map((item) => `${item.name} total ${format(item.values.reduce((sum, value) => sum + value, 0))}`).join('. ');

  return (
    <div>
      {series.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
          {series.map((item) => (
            <span key={item.name} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              {item.name}
            </span>
          ))}
        </div>
      ) : null}
      <div ref={wrapRef} className="relative select-none">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block max-w-full touch-pan-y"
          role="img"
          aria-label={`${name} by day. ${summary}.`}
          onPointerLeave={(event) => { if (event.pointerType === 'mouse') setActive(null); }}
          onPointerMove={pick}
          onPointerDown={pick}
        >
          <defs>
            {series.map((item, index) => (
              <linearGradient key={item.name} id={`${gradientBase}-${index}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity={series.length > 1 ? 0.18 : 0.28} />
                <stop offset="100%" stopColor={item.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? '#cbd5e1' : '#f1f5f9'} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.35em" textAnchor="end" fontSize="11" fill="#94a3b8">{compactNumber(tick)}</text>
            </g>
          ))}
          {axisLabelIndexes(labels.length, maxLabels).map((index) => (
            <text key={index} x={x(index)} y={HEIGHT - 9} textAnchor={labels.length === 1 ? 'middle' : index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#64748b">{labels[index]}</text>
          ))}
          {series.map((item, index) => {
            const coords = item.values.map((value, i) => [x(i), y(value)] as [number, number]);
            const line = monotonePath(coords, PAD.top, baseline);
            const area = labels.length > 1 ? `${line} L${x(labels.length - 1)},${baseline} L${x(0)},${baseline} Z` : '';
            return (
              <g key={item.name}>
                {area ? <path d={area} fill={`url(#${gradientBase}-${index})`} /> : null}
                <path d={line} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {labels.length === 1 ? <circle cx={x(0)} cy={y(item.values[0])} r="4" fill={item.color} /> : null}
              </g>
            );
          })}
          {active !== null ? (
            <>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={baseline} stroke="#94a3b8" strokeDasharray="3 3" />
              {series.map((item) => (
                <circle key={item.name} cx={x(active)} cy={y(item.values[active] ?? 0)} r="5" fill={item.color} stroke="#fff" strokeWidth="2" />
              ))}
            </>
          ) : null}
        </svg>
        {active !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{ left: tooltipLeft }}
          >
            <div className="text-slate-300">{labels[active]}</div>
            {series.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5 font-semibold">
                {series.length > 1 ? <span className="h-2 w-2 rounded-full" style={{ background: item.color }} /> : null}
                {series.length > 1 ? <span className="font-normal text-slate-300">{item.name}</span> : null}
                <span>{format(item.values[active] ?? 0)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <details className="mt-2 text-sm text-slate-600">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">View as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            {series.length > 1 ? (
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="py-1 text-left font-medium">Day</th>
                  {series.map((item) => <th key={item.name} className="py-1 text-right font-medium">{item.name}</th>)}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {labels.map((label, index) => (
                <tr key={`${label}-${index}`} className="border-t border-slate-100">
                  <td className="py-1">{label}</td>
                  {series.map((item) => <td key={item.name} className="py-1 text-right tabular-nums">{format(item.values[index] ?? 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function TrendChart({ points, format, name, color = CHART_COLORS[0] }: { points: TrendPoint[]; format: (value: number) => string; name: string; color?: string }) {
  return <CurveChart name={name} format={format} labels={points.map((point) => point.label)} series={[{ name, color, values: points.map((point) => point.value) }]} />;
}

export function DonutChart({ items, format, empty, centerLabel = 'Total' }: { items: { label: string; value: number }[]; format: (value: number) => string; empty: string; centerLabel?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const visible = items.filter((item) => item.value > 0);
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return <EmptyNotice>{empty}</EmptyNotice>;

  const size = 180;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = visible.length > 1 ? 2 : 0;
  const lengths = visible.map((item) => (item.value / total) * circumference);
  const slices = visible.map((item, index) => ({
    ...item,
    color: CHART_COLORS[index % CHART_COLORS.length],
    length: lengths[index],
    offset: lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  }));
  const current = active === null ? null : slices[active];

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={slices.map((slice) => `${slice.label} ${format(slice.value)}`).join(', ')} className="shrink-0" onPointerLeave={() => setActive(null)}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((slice, index) => (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={active === index ? stroke + 6 : stroke}
              strokeDasharray={`${Math.max(0.5, slice.length - gap)} ${circumference}`}
              strokeDashoffset={-slice.offset}
              opacity={active === null || active === index ? 1 : 0.35}
              className="cursor-pointer transition-all"
              onPointerEnter={() => setActive(index)}
              onPointerDown={() => setActive(index)}
            />
          ))}
        </g>
        <text x={size / 2} y={size / 2 - 8} textAnchor="middle" fontSize="11" fill="#64748b">{current ? current.label : centerLabel}</text>
        <text x={size / 2} y={size / 2 + 12} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a">{compactNumber(current ? current.value : total)}</text>
      </svg>
      <ul className="min-w-[12rem] flex-1 space-y-2">
        {slices.map((slice, index) => (
          <li
            key={slice.label}
            className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-sm ${active === index ? 'bg-slate-50' : ''}`}
            onPointerEnter={() => setActive(index)}
            onPointerLeave={() => setActive(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
              <span className="truncate font-medium text-slate-700">{slice.label}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums text-slate-500">
              {format(slice.value)} <span className="text-xs text-slate-400">· {Math.round((slice.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({ items, format, empty }: { items: { label: string; value: number; hint?: string }[]; format: (value: number) => string; empty: string }) {
  const max = Math.max(...items.map((item) => item.value), 0);
  if (items.length === 0 || max === 0) return <EmptyNotice>{empty}</EmptyNotice>;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} title={`${item.label}: ${format(item.value)}`}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700 truncate">{item.label}{item.hint ? <span className="ml-1.5 text-xs font-normal text-slate-400">{item.hint}</span> : null}</span>
            <span className="tabular-nums text-slate-500 shrink-0">{format(item.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-slate-100">
            <div className="h-2 rounded bg-emerald-600" style={{ width: `${Math.max(1.5, (item.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
