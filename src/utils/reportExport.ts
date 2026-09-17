import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatCurrency } from '@/services/financial/calculations';

export interface ReportExportData {
  businessName: string;
  businessCode?: string | null;
  currency?: string;
  periodLabel: string;
  generatedAt: string;
  totalSales: number;
  itemsSold: number;
  grossProfit?: number | null;
  netProfit?: number | null;
  expenses: number;
  stockValue: number;
  topProducts: Array<{
    productName: string;
    quantitySold: number;
    totalSales: number;
  }>;
  payments: Array<{
    label: string;
    amount: number;
  }>;
  includeProfit: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReportHtml(data: ReportExportData): string {
  const currency = data.currency ?? 'RWF';
  const money = (n: number) => escapeHtml(formatCurrency(n, currency));

  const profitRows = data.includeProfit
    ? `
      <tr><td>Gross profit</td><td class="num">${money(data.grossProfit ?? 0)}</td></tr>
      <tr><td>Net profit</td><td class="num">${money(data.netProfit ?? 0)}</td></tr>
    `
    : '';

  const topRows = data.topProducts.length
    ? data.topProducts
        .map(
          (p, i) => `
      <tr>
        <td>${i + 1}. ${escapeHtml(p.productName)}</td>
        <td class="num">${p.quantitySold}</td>
        <td class="num">${money(p.totalSales)}</td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="3">No sales in this period</td></tr>`;

  const payRows = data.payments.length
    ? data.payments
        .map(
          (p) => `
      <tr>
        <td>${escapeHtml(p.label)}</td>
        <td class="num">${money(p.amount)}</td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="2">No payments in this period</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .muted { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
    h2 { font-size: 14px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: left; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .hero td { font-size: 15px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${escapeHtml(data.businessName)}</h1>
  <div class="muted">
    ${data.businessCode ? `Code: ${escapeHtml(data.businessCode)} · ` : ''}
    Period: ${escapeHtml(data.periodLabel)}<br/>
    Generated: ${escapeHtml(data.generatedAt)}
  </div>

  <h2>Summary</h2>
  <table class="hero">
    <tr><td>Total sales</td><td class="num">${money(data.totalSales)}</td></tr>
    <tr><td>Items sold</td><td class="num">${data.itemsSold}</td></tr>
    ${profitRows}
    <tr><td>Expenses</td><td class="num">${money(data.expenses)}</td></tr>
    <tr><td>Stock value</td><td class="num">${money(data.stockValue)}</td></tr>
  </table>

  <h2>Top products</h2>
  <table>
    <tr><th>Product</th><th class="num">Qty</th><th class="num">Sales</th></tr>
    ${topRows}
  </table>

  <h2>Payments</h2>
  <table>
    ${payRows}
  </table>
</body>
</html>`;
}

export async function shareReportPdf(data: ReportExportData): Promise<void> {
  const html = buildReportHtml(data);
  const file = await Print.printToFileAsync({ html });

  if (Platform.OS === 'web') {
    return;
  }

  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Export report',
      UTI: 'com.adobe.pdf',
    });
    return;
  }

  await Print.printAsync({ html });
}
