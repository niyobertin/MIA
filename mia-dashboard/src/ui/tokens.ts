export const surfaceCard = 'bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(16,25,43,0.04)]';

export const TONES = {
  green: { icon: 'bg-emerald-100 text-emerald-700', stroke: '#159b69', fill: '#d1fae5', soft: 'bg-emerald-50/60 border-emerald-100' },
  blue: { icon: 'bg-sky-100 text-sky-700', stroke: '#3b82f6', fill: '#dbeafe', soft: 'bg-sky-50/60 border-sky-100' },
  violet: { icon: 'bg-violet-100 text-violet-700', stroke: '#7c3aed', fill: '#ede9fe', soft: 'bg-violet-50/60 border-violet-100' },
  amber: { icon: 'bg-amber-100 text-amber-700', stroke: '#f59e0b', fill: '#fef3c7', soft: 'bg-amber-50/60 border-amber-100' },
  red: { icon: 'bg-rose-100 text-rose-700', stroke: '#ef4444', fill: '#fee2e2', soft: 'bg-rose-50/60 border-rose-100' },
  slate: { icon: 'bg-slate-100 text-slate-600', stroke: '#64748b', fill: '#f1f5f9', soft: 'bg-slate-50 border-slate-100' },
} as const;

export type Tone = keyof typeof TONES;
