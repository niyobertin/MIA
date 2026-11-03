import React from 'react';
import { View } from 'react-native';
import DailyRecordTable from './DailyRecordTable';
import { computeDailyRecords } from '@/services/reports/dailyRecords';

interface Props {
  businessId?: string;
  range: { start: string; end: string; sessionId?: string };
  t: (key: string) => string;
}

export default function DailyRecordsSection({ businessId, range, t }: Props) {
  const [data, setData] = React.useState<{ rows: any[]; summary: any } | null>(null);
  React.useEffect(() => {
    if (!businessId) return;
    computeDailyRecords(businessId, range.start.slice(0, 10), range.end.slice(0, 10)).then(setData);
  }, [businessId, range.start, range.end]);
  if (!data) return <View />;
  return <DailyRecordTable rows={data.rows} summary={data.summary} t={t} />;
}
