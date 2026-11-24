import * as XLSX from 'xlsx';
import { buildListHtml, buildListWorkbook, type ListExport } from '@/utils/listExport';
import { buildReportWorkbook } from '@/utils/reportExport';

const sample: ListExport = {
  title: 'Customers',
  businessName: 'Demo <Shop>',
  periodLabel: 'This month',
  currency: 'RWF',
  summary: [{ label: 'Owed to you', value: 52200 }],
  columns: [{ header: 'Name' }, { header: 'Phone' }, { header: 'Balance owed', numeric: true }],
  rows: [
    ['Uwase & Sons', '0788510000', 16000],
    ['Keza', null, 0],
  ],
};

describe('list export', () => {
  it('builds an Excel workbook with a summary sheet and a data sheet', () => {
    const wb = buildListWorkbook(sample);
    expect(wb.SheetNames).toEqual(['Summary', 'Customers']);
    const data = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Customers, { header: 1 });
    expect(data[0]).toEqual(['Name', 'Phone', 'Balance owed']);
    expect(data[1]).toEqual(['Uwase & Sons', '0788510000', 16000]);
    expect(typeof data[1][2]).toBe('number');
    expect(typeof data[1][1]).toBe('string');
    const summary = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Summary, { header: 1 });
    expect(summary).toContainEqual(['Owed to you', 52200]);
  });

  it('round-trips through a real xlsx file', () => {
    const base64 = XLSX.write(buildListWorkbook(sample), { type: 'base64', bookType: 'xlsx' });
    const back = XLSX.read(base64, { type: 'base64' });
    expect(back.SheetNames).toEqual(['Summary', 'Customers']);
  });

  it('escapes text in the PDF page and right-aligns numbers', () => {
    const html = buildListHtml(sample);
    expect(html).toContain('Demo &lt;Shop&gt;');
    expect(html).toContain('Uwase &amp; Sons');
    expect(html).not.toContain('<Shop>');
    expect(html).toContain('<td class="num">16,000</td>');
    expect(html).toContain('Customers · This month');
  });

  it('shows a friendly line when there are no rows', () => {
    expect(buildListHtml({ ...sample, rows: [] })).toContain('Nothing recorded in this period.');
  });
});

describe('report export', () => {
  it('puts each part of the report on its own sheet', () => {
    const wb = buildReportWorkbook({
      businessName: 'Demo Shop',
      periodLabel: 'This week',
      generatedAt: 'now',
      totalSales: 100000,
      itemsSold: 12,
      cogs: 60000,
      grossProfit: 40000,
      netProfit: 30000,
      expenses: 10000,
      stockValue: 500000,
      topProducts: [{ productName: 'Rice', quantitySold: 3, totalSales: 96000, totalProfit: 10000, margin: 10 }],
      payments: [{ label: 'Cash', amount: 80000 }],
      transactions: [{ date: '2026-11-24', type: 'sale', title: 'S-1', party: 'Walk-in', amount: 5000, outflow: false, status: 'paid' }],
      includeProfit: true,
    });
    expect(wb.SheetNames).toEqual(['Summary', 'Top products', 'Payments', 'Transactions']);
    const summary = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Summary, { header: 1 });
    expect(summary).toContainEqual(['Net profit', 30000]);
  });

  it('leaves profit out for roles that cannot see it', () => {
    const wb = buildReportWorkbook({
      businessName: 'Demo Shop',
      periodLabel: 'Today',
      generatedAt: 'now',
      totalSales: 1,
      itemsSold: 1,
      expenses: 0,
      stockValue: 0,
      topProducts: [],
      payments: [],
      includeProfit: false,
    });
    const summary = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Summary, { header: 1 });
    expect(summary.flat()).not.toContain('Net profit');
  });
});
