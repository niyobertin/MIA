import type { PeriodValue } from '../ui/PeriodFilter';
import { axisLabelIndexes, monotoneSegments } from '../ui/chartUtils';

export type PdfStat = { label: string; value: number; kind?: 'money' | 'count' };
export type PdfTable = { title: string; head: string[]; rows: (string | number)[][]; moneyColumns?: number[]; rightColumns?: number[] };
export type PdfTrend = { title: string; labels: string[]; series: { name: string; color: string; values: number[] }[] };

export type ReportPdfInput = {
  businessName: string;
  title: string;
  period: PeriodValue;
  currency: string;
  stats: PdfStat[];
  trend?: PdfTrend;
  tables: PdfTable[];
  fileName?: string;
};

const PRESET_LABELS: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

function longDay(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function describePeriod(period: PeriodValue) {
  return period.period === 'custom' ? `${longDay(period.from)} – ${longDay(period.to)}` : PRESET_LABELS[period.period];
}

export function pdfMoney(amount: number, currency = 'RWF') {
  return `${new Intl.NumberFormat('en-US').format(Math.round(amount ?? 0))} ${currency}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
}

const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const BRAND: [number, number, number] = [4, 120, 87];
const MARGIN = 40;

export async function buildReportPdf(input: ReportPdfInput) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const money = (value: number) => pdfMoney(value, input.currency);
  const generated = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;

  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 6, 'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(input.businessName, MARGIN, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(`${input.title} · ${describePeriod(input.period)}`, MARGIN, 62);
  doc.text(`Generated ${generated}`, pageW - MARGIN, 44, { align: 'right' });
  doc.text(`Currency: ${input.currency}`, pageW - MARGIN, 62, { align: 'right' });

  let y = 84;
  const columns = 3;
  const gap = 10;
  const boxW = (contentW - gap * (columns - 1)) / columns;
  const boxH = 46;
  input.stats.forEach((stat, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const bx = MARGIN + col * (boxW + gap);
    const by = y + row * (boxH + gap);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(bx, by, boxW, boxH, 6, 6, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(stat.label, bx + 10, by + 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...INK);
    doc.text(stat.kind === 'count' ? new Intl.NumberFormat('en-US').format(stat.value) : money(stat.value), bx + 10, by + 35);
    doc.setFont('helvetica', 'normal');
  });
  y += Math.ceil(input.stats.length / columns) * (boxH + gap) + 8;

  const trend = input.trend;
  if (trend && trend.labels.length > 0 && trend.series.some((series) => series.values.some((value) => value > 0))) {
    const chartH = 150;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(trend.title, MARGIN, y + 4);
    doc.setFont('helvetica', 'normal');
    let legendX = pageW - MARGIN;
    [...trend.series].reverse().forEach((series) => {
      doc.setFontSize(9);
      const width = doc.getTextWidth(series.name);
      legendX -= width;
      doc.setTextColor(...MUTED);
      doc.text(series.name, legendX, y + 4);
      doc.setFillColor(...hexToRgb(series.color));
      doc.circle(legendX - 7, y + 1, 3, 'F');
      legendX -= 20;
    });
    const top = y + 18;
    const left = MARGIN + 44;
    const width = contentW - 44;
    const peak = Math.max(1, ...trend.series.flatMap((series) => series.values));
    const px = (index: number) => left + (trend.labels.length === 1 ? width / 2 : (index / (trend.labels.length - 1)) * width);
    const py = (value: number) => top + chartH - (Math.max(0, value) / peak) * chartH;
    doc.setFontSize(8);
    [0, 0.5, 1].forEach((ratio) => {
      const gy = top + chartH - ratio * chartH;
      doc.setDrawColor(ratio === 0 ? 203 : 236, ratio === 0 ? 213 : 240, ratio === 0 ? 225 : 244);
      doc.line(left, gy, left + width, gy);
      doc.setTextColor(...MUTED);
      doc.text(new Intl.NumberFormat('en-US', { notation: 'compact' }).format(peak * ratio), left - 6, gy + 3, { align: 'right' });
    });
    axisLabelIndexes(trend.labels.length, 8).forEach((index) => {
      const align = trend.labels.length === 1 ? 'center' : index === 0 ? 'left' : index === trend.labels.length - 1 ? 'right' : 'center';
      doc.text(trend.labels[index], px(index), top + chartH + 12, { align });
    });
    doc.setLineWidth(1.6);
    trend.series.forEach((series) => {
      doc.setDrawColor(...hexToRgb(series.color));
      const points = series.values.map((value, i) => [px(i), py(value)] as [number, number]);
      const segments = monotoneSegments(points, top, top + chartH);
      if (segments.length === 0) return;
      let [cx, cy] = points[0];
      const rel = segments.map((seg) => {
        const step = [seg.c1[0] - cx, seg.c1[1] - cy, seg.c2[0] - cx, seg.c2[1] - cy, seg.end[0] - cx, seg.end[1] - cy];
        [cx, cy] = seg.end;
        return step;
      });
      doc.lines(rel, points[0][0], points[0][1], [1, 1], 'S');
    });
    doc.setLineWidth(0.5);
    y = top + chartH + 30;
  }

  for (const table of input.tables) {
    if (y > pageH - 120) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(table.title, MARGIN, y + 4);
    doc.setFont('helvetica', 'normal');
    const moneyCols = new Set(table.moneyColumns ?? []);
    const rightCols = new Set([...(table.rightColumns ?? []), ...moneyCols]);
    const body = table.rows.length > 0
      ? table.rows.map((row) => row.map((cell, index) => (moneyCols.has(index) && typeof cell === 'number' ? money(cell) : String(cell))))
      : [[{ content: 'Nothing recorded in this period.', colSpan: table.head.length, styles: { halign: 'center' as const, textColor: MUTED } }]];
    autoTable(doc, {
      startY: y + 12,
      head: [table.head],
      body,
      margin: { left: MARGIN, right: MARGIN },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [236, 253, 245], textColor: BRAND, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries([...rightCols].map((index) => [index, { halign: 'right' as const }])),
      didParseCell: (data) => {
        if (data.section === 'head' && rightCols.has(data.column.index)) data.cell.styles.halign = 'right';
      },
    });
    y = lastY() + 26;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${input.businessName} · ${input.title}`, MARGIN, pageH - 20);
    doc.text(`Page ${page} of ${pages} · MIA`, pageW - MARGIN, pageH - 20, { align: 'right' });
  }

  return doc;
}

export async function exportReportPdf(input: ReportPdfInput) {
  const doc = await buildReportPdf(input);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(input.fileName ?? `${slug(input.businessName)}-${slug(input.title)}-${stamp}.pdf`);
}
