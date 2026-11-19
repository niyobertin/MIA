export const CHART_COLORS = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#e11d48', '#0d9488', '#64748b'];

export function compactNumber(value: number) {
  const abs = Math.abs(value);
  const units: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${Number((value / size).toFixed(abs / size >= 100 ? 0 : 1))}${suffix}`;
  }
  if (!Number.isInteger(value) && abs < 10) return String(Number(value.toFixed(abs < 1 ? 2 : 1)));
  return String(Math.round(value));
}

export type Segment = { c1: [number, number]; c2: [number, number]; end: [number, number] };

export function monotoneSegments(points: [number, number][], minY: number, maxY: number): Segment[] {
  const n = points.length;
  if (n < 2) return [];
  const clamp = (y: number) => Math.min(maxY, Math.max(minY, y));
  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    h.push(points[i + 1][0] - points[i][0]);
    s.push(h[i] === 0 ? 0 : (points[i + 1][1] - points[i][1]) / h[i]);
  }
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    if (s[i - 1] * s[i] <= 0) continue;
    const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
    m[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p));
  }
  m[0] = n > 2 ? (3 * s[0] - m[1]) / 2 : s[0];
  m[n - 1] = n > 2 ? (3 * s[n - 2] - m[n - 2]) / 2 : s[0];
  if (Math.sign(m[0]) !== Math.sign(s[0])) m[0] = 0;
  if (Math.sign(m[n - 1]) !== Math.sign(s[n - 2])) m[n - 1] = 0;
  return points.slice(0, -1).map(([x0, y0], i) => {
    const dx = h[i] / 3;
    const [x1, y1] = points[i + 1];
    return { c1: [x0 + dx, clamp(y0 + dx * m[i])], c2: [x1 - dx, clamp(y1 - dx * m[i + 1])], end: [x1, y1] };
  });
}

export function monotonePath(points: [number, number][], minY: number, maxY: number) {
  if (points.length === 0) return '';
  const start = `M${points[0][0]},${points[0][1]}`;
  return monotoneSegments(points, minY, maxY).reduce((d, seg) => `${d} C${seg.c1[0]},${seg.c1[1]} ${seg.c2[0]},${seg.c2[1]} ${seg.end[0]},${seg.end[1]}`, start);
}

export function axisLabelIndexes(count: number, maxLabels: number) {
  if (count <= 0) return [];
  const every = Math.max(1, Math.ceil(count / Math.max(2, maxLabels)));
  const indexes: number[] = [];
  for (let i = 0; i < count - 1; i += every) {
    if (count - 1 - i >= every * 0.6) indexes.push(i);
  }
  indexes.push(count - 1);
  return indexes;
}
