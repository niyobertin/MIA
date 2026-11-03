import { getDatabase } from '@/db/database';
import { DailyRecordRow, DailyRecordSummary } from '@/components/DailyRecordTable';

export async function computeDailyRecords(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<{ rows: DailyRecordRow[]; summary: DailyRecordSummary }> {
  const db = await getDatabase();

  // Aggregate stock movements by date and product
  const movements = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
       substr(occurred_at, 1, 10) AS date,
       product_id,
       type,
       SUM(CASE WHEN type IN ('purchase', 'return_in', 'opening', 'adjustment_in') THEN quantity ELSE 0 END) AS received_qty,
       SUM(CASE WHEN type IN ('sale', 'return_out', 'adjustment_out', 'damaged') THEN -quantity ELSE 0 END) AS sold_qty,
       SUM(CASE WHEN type IN ('adjustment_in') THEN quantity ELSE CASE WHEN type IN ('adjustment_out') THEN -quantity ELSE 0 END END) AS adjustment_qty,
       SUM(CASE WHEN type IN ('purchase', 'return_in', 'opening', 'adjustment_in') THEN quantity * unit_cost ELSE 0 END) AS received_value,
       SUM(CASE WHEN type IN ('sale', 'return_out') THEN quantity * unit_cost ELSE 0 END) AS sold_value
     FROM stock_movements
     WHERE business_id = ? AND occurred_at BETWEEN ? AND ?
     GROUP BY substr(occurred_at, 1, 10), product_id`,
    [businessId, startDate, endDate + ' 23:59:59']
  );

  // Aggregate sales by date and product (for sold qty/value reconciliation)
  const sales = await db.getAllAsync<Record<string, unknown>>(
    `SELECT substr(sale_date, 1, 10) AS date, si.product_id,
            SUM(si.quantity) AS sold_qty, SUM(si.quantity * si.unit_cost) AS sold_value
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.business_id = ? AND s.voided = 0 AND s.sale_date BETWEEN ? AND ?
     GROUP BY substr(s.sale_date, 1, 10), si.product_id`,
    [businessId, startDate, endDate + ' 23:59:59']
  );

  // Products lookup
  const products = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, name, unit FROM products WHERE business_id = ?`,
    [businessId]
  );
  const productMap = new Map<string, { name: string; unit: string }>();
  for (const p of products) {
    productMap.set(p.id as string, { name: p.name as string, unit: (p.unit as string) ?? 'pcs' });
  }

  // Build per-date, per-product aggregates (combine movement + sales for closing qty logic)
  // We'll compute for each date in the range.
  const dateMap = new Map<string, Map<string, DailyRecordRow>>();

  function getRow(dateStr: string, productId: string): DailyRecordRow {
    if (!dateMap.has(dateStr)) dateMap.set(dateStr, new Map());
    const d = dateMap.get(dateStr)!;
    if (!d.has(productId)) {
      const info = productMap.get(productId) ?? { name: productId, unit: 'unit' };
      d.set(productId, {
        date: dateStr,
        productName: info.name,
        productId,
        unit: info.unit,
        openingQty: 0,
        openingValue: 0,
        receivedQty: 0,
        receivedValue: 0,
        soldQty: 0,
        soldValue: 0,
        adjustmentQty: 0,
        adjustmentValue: 0,
        closingQty: 0,
        closingValue: 0,
      });
    }
    return d.get(productId)!;
  }

  // Initialize rows for each date in range
  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  for (; current <= end; current.setDate(current.getDate() + 1)) {
    const dStr = current.toISOString().slice(0, 10);
    for (const [pid] of productMap) {
      getRow(dStr, pid);
    }
  }

  // Fill opening qty/value from previous day's closing (simplified: start with 0 for first period)
  const dates = Array.from(dateMap.keys()).sort();
  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];
    const prevDate = i > 0 ? dates[i - 1] : null;
    for (const [pid, row] of dateMap.get(dateStr)!) {
      if (prevDate) {
        const prevRow = dateMap.get(prevDate)?.get(pid);
        if (prevRow) {
          row.openingQty = prevRow.closingQty;
          row.openingValue = prevRow.closingValue;
        }
      }
    }
  }

  // Apply movements
  for (const m of movements) {
    const dStr = (m.date as string).slice(0, 10);
    const pid = m.product_id as string;
    const row = getRow(dStr, pid);
    const qty = Number(m.received_qty ?? 0) + Number(m.sold_qty ?? 0) + Number(m.adjustment_qty ?? 0); // Note: sold_qty from movements is negative in query
    // Actually our query uses CASE expressions; let's parse cleanly:
    const received = Math.max(0, Number(m.received_qty ?? 0));
    const soldRaw = Number(m.sold_qty ?? 0);
    const sold = Math.abs(soldRaw); // movement query returns negative
    const adj = Number(m.adjustment_qty ?? 0);
    const receivedValue = Math.max(0, Number(m.received_value ?? 0));
    const soldValue = Math.abs(Number(m.sold_value ?? 0));

    row.receivedQty += received;
    row.soldQty += sold;
    row.adjustmentQty += adj;
    row.receivedValue += receivedValue;
    row.soldValue += soldValue;
    // Adjustment value approximated: we don't have exact value for adjustments; approximate by average cost
    if (adj !== 0) {
      const avgCost = row.receivedValue / (row.receivedQty || 1);
      row.adjustmentValue += Math.round(adj * avgCost);
    }
  }

  // Reconcile sold qty/value from sales items (more authoritative) and compute closing
  for (const s of sales) {
    const dStr = (s.date as string).slice(0, 10);
    const pid = s.product_id as string;
    const row = getRow(dStr, pid);
    const qty = Number(s.sold_qty ?? 0);
    const value = Number(s.sold_value ?? 0);
    row.soldQty = qty; // authoritative from sale_items
    row.soldValue = value;
  }

  // Compute closing qty/value after applying received/sold/adjustment
  const rows: DailyRecordRow[] = [];
  for (const dateStr of dates.sort()) {
    for (const [pid, row] of dateMap.get(dateStr)!) {
      row.closingQty = row.openingQty + row.receivedQty - row.soldQty + row.adjustmentQty;
      // Value approximation: opening + received - sold*avg_cost; adjustments approximated
      const avgCost = row.receivedQty > 0 ? row.receivedValue / row.receivedQty : row.openingValue / (row.openingQty || 1);
      row.closingValue = Math.round(row.openingValue + row.receivedValue - row.soldValue + row.adjustmentValue);
      rows.push({ ...row });
    }
  }

  // Filter to rows with any activity or with non-zero opening/closing
  const activeRows = rows.filter(
    (r) => r.openingQty > 0 || r.receivedQty > 0 || r.soldQty > 0 || r.adjustmentQty !== 0 || r.closingQty > 0
  );

  // Compute summary for the full date range (last date's closing is final)
  const lastDateRows = activeRows.filter((r) => r.date === dates[dates.length - 1]);
  const summary: DailyRecordSummary = {
    date: endDate,
    totalOpeningQty: 0,
    totalReceivedQty: 0,
    totalSoldQty: 0,
    totalAdjustmentQty: 0,
    totalClosingQty: 0,
    totalOpeningValue: 0,
    totalReceivedValue: 0,
    totalSoldValue: 0,
    totalAdjustmentValue: 0,
    totalClosingValue: 0,
    productCount: lastDateRows.length,
  };
  for (const r of lastDateRows) {
    summary.totalOpeningQty += r.openingQty;
    summary.totalReceivedQty += r.receivedQty;
    summary.totalSoldQty += r.soldQty;
    summary.totalAdjustmentQty += r.adjustmentQty;
    summary.totalClosingQty += r.closingQty;
    summary.totalOpeningValue += r.openingValue;
    summary.totalReceivedValue += r.receivedValue;
    summary.totalSoldValue += r.soldValue;
    summary.totalAdjustmentValue += r.adjustmentValue;
    summary.totalClosingValue += r.closingValue;
  }

  return { rows: activeRows, summary };
}
