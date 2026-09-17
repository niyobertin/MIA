import { Platform, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Business } from '@/types';

export interface ReceiptLine {
  name: string;
  qty: number;
  price: number;
}

export interface ReceiptData {
  businessName: string;
  businessCode?: string | null;
  currency?: string;
  date: string;
  reference?: string;
  customerName?: string;
  paymentMethod?: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  profit?: number;
}

const RECEIPT_WIDTH_PT = 226; // ~80mm at 72dpi

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number, currency: string): string {
  return `${n.toLocaleString()} ${currency}`;
}

export function buildReceiptText(data: ReceiptData): string {
  const currency = data.currency ?? 'RWF';
  const line = (left: string, right: string) => {
    const width = 32;
    const space = Math.max(1, width - left.length - right.length);
    return `${left}${' '.repeat(space)}${right}`;
  };
  const rows = [
    data.businessName.toUpperCase(),
    data.businessCode ? `Code: ${data.businessCode}` : null,
    data.date,
    data.reference ? `Ref: ${data.reference}` : null,
    '--------------------------------',
    ...data.lines.flatMap((l) => [
      l.name.slice(0, 32),
      line(`  ${l.qty} x ${l.price.toLocaleString()}`, money(l.qty * l.price, currency)),
    ]),
    '--------------------------------',
    line('SUBTOTAL', money(data.subtotal, currency)),
    data.discount ? line('DISCOUNT', money(-data.discount, currency)) : null,
    data.tax ? line('TAX', money(data.tax, currency)) : null,
    line('TOTAL', money(data.total, currency)),
    data.customerName ? `Customer: ${data.customerName}` : null,
    data.paymentMethod ? `Paid: ${data.paymentMethod}` : null,
    '--------------------------------',
    '80mm receipt',
    'Thank you!',
  ].filter(Boolean) as string[];
  return rows.join('\n');
}

export function buildReceiptHtml(data: ReceiptData): string {
  const currency = data.currency ?? 'RWF';
  const itemRows = data.lines
    .map(
      (l) => `
      <tr>
        <td class="name">${escapeHtml(l.name)}</td>
      </tr>
      <tr>
        <td class="detail">${l.qty} × ${l.price.toLocaleString()}</td>
        <td class="amount">${escapeHtml(money(l.qty * l.price, currency))}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 0; size: ${RECEIPT_WIDTH_PT}pt auto; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${RECEIPT_WIDTH_PT}pt;
      background: #fff;
      color: #111;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
    }
    .wrap { padding: 10px 8px 16px; }
    .center { text-align: center; }
    .title { font-size: 14px; font-weight: 800; letter-spacing: 0.3px; }
    .muted { color: #555; font-size: 10px; }
    .rule { border-top: 1px dashed #999; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 1px 0; }
    td.name { font-weight: 600; }
    td.detail { color: #444; font-size: 10px; }
    td.amount { text-align: right; white-space: nowrap; }
    .totals td { padding-top: 3px; }
    .total td { font-weight: 800; font-size: 12px; padding-top: 6px; }
    .footer { margin-top: 10px; font-size: 10px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="center title">${escapeHtml(data.businessName.toUpperCase())}</div>
    ${data.businessCode ? `<div class="center muted">Code: ${escapeHtml(data.businessCode)}</div>` : ''}
    <div class="center muted">${escapeHtml(data.date)}</div>
    ${data.reference ? `<div class="center muted">Ref: ${escapeHtml(data.reference)}</div>` : ''}
    <div class="rule"></div>
    <table>${itemRows}</table>
    <div class="rule"></div>
    <table class="totals">
      <tr><td>SUBTOTAL</td><td class="amount">${escapeHtml(money(data.subtotal, currency))}</td></tr>
      ${data.discount ? `<tr><td>DISCOUNT</td><td class="amount">${escapeHtml(money(-data.discount, currency))}</td></tr>` : ''}
      ${data.tax ? `<tr><td>TAX</td><td class="amount">${escapeHtml(money(data.tax, currency))}</td></tr>` : ''}
      <tr class="total"><td>TOTAL</td><td class="amount">${escapeHtml(money(data.total, currency))}</td></tr>
    </table>
    ${data.customerName ? `<div class="muted" style="margin-top:8px">Customer: ${escapeHtml(data.customerName)}</div>` : ''}
    ${data.paymentMethod ? `<div class="muted">Paid: ${escapeHtml(data.paymentMethod)}</div>` : ''}
    <div class="rule"></div>
    <div class="footer">80mm receipt<br/>Thank you!</div>
  </div>
</body>
</html>`;
}

async function createReceiptPdf(data: ReceiptData): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html: buildReceiptHtml(data),
    width: RECEIPT_WIDTH_PT,
    base64: false,
  });
  return uri;
}

export async function shareReceiptPdf(data: ReceiptData): Promise<void> {
  const uri = await createReceiptPdf(data);
  const fileName = `${data.businessName.replace(/[^\w.-]+/g, '_')}_receipt.pdf`;

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: fileName,
    });
    return;
  }

  await Share.share(
    Platform.OS === 'ios'
      ? { url: uri, title: fileName }
      : { message: `${buildReceiptText(data)}\n\n${uri}`, title: fileName }
  );
}

export async function printReceipt(data: ReceiptData): Promise<void> {
  await Print.printAsync({
    html: buildReceiptHtml(data),
    width: RECEIPT_WIDTH_PT,
  });
}

export function receiptFromBusiness(
  business: Pick<Business, 'name' | 'business_code' | 'currency'> | null | undefined,
  rest: Omit<ReceiptData, 'businessName' | 'businessCode' | 'currency'>
): ReceiptData {
  return {
    businessName: business?.name ?? 'MIA',
    businessCode: business?.business_code,
    currency: business?.currency ?? 'RWF',
    ...rest,
  };
}
