import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/theme/tokens';
import { formatCurrency } from '@/services/financial/calculations';

export interface DailyRecordRow {
  date: string;
  productName: string;
  productId: string;
  unit: string;
  openingQty: number;
  openingValue: number;
  receivedQty: number;
  receivedValue: number;
  soldQty: number;
  soldValue: number;
  adjustmentQty: number;
  adjustmentValue: number;
  closingQty: number;
  closingValue: number;
}

export interface DailyRecordSummary {
  date: string;
  totalOpeningQty: number;
  totalReceivedQty: number;
  totalSoldQty: number;
  totalAdjustmentQty: number;
  totalClosingQty: number;
  totalOpeningValue: number;
  totalReceivedValue: number;
  totalSoldValue: number;
  totalAdjustmentValue: number;
  totalClosingValue: number;
  productCount: number;
}

interface Props {
  rows: DailyRecordRow[];
  summary: DailyRecordSummary;
  t: (key: string) => string;
}

export default function DailyRecordTable({ rows, summary, t }: Props) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{t('reports.dailyRecords') ?? 'Daily Business Records'}</Text>
      <Text style={styles.subtitle}>{t('reports.date') ?? 'Business Date'}: {summary.date}</Text>

      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 2 }]}>{t('product.name') ?? 'Product'}</Text>
        <Text style={styles.th}>{t('stock.opening') ?? 'Open'}</Text>
        <Text style={styles.th}>{t('stock.received') ?? 'In'}</Text>
        <Text style={styles.th}>{t('stock.sold') ?? 'Out'}</Text>
        <Text style={styles.th}>{t('stock.adjustment') ?? 'Adj'}</Text>
        <Text style={styles.th}>{t('stock.closing') ?? 'Close'}</Text>
      </View>

      {rows.map((r) => (
        <View key={r.productId + r.date} style={styles.row}>
          <View style={{ flex: 2 }}>
            <Text style={styles.productName}>{r.productName}</Text>
            <Text style={styles.unit}>{r.unit}</Text>
          </View>
          <Text style={styles.cell}>{r.openingQty.toLocaleString()}</Text>
          <Text style={styles.cell}>{r.receivedQty > 0 ? `+${r.receivedQty.toLocaleString()}` : '—'}</Text>
          <Text style={styles.cell}>{r.soldQty > 0 ? `-${r.soldQty.toLocaleString()}` : '—'}</Text>
          <Text style={styles.cell}>{r.adjustmentQty !== 0 ? (r.adjustmentQty > 0 ? `+${r.adjustmentQty}` : `${r.adjustmentQty}`) : '—'}</Text>
          <Text style={[styles.cell, { fontWeight: '700' }]}>{r.closingQty.toLocaleString()}</Text>
        </View>
      ))}

      {rows.length === 0 && (
        <Text style={styles.empty}>{t('common.noRecords') ?? 'No records for this day.'}</Text>
      )}

      <View style={styles.divider} />

      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>{t('reports.dailySummary') ?? 'Daily Summary'}</Text>
        <View style={styles.summaryRow}><Text>{t('stock.opening') ?? 'Opening qty'}</Text><Text style={{ fontWeight: '700' }}>{summary.totalOpeningQty.toLocaleString()}</Text></View>
        <View style={styles.summaryRow}><Text>{t('stock.received') ?? 'Received qty'}</Text><Text style={{ fontWeight: '700' }}>{summary.totalReceivedQty.toLocaleString()}</Text></View>
        <View style={styles.summaryRow}><Text>{t('stock.sold') ?? 'Sold qty'}</Text><Text style={{ fontWeight: '700' }}>{summary.totalSoldQty.toLocaleString()}</Text></View>
        <View style={styles.summaryRow}><Text>{t('stock.adjustment') ?? 'Adjustments'}</Text><Text style={{ fontWeight: '700' }}>{summary.totalAdjustmentQty.toLocaleString()}</Text></View>
        <View style={styles.summaryRow}><Text>{t('stock.closing') ?? 'Closing qty'}</Text><Text style={{ fontWeight: '700', color: colors.success ?? '#065f46' }}>{summary.totalClosingQty.toLocaleString()}</Text></View>
        <View style={styles.divider} />
        <View style={styles.summaryRow}><Text>{t('stock.openingValue') ?? 'Opening value'}</Text><Text style={{ fontWeight: '700' }}>{formatCurrency(summary.totalOpeningValue)}</Text></View>
        <View style={styles.summaryRow}><Text>{t('stock.receivedValue') ?? 'Received value'}</Text><Text style={{ fontWeight: '700' }}>{formatCurrency(summary.totalReceivedValue)}</Text></View>
        <View style={styles.summaryRow}><Text>{t('stock.soldValue') ?? 'Sold value (COGS)'}</Text><Text style={{ fontWeight: '700' }}>{formatCurrency(summary.totalSoldValue)}</Text></View>
        <View style={styles.summaryRow}><Text>{t('stock.closingValue') ?? 'Closing value'}</Text><Text style={{ fontWeight: '700', color: colors.success ?? '#065f46' }}>{formatCurrency(summary.totalClosingValue)}</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.muted, marginBottom: 12 },
  tableHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  th: { fontSize: 11, fontWeight: '700', color: colors.muted, textAlign: 'center', flex: 1 },
  row: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border, alignItems: 'center' },
  productName: { fontWeight: '600', fontSize: 13, color: colors.ink },
  unit: { fontSize: 11, color: colors.muted },
  cell: { fontSize: 12, textAlign: 'center', flex: 1, color: colors.ink },
  empty: { fontSize: 13, color: colors.muted, paddingVertical: 12, textAlign: 'center' },
  divider: { height: 8 },
  summaryBox: { backgroundColor: colors.card, borderRadius: radius.md ?? 12, padding: 12, marginTop: 8 },
  summaryTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4, color: colors.ink },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, fontSize: 13 },
});
