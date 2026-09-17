import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import * as Sharing from 'expo-sharing';

export type ProductImportRow = {
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit?: string;
  selling_price: number;
  average_cost: number;
  reorder_level: number;
  opening_stock: number;
  track_inventory: boolean;
  rowNumber: number;
};

export type ProductImportParseResult = {
  rows: ProductImportRow[];
  errors: string[];
  fileName: string;
};

const HEADER_ALIASES: Record<string, keyof Omit<ProductImportRow, 'rowNumber'>> = {
  name: 'name',
  product: 'name',
  product_name: 'name',
  productname: 'name',
  izina: 'name',
  sku: 'sku',
  code: 'sku',
  barcode: 'barcode',
  bar_code: 'barcode',
  category: 'category',
  icyiciro: 'category',
  unit: 'unit',
  igipimo: 'unit',
  selling_price: 'selling_price',
  sellingprice: 'selling_price',
  price: 'selling_price',
  sale_price: 'selling_price',
  igiciro: 'selling_price',
  average_cost: 'average_cost',
  averagecost: 'average_cost',
  cost: 'average_cost',
  cost_price: 'average_cost',
  unit_cost: 'average_cost',
  reorder_level: 'reorder_level',
  reorderlevel: 'reorder_level',
  reorder: 'reorder_level',
  min_stock: 'reorder_level',
  opening_stock: 'opening_stock',
  openingstock: 'opening_stock',
  stock: 'opening_stock',
  quantity: 'opening_stock',
  qty: 'opening_stock',
  stock_qty: 'opening_stock',
  track_inventory: 'track_inventory',
  trackinventory: 'track_inventory',
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_');
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const raw = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function parseIntSafe(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const n = parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseBool(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  return fallback;
}

function mapRow(raw: Record<string, unknown>, rowNumber: number): ProductImportRow | { error: string } {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const alias = HEADER_ALIASES[normalizeHeader(key)];
    if (alias) mapped[alias] = value;
  }

  const name = String(mapped.name ?? '').trim();
  if (!name) {
    return { error: `Row ${rowNumber}: product name is required` };
  }

  return {
    name,
    sku: mapped.sku != null && String(mapped.sku).trim() ? String(mapped.sku).trim() : undefined,
    barcode:
      mapped.barcode != null && String(mapped.barcode).trim()
        ? String(mapped.barcode).trim()
        : undefined,
    category:
      mapped.category != null && String(mapped.category).trim()
        ? String(mapped.category).trim()
        : undefined,
    unit: mapped.unit != null && String(mapped.unit).trim() ? String(mapped.unit).trim() : 'pcs',
    selling_price: parseMoney(mapped.selling_price),
    average_cost: parseMoney(mapped.average_cost),
    reorder_level: parseIntSafe(mapped.reorder_level),
    opening_stock: parseIntSafe(mapped.opening_stock),
    track_inventory: parseBool(mapped.track_inventory, true),
    rowNumber,
  };
}

function sheetToObjects(workbook: XLSX.WorkBook): Record<string, unknown>[] {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

export async function pickAndParseProductFile(): Promise<ProductImportParseResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv',
      'text/comma-separated-values',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
      '*/*',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const fileName = asset.name || 'products.xlsx';
  const uri = asset.uri;
  const lower = fileName.toLowerCase();

  let workbook: XLSX.WorkBook;
  if (lower.endsWith('.csv')) {
    const text = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    workbook = XLSX.read(text, { type: 'string' });
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    workbook = XLSX.read(base64, { type: 'base64' });
  }

  const objects = sheetToObjects(workbook);
  const rows: ProductImportRow[] = [];
  const errors: string[] = [];

  objects.forEach((obj, index) => {
    const mapped = mapRow(obj, index + 2);
    if ('error' in mapped) {
      errors.push(mapped.error);
      return;
    }
    rows.push(mapped);
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No product rows found. Use a header row with at least "name" and "selling_price".');
  }

  return { rows, errors, fileName };
}

export function buildProductImportTemplateCsv(): string {
  return [
    'name,sku,barcode,category,unit,selling_price,average_cost,reorder_level,opening_stock',
    'Rice 25kg,RICE-25,,Food,bag,28000,22000,5,40',
    'Cooking Oil 1L,OIL-1L,,Food,bottle,3500,2800,10,60',
  ].join('\n');
}

export async function shareProductImportTemplate(): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('Cache directory unavailable');
  const uri = `${dir}mia-products-template.csv`;
  await FileSystem.writeAsStringAsync(uri, buildProductImportTemplateCsv(), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing unavailable');
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle: 'MIA products template',
    UTI: 'public.comma-separated-values-text',
  });
}
