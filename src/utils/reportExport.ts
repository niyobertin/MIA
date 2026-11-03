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
  cogs?: number | null;
  grossProfit?: number | null;
  netProfit?: number | null;
  expenses: number;
  stockValue: number;
  topProducts: Array<{
    productName: string;
    quantitySold: number;
    totalSales: number;
    totalProfit?: number | null;
    margin?: number | null;
  }>;
  payments: Array<{
    label: string;
    amount: number;
  }>;
  expenseItems?: Array<{
    date: string;
    category: string;
    description: string;
    amount: number;
    paymentMethod: string;
  }>;
  transactions?: Array<{
    date: string;
    type: string;
    title: string;
    party: string;
    amount: number;
    outflow: boolean;
    status: string;
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

  // Compute product totals
  const totalTopQty = data.topProducts.reduce((sum, p) => sum + p.quantitySold, 0);
  const totalTopSales = data.topProducts.reduce((sum, p) => sum + p.totalSales, 0);

  // Compute payments total
  const totalPayments = data.payments.reduce((sum, p) => sum + p.amount, 0);

  const profitSection = data.includeProfit
    ? `
      <tr>
        <td><strong>Cost of Goods Sold (COGS)</strong></td>
        <td class="num font-bold text-danger">${money(data.cogs ?? 0)}</td>
        <td class="num text-muted">${data.totalSales > 0 ? Math.round(((data.cogs ?? 0) / data.totalSales) * 100) : 0}%</td>
      </tr>
      <tr>
        <td><strong>Gross Profit</strong></td>
        <td class="num font-bold text-success">${money(data.grossProfit ?? 0)}</td>
        <td class="num text-muted">${data.totalSales > 0 ? Math.round(((data.grossProfit ?? 0) / data.totalSales) * 100) : 0}%</td>
      </tr>
      <tr>
        <td><strong>Operating Expenses</strong></td>
        <td class="num font-bold text-danger">${money(data.expenses)}</td>
        <td class="num text-muted">${data.totalSales > 0 ? Math.round((data.expenses / data.totalSales) * 100) : 0}%</td>
      </tr>
      <tr class="highlight-row">
        <td><strong>Net Profit (Take-home)</strong></td>
        <td class="num font-bold ${((data.netProfit ?? 0) >= 0) ? 'text-success' : 'text-danger'}">${money(data.netProfit ?? 0)}</td>
        <td class="num font-bold">${data.totalSales > 0 ? Math.round(((data.netProfit ?? 0) / data.totalSales) * 100) : 0}%</td>
      </tr>
    `
    : `
      <tr>
        <td><strong>Operating Expenses</strong></td>
        <td class="num font-bold text-danger">${money(data.expenses)}</td>
        <td class="num text-muted">—</td>
      </tr>
    `;

  const topColspan = data.includeProfit ? 7 : 5;
  const topRows = data.topProducts.length
    ? data.topProducts
        .map((p, i) => {
          const share = totalTopSales > 0 ? Math.round((p.totalSales / totalTopSales) * 100) : 0;
          const profitCells = data.includeProfit
            ? `<td class="num text-success">${p.totalProfit != null ? money(p.totalProfit) : '—'}</td>
               <td class="num text-muted">${p.margin != null ? `${p.margin}%` : '—'}</td>`
            : '';
          return `
      <tr>
        <td class="text-center text-muted">${i + 1}</td>
        <td><strong>${escapeHtml(p.productName)}</strong></td>
        <td class="num">${p.quantitySold.toLocaleString()}</td>
        <td class="num font-bold">${money(p.totalSales)}</td>
        <td class="num text-muted">${share}%</td>
        ${profitCells}
      </tr>`;
        })
        .join('')
    : `<tr><td colspan="${topColspan}" class="text-center text-muted" style="padding: 16px;">No sales recorded for this period</td></tr>`;

  const payRows = data.payments.length
    ? data.payments
        .map((p) => {
          const share = totalPayments > 0 ? Math.round((p.amount / totalPayments) * 100) : 0;
          return `
      <tr>
        <td><strong>${escapeHtml(p.label)}</strong></td>
        <td class="num font-bold">${money(p.amount)}</td>
        <td class="num text-muted">${share}%</td>
      </tr>`;
        })
        .join('')
    : `<tr><td colspan="3" class="text-center text-muted" style="padding: 16px;">No payment activity recorded</td></tr>`;

  const sectionNum = (n: number) => String(n);
  let nextSection = 4;

  const expenseSection = (data.expenseItems && data.expenseItems.length > 0)
    ? (() => {
        const n = nextSection++;
        return `
  <div class="section-title">
    <span>${sectionNum(n)}. Expense Detail</span>
    <span style="font-size:10px;color:#64748b;text-transform:none;">All recorded expenses</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Description</th>
        <th>Method</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${data.expenseItems.map((e) => `
      <tr>
        <td class="text-muted">${escapeHtml(e.date)}</td>
        <td>${escapeHtml(e.category)}</td>
        <td>${escapeHtml(e.description || '—')}</td>
        <td class="text-muted">${escapeHtml(e.paymentMethod)}</td>
        <td class="num font-bold text-danger">${money(e.amount)}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4">TOTAL EXPENSES</td>
        <td class="num">${money(data.expenses)}</td>
      </tr>
    </tfoot>
  </table>`;
      })()
    : '';

  const txSection = (data.transactions && data.transactions.length > 0)
    ? (() => {
        const n = nextSection++;
        return `
  <div class="section-title">
    <span>${sectionNum(n)}. Transaction Log</span>
    <span style="font-size:10px;color:#64748b;text-transform:none;">${data.transactions.length} records</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Description</th>
        <th>Party</th>
        <th class="num">Amount</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${data.transactions.map((tx) => `
      <tr>
        <td class="text-muted" style="white-space:nowrap;">${escapeHtml(tx.date)}</td>
        <td><span style="text-transform:capitalize;">${escapeHtml(tx.type)}</span></td>
        <td>${escapeHtml(tx.title)}</td>
        <td class="text-muted">${escapeHtml(tx.party || '—')}</td>
        <td class="num font-bold ${tx.outflow ? 'text-danger' : 'text-success'}">${tx.outflow ? '−' : '+'}${money(tx.amount)}</td>
        <td class="text-muted">${escapeHtml(tx.status)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
      })()
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.businessName)} - Financial Report</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 0;
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 14px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .business-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px;
      letter-spacing: -0.02em;
    }
    .report-badge {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }
    .meta-box {
      text-align: right;
      font-size: 11px;
      color: #64748b;
    }
    .meta-box strong {
      color: #334155;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 22px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 4px;
    }
    .kpi-val {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }
    .kpi-card.hero {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    .kpi-card.hero .kpi-val {
      color: #15803d;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #1e293b;
      margin: 20px 0 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 12px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.04em;
      padding: 8px 10px;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      text-align: left;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
      color: #1e293b;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    tfoot td {
      background: #f1f5f9 !important;
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      font-weight: 800;
      color: #0f172a;
      font-size: 12px;
    }
    .highlight-row td {
      background: #fef9c3 !important;
      border-top: 1px solid #fde047;
      border-bottom: 2px solid #ca8a04;
    }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .text-center {
      text-align: center;
    }
    .text-muted {
      color: #64748b;
    }
    .text-success {
      color: #16a34a;
    }
    .text-danger {
      color: #dc2626;
    }
    .font-bold {
      font-weight: 700;
    }
    .signatures {
      margin-top: 36px;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
    }
    .signature-block {
      width: 45%;
      border-top: 1px dashed #94a3b8;
      padding-top: 6px;
      font-size: 11px;
      color: #475569;
    }
    .footer {
      margin-top: 24px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="business-title">${escapeHtml(data.businessName)}</div>
      <div>
        <span class="report-badge">Business Financial Report</span>
        ${data.businessCode ? `<span style="font-size:11px;color:#64748b;margin-left:6px;">Code: <strong>${escapeHtml(data.businessCode)}</strong></span>` : ''}
      </div>
    </div>
    <div class="meta-box">
      <div>Period: <strong>${escapeHtml(data.periodLabel)}</strong></div>
      <div>Generated: <strong>${escapeHtml(data.generatedAt)}</strong></div>
      <div>Currency: <strong>${escapeHtml(currency)}</strong></div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card hero">
      <div class="kpi-label">Total Sales</div>
      <div class="kpi-val">${money(data.totalSales)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Items Sold</div>
      <div class="kpi-val">${data.itemsSold.toLocaleString()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Operating Expenses</div>
      <div class="kpi-val text-danger">${money(data.expenses)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${data.includeProfit ? 'Net Profit' : 'Stock Value'}</div>
      <div class="kpi-val ${data.includeProfit && (data.netProfit ?? 0) >= 0 ? 'text-success' : ''}">
        ${data.includeProfit ? money(data.netProfit ?? 0) : money(data.stockValue)}
      </div>
    </div>
  </div>

  <div class="section-title">
    <span>1. Financial Summary</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Financial Metric</th>
        <th class="num">Amount (${escapeHtml(currency)})</th>
        <th class="num">Ratio (% Sales)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Gross Sales Revenue</strong></td>
        <td class="num font-bold">${money(data.totalSales)}</td>
        <td class="num">100%</td>
      </tr>
      ${profitSection}
      <tr>
        <td><strong>Inventory Valuation (Current)</strong></td>
        <td class="num font-bold">${money(data.stockValue)}</td>
        <td class="num text-muted">—</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">
    <span>2. Top Selling Products</span>
    <span style="font-size:10px;color:#64748b;text-transform:none;">Ranked by revenue</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 36px;" class="text-center">#</th>
        <th>Product Name</th>
        <th class="num">Units Sold</th>
        <th class="num">Total Revenue</th>
        <th class="num">Share</th>
        ${data.includeProfit ? '<th class="num">Profit</th><th class="num">Margin</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${topRows}
    </tbody>
    ${data.topProducts.length ? `
    <tfoot>
      <tr>
        <td colspan="2">TOTAL TOP PRODUCTS</td>
        <td class="num">${totalTopQty.toLocaleString()}</td>
        <td class="num">${money(totalTopSales)}</td>
        <td class="num">100%</td>
        ${data.includeProfit ? '<td class="num">—</td><td class="num">—</td>' : ''}
      </tr>
    </tfoot>` : ''}
  </table>

  <div class="section-title">
    <span>3. Cash Flow & Payments Collected</span>
    <span style="font-size:10px;color:#64748b;text-transform:none;">By channel</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Payment Channel / Category</th>
        <th class="num">Amount Collected</th>
        <th class="num">Share</th>
      </tr>
    </thead>
    <tbody>
      ${payRows}
    </tbody>
    ${data.payments.length ? `
    <tfoot>
      <tr>
        <td>TOTAL RECORDED COLLECTIONS</td>
        <td class="num">${money(totalPayments)}</td>
        <td class="num">100%</td>
      </tr>
    </tfoot>` : ''}
  </table>

  ${expenseSection}
  ${txSection}

  <div class="signatures">
    <div class="signature-block">
      <strong>Prepared By:</strong> ________________________<br/>
      Date: ________________________
    </div>
    <div class="signature-block">
      <strong>Approved / Verified By:</strong> ________________________<br/>
      Date: ________________________
    </div>
  </div>

  <div class="footer">
    <span>MIA Business &amp; Inventory Management System</span>
    <span>Confidential Official Document · Generated on ${escapeHtml(data.generatedAt)}</span>
  </div>
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
