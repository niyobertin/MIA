import { isValidElement, type ReactNode } from 'react';
import type { PeriodValue } from '../ui/PeriodFilter';
import { describePeriod, exportReportPdf, type PdfStat, type PdfTable, type ReportPdfInput } from './pdf';

export type ExportFormat = 'pdf' | 'xlsx';

export type ExportColumn<T> = { header: string; cell: (row: T) => ReactNode; align?: 'right'; exportValue?: (row: T) => string | number | null | undefined };

const SKIP_HEADERS = new Set(['', 'actions', 'action', 'manage']);
const NUMBER_TEXT = /^[-−]?[\d,]+(\.\d+)?(\s?[A-Z]{3})?$/;

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
}

function walkText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(walkText).join(' ');
  if (isValidElement(node)) return walkText((node.props as { children?: ReactNode }).children);
  return '';
}

type Render = (node: ReactNode) => string;

async function loadRenderer(): Promise<Render> {
  try {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const scratch = document.createElement('div');
    return (node) => {
      try {
        scratch.innerHTML = renderToStaticMarkup(<>{node}</>);
        return scratch.textContent ?? '';
      } catch {
        return walkText(node);
      }
    };
  } catch {
    return walkText;
  }
}

function clean(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export function exportableColumns<T>(columns: ExportColumn<T>[]) {
  return columns.filter((column) => !SKIP_HEADERS.has(column.header.trim().toLowerCase()));
}

export async function rowsToTable<T>(title: string, columns: ExportColumn<T>[], rows: T[]): Promise<PdfTable> {
  const usable = exportableColumns(columns);
  const render = await loadRenderer();
  return {
    title,
    head: usable.map((column) => column.header),
    rows: rows.map((row) => usable.map((column) => {
      if (column.exportValue) return column.exportValue(row) ?? '';
      return clean(render(column.cell(row)));
    })),
    rightColumns: usable.flatMap((column, index) => (column.align === 'right' ? [index] : [])),
  };
}

function toNumber(value: string | number): number | null {
  if (typeof value === 'number') return value;
  const text = value.trim();
  if (!NUMBER_TEXT.test(text)) return null;
  const parsed = Number(text.replace(/[,\s]|[A-Z]{3}$/g, '').replace('−', '-'));
  return Number.isFinite(parsed) ? parsed : null;
}

function sheetName(title: string, used: Set<string>) {
  const base = title.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 25)} ${n++}`;
  used.add(name.toLowerCase());
  return name;
}

const HEADER = { fontWeight: 'bold' as const, backgroundColor: '#E7F6EF', color: '#0F7D54' };

export async function exportReportExcel(input: ReportPdfInput) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const used = new Set<string>();
  const generated = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());

  const summaryRows = [
    [{ value: input.businessName, fontWeight: 'bold' as const, fontSize: 14 }],
    [{ value: `${input.title} · ${describePeriod(input.period)}` }],
    [{ value: `Generated ${generated} · Currency ${input.currency}` }],
    [],
    ...(input.stats.length > 0
      ? [
          [{ value: 'Figure', ...HEADER }, { value: input.stats.some((s: PdfStat) => s.kind !== 'count') ? `Value (${input.currency})` : 'Value', ...HEADER }],
          ...input.stats.map((stat) => [{ value: stat.label }, { value: stat.value, type: Number, format: '#,##0' }]),
        ]
      : []),
  ];

  const sheets = [
    { data: summaryRows, sheet: sheetName('Summary', used), columns: [{ width: 36 }, { width: 22 }] },
    ...input.tables.map((table) => {
      const widths = table.head.map((head, index) => Math.min(48, Math.max(10, head.length + 2, ...table.rows.slice(0, 200).map((row) => String(row[index] ?? '').length + 2))));
      const numeric = new Set([...(table.moneyColumns ?? []), ...(table.rightColumns ?? [])]);
      return {
        sheet: sheetName(table.title, used),
        columns: widths.map((width) => ({ width })),
        stickyRowsCount: 1,
        data: [
          table.head.map((head) => ({ value: head, ...HEADER })),
          ...table.rows.map((row) => row.map((cell, index) => {
            const number = numeric.has(index) || typeof cell === 'number' ? toNumber(cell) : null;
            if (number !== null && !/^0\d/.test(String(cell).trim())) {
              return { value: number, type: Number, format: '#,##0' };
            }
            return { value: String(cell ?? '') };
          })),
        ],
      };
    }),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  await writeXlsxFile(sheets as never).toFile(`${slug(input.businessName)}-${slug(input.title)}-${stamp}.xlsx`);
}

export async function exportReport(format: ExportFormat, input: ReportPdfInput) {
  if (format === 'pdf') await exportReportPdf(input);
  else await exportReportExcel(input);
}

export function periodFromParams(params?: Record<string, string>): PeriodValue {
  const period = params?.period ?? 'all';
  if (period === 'custom' && params?.from && params?.to) return { period: 'custom', from: params.from, to: params.to };
  return { period: (['today', 'yesterday', 'week', 'month', 'year', '7d', '30d', '90d', 'all'].includes(period) ? period : 'all') as never };
}
