import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

export type ExportFormat = 'pdf' | 'xlsx';
export type ExportCell = string | number | null | undefined;
export type ExportColumn = { header: string; numeric?: boolean };
export type ExportSummary = { label: string; value: string | number };

export type ListExport = {
  title: string;
  businessName?: string;
  periodLabel?: string;
  currency?: string;
  summary?: ExportSummary[];
  columns: ExportColumn[];
  rows: ExportCell[][];
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
}

function fileName(data: ListExport, ext: string) {
  return `${slug(data.businessName ?? 'mia')}-${slug(data.title)}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function escapeHtml(value: ExportCell) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNumber(value: ExportCell) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : String(value ?? '');
}

function generatedAt() {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
}

export function buildListHtml(data: ListExport): string {
  const head = data.columns.map((c) => `<th class="${c.numeric ? 'num' : ''}">${escapeHtml(c.header)}</th>`).join('');
  const body = data.rows.length
    ? data.rows
        .map((row) => `<tr>${row.map((cell, i) => `<td class="${data.columns[i]?.numeric ? 'num' : ''}">${escapeHtml(formatNumber(cell))}</td>`).join('')}</tr>`)
        .join('')
    : `<tr><td colspan="${data.columns.length}" class="empty">Nothing recorded in this period.</td></tr>`;
  const summary = (data.summary ?? [])
    .map((s) => `<div class="stat"><div class="label">${escapeHtml(s.label)}</div><div class="value">${escapeHtml(formatNumber(s.value))}</div></div>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 28px; font-size: 11px; }
  .bar { height: 5px; background: #4338ca; margin: -28px -28px 18px; }
  h1 { font-size: 18px; margin: 0; }
  .meta { color: #64748b; margin-top: 4px; display: flex; justify-content: space-between; gap: 12px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  .stat { flex: 1 1 140px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 8px; padding: 8px 10px; }
  .stat .label { color: #64748b; font-size: 10px; }
  .stat .value { font-size: 14px; font-weight: 800; margin-top: 2px; }
  h2 { font-size: 13px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #eef2ff; color: #312e81; text-align: left; font-weight: 700; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .num { text-align: right; white-space: nowrap; }
  .empty { text-align: center; color: #64748b; padding: 18px; }
  .foot { margin-top: 16px; color: #94a3b8; font-size: 9px; text-align: right; }
</style></head><body>
<div class="bar"></div>
<h1>${escapeHtml(data.businessName ?? 'MIA')}</h1>
<div class="meta"><span>${escapeHtml(data.title)}${data.periodLabel ? ` · ${escapeHtml(data.periodLabel)}` : ''}</span><span>Generated ${escapeHtml(generatedAt())}${data.currency ? ` · ${escapeHtml(data.currency)}` : ''}</span></div>
${summary ? `<div class="stats">${summary}</div>` : ''}
<h2>${escapeHtml(data.title)} (${data.rows.length})</h2>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<div class="foot">MIA</div>
</body></html>`;
}

export function buildListWorkbook(data: ListExport): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const summaryRows: ExportCell[][] = [
    [data.businessName ?? 'MIA'],
    [`${data.title}${data.periodLabel ? ` · ${data.periodLabel}` : ''}`],
    [`Generated ${generatedAt()}${data.currency ? ` · Currency ${data.currency}` : ''}`],
    [],
    ...(data.summary?.length ? [['Figure', 'Value'], ...data.summary.map((s) => [s.label, s.value])] : []),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 34 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const header = data.columns.map((c) => c.header);
  const rows = data.rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : cell)));
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet['!cols'] = data.columns.map((c, i) => ({
    wch: Math.min(48, Math.max(10, c.header.length + 2, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))),
  }));
  const name = data.title.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Data';
  XLSX.utils.book_append_sheet(wb, sheet, name === 'Summary' ? 'Data' : name);
  return wb;
}

async function share(uri: string, mimeType: string, UTI: string, title: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('SHARING_UNAVAILABLE');
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: title });
}

export async function shareWorkbook(wb: XLSX.WorkBook, name: string, title: string): Promise<void> {
  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, name);
    return;
  }
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('CACHE_UNAVAILABLE');
  const uri = `${dir}${name}`;
  await FileSystem.writeAsStringAsync(uri, XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }), {
    encoding: FileSystem.EncodingType.Base64,
  });
  await share(uri, XLSX_MIME, 'org.openxmlformats.spreadsheetml.sheet', title);
}

export async function exportList(format: ExportFormat, data: ListExport): Promise<void> {
  if (format === 'pdf') {
    const html = buildListHtml(data);
    if (Platform.OS === 'web') {
      await Print.printAsync({ html });
      return;
    }
    const file = await Print.printToFileAsync({ html });
    await share(file.uri, 'application/pdf', 'com.adobe.pdf', data.title);
    return;
  }

  await shareWorkbook(buildListWorkbook(data), fileName(data, 'xlsx'), data.title);
}
