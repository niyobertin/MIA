import { useState } from 'react';
import { EmptyNotice } from './kit';

export type TrendPoint = { label: string; value: number };

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 14, right: 12, bottom: 26, left: 12 };

export function TrendChart({ points, format, name }: { points: TrendPoint[]; format: (value: number) => string; name: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((point) => point.value), 0);
  if (max === 0) return <EmptyNotice>No {name.toLowerCase()} in this period.</EmptyNotice>;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const current = active === null ? null : points[active];

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          role="img"
          aria-label={`${name} by day. Highest day ${format(max)}.`}
          onMouseLeave={() => setActive(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
          }}
        >
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="#e2e8f0" />
          <path d={area} fill="#059669" fillOpacity="0.1" />
          <path d={line} fill="none" stroke="#059669" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((point, index) => (index % labelEvery === 0 ? (
            <text key={point.label} x={x(index)} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill="#64748b">{point.label}</text>
          ) : null))}
          {current && active !== null ? (
            <>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="#94a3b8" strokeDasharray="3 3" />
              <circle cx={x(active)} cy={y(current.value)} r="5" fill="#059669" stroke="#fff" strokeWidth="2" />
            </>
          ) : null}
        </svg>
        {current && active !== null ? (
          <div
            className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow"
            style={{ left: `${Math.min(85, Math.max(15, (x(active) / WIDTH) * 100))}%` }}
          >
            <div className="text-slate-300">{current.label}</div>
            <div className="font-semibold">{format(current.value)}</div>
          </div>
        ) : null}
      </div>
      <details className="mt-2 text-sm text-slate-600">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">View as table</summary>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {points.map((point) => (
              <tr key={point.label} className="border-t border-slate-100">
                <td className="py-1">{point.label}</td>
                <td className="py-1 text-right tabular-nums">{format(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function BarList({ items, format, empty }: { items: { label: string; value: number }[]; format: (value: number) => string; empty: string }) {
  const max = Math.max(...items.map((item) => item.value), 0);
  if (items.length === 0 || max === 0) return <EmptyNotice>{empty}</EmptyNotice>;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} title={`${item.label}: ${format(item.value)}`}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700 truncate">{item.label}</span>
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
