import { FormScrollView } from '@/components';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '@/stores/syncStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/Button';
import { SyncIndicator } from '@/components/SyncIndicator';
import { getSyncEngine, classifySyncError, tableLabel } from '@/services/sync/syncEngine';
import { refreshPendingCount } from '@/services/sync/queue';
import { showToast } from '@/stores/toastStore';
import { formatCloudError } from '@/utils/cloudErrors';
import { SyncRecord } from '@/types';

export default function SyncScreen() {
  const { t } = useTranslation();
  const { status, pendingCount, lastSyncAt, setStatus, setLastSyncAt, setPendingCount } = useSyncStore();
  const businessId = useAuthStore((s) => s.business?.id);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [failed, setFailed] = React.useState<SyncRecord[]>([]);
  const [actingId, setActingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!businessId) return;
    void refreshPendingCount(businessId);
    void loadFailed(businessId);
  }, [businessId]);

  const loadFailed = async (bid?: string) => {
    const id = bid ?? businessId;
    if (!id) return;
    try {
      const { syncRepository } = await import('@/repositories/sync');
      setFailed(await syncRepository.findFailed(id, 50));
    } catch {
      setFailed([]);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const engine = getSyncEngine('local-device');
      const result = await engine.syncAll();
      const count = await refreshPendingCount(businessId);
      setPendingCount(count);
      setStatus({
        status: result.failed > 0 ? 'failed' : 'synced',
        pendingCount: count,
        syncedCount: result.synced,
        failedCount: result.failed,
        lastSyncAt: new Date(),
      });
      setLastSyncAt(new Date());
      if (result.failed > 0) {
        showToast(formatCloudError(result.errors[0] ?? t('settings.statusFailed')), 'error');
      } else if (result.synced === 0) {
        showToast(t('settings.nothingToSync'), 'info');
      } else {
        showToast(t('settings.syncUploaded', { count: result.synced }), 'success');
      }
    } catch (error) {
      showToast(formatCloudError(error), 'error');
    } finally {
      setIsSyncing(false);
      await loadFailed();
    }
  };

  const handleForceReupload = async () => {
    if (!businessId) return;
    setIsSyncing(true);
    try {
      const { syncRepository } = await import('@/repositories/sync');
      const reset = await syncRepository.requeueSynced(businessId);
      const engine = getSyncEngine('local-device');
      const result = await engine.syncAll();
      const count = await refreshPendingCount(businessId);
      setPendingCount(count);
      setStatus({
        status: result.failed > 0 ? 'failed' : 'synced',
        pendingCount: count,
        syncedCount: result.synced,
        failedCount: result.failed,
        lastSyncAt: new Date(),
      });
      setLastSyncAt(new Date());
      if (result.failed > 0) {
        showToast(formatCloudError(result.errors[0] ?? t('settings.statusFailed')), 'error');
      } else {
        showToast(
          t('settings.forceSyncDone', { reset, uploaded: result.synced }),
          'success'
        );
      }
    } catch (error) {
      showToast(formatCloudError(error), 'error');
    } finally {
      setIsSyncing(false);
      await loadFailed();
    }
  };

  const handleRetryFailed = async () => {
    setIsSyncing(true);
    try {
      const engine = getSyncEngine('local-device');
      const result = await engine.retryFailed();
      const count = await refreshPendingCount(businessId);
      setPendingCount(count);
      setStatus({
        status: result.failed > 0 ? 'failed' : 'synced',
        pendingCount: count,
        syncedCount: result.synced,
        failedCount: result.failed,
        lastSyncAt: new Date(),
      });
      setLastSyncAt(new Date());
      if (result.success) {
        showToast(t('settings.statusSynced'), 'success');
      } else {
        showToast(formatCloudError(result.errors[0] ?? t('settings.statusFailed')), 'error');
      }
    } catch (error) {
      showToast(formatCloudError(error), 'error');
    } finally {
      setIsSyncing(false);
      await loadFailed();
    }
  };

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.sync')}</Text>
        <Text style={styles.subtitle}>{t('settings.syncDesc')}</Text>
        <Text style={styles.cloudTarget}>
          {process.env.EXPO_PUBLIC_API_URL
            ? t('settings.cloudTarget', {
                host: String(process.env.EXPO_PUBLIC_API_URL).replace(/^https?:\/\//, ''),
              })
            : t('settings.cloudNotConfigured')}
        </Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <SyncIndicator />
          <Text style={styles.statusTitle}>{t('settings.syncStatus')}</Text>
        </View>
        <View style={styles.statusDetails}>
          <StatusRow
            label={t('settings.pendingTransactions')}
            value={pendingCount > 0 ? `${pendingCount} ${t('common.pending')}` : t('common.synced')}
          />
          <StatusRow
            label={t('settings.lastSync')}
            value={lastSyncAt ? formatDateTime(lastSyncAt) : t('settings.never')}
          />
          <StatusRow label={t('settings.currentStatus')} value={getStatusLabel(status?.status ?? 'idle', t)} />
        </View>
        {status?.status === 'syncing' && (status?.totalCount ?? 0) > 0 ? (
          <View style={styles.progressWrap}>
            <Text style={styles.progressText}>
              {t('settings.syncProgress', {
                table: status?.currentTable ? tableLabel(status.currentTable) : '…',
                done: (status?.syncedCount ?? 0) + (status?.failedCount ?? 0),
                total: status?.totalCount ?? 0,
              })}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      Math.round(
                        (((status?.syncedCount ?? 0) + (status?.failedCount ?? 0)) /
                          Math.max(1, status?.totalCount ?? 1)) *
                          100
                      )
                    )}%`,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}
      </View>

      {failed.length > 0 ? (
        <View style={styles.conflictSection}>
          <Text style={styles.sectionTitle}>{t('settings.needsAttention', { count: failed.length })}</Text>
          <Text style={styles.conflictHint}>{t('settings.needsAttentionHint')}</Text>
          {failed.map((record) => (
            <ConflictCard
              key={record.id}
              record={record}
              acting={actingId === record.id}
              onAction={async (action) => {
                if (!businessId) return;
                setActingId(record.id);
                try {
                  const engine = getSyncEngine('local-device');
                  const kind = classifySyncError(record.error_message);
                  let result = null;
                  if (action === 'retry') {
                    result = await engine.retryRecord(record.id, businessId);
                  } else if (action === 'mine') {
                    result = await engine.keepMineRecord(record.table_name, record.record_id, businessId);
                  } else if (action === 'server') {
                    if (
                      kind === 'session_conflict' &&
                      record.table_name === 'daily_closings'
                    ) {
                      result = await engine.keepServerOpenSession(
                        record.record_id,
                        businessId,
                        record.error_message
                      );
                    } else {
                      result = await engine.keepServerRecord(
                        record.table_name,
                        record.record_id,
                        businessId
                      );
                    }
                  } else {
                    await engine.dismissRecord(record.id, businessId);
                    showToast(t('settings.conflictDismissed'), 'info');
                  }
                  if (result && !result.success) {
                    showToast(formatCloudError(result.errors[0] ?? t('settings.statusFailed')), 'error');
                  } else if (result?.success) {
                    showToast(t('settings.conflictResolved'), 'success');
                  }
                } catch (error) {
                  showToast(formatCloudError(error), 'error');
                } finally {
                  setActingId(null);
                  await refreshPendingCount(businessId);
                  await loadFailed(businessId);
                }
              }}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>{t('settings.actions')}</Text>
        <View style={styles.actionButtons}>
          <Button
            variant={isSyncing ? 'secondary' : 'primary'}
            fullWidth
            loading={isSyncing}
            onPress={() => void handleSyncNow()}
            disabled={isSyncing}
          >
            {isSyncing ? t('common.syncing') : t('settings.syncNow')}
          </Button>
          <Button
            variant="outline"
            fullWidth
            onPress={() => void handleForceReupload()}
            disabled={isSyncing}
          >
            {t('settings.forceReupload')}
          </Button>
          {pendingCount > 0 ? (
            <Button variant="outline" fullWidth onPress={() => void handleRetryFailed()} disabled={isSyncing}>
              {t('common.retry')}
            </Button>
          ) : null}
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>{t('settings.howItWorks')}</Text>
        <View style={styles.infoItems}>
          <InfoItem
            icon="cloud-upload"
            title={t('settings.offlineFirst')}
            description={t('settings.offlineFirstDesc')}
          />
          <InfoItem
            icon="shield-checkmark"
            title={t('settings.autoSync')}
            description={t('settings.autoSyncDesc')}
          />
          <InfoItem
            icon="refresh-circle"
            title={t('settings.conflictResolution')}
            description={t('settings.conflictResolutionDesc')}
          />
        </View>
      </View>
    </FormScrollView>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function InfoItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon as any} size={20} color="#0ea5e9" />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoItemTitle}>{title}</Text>
        <Text style={styles.infoItemDesc}>{description}</Text>
      </View>
    </View>
  );
}

function ConflictCard({
  record,
  acting,
  onAction,
}: {
  record: SyncRecord;
  acting: boolean;
  onAction: (action: 'retry' | 'mine' | 'server' | 'dismiss') => void;
}) {
  const { t } = useTranslation();
  const kind = classifySyncError(record.error_message);
  const isSessionConflict = kind === 'session_conflict';
  const explanation =
    kind === 'sealed'
      ? t('settings.conflictSealed')
      : isSessionConflict
        ? t('settings.conflictSession')
        : kind === 'validation'
          ? t('settings.conflictValidation')
          : kind === 'auth'
            ? t('settings.conflictAuth')
            : kind === 'offline'
              ? t('settings.conflictOffline')
              : t('settings.conflictUnknown');
  return (
    <View style={styles.conflictCard}>
      <View style={styles.conflictTop}>
        <Ionicons name="warning" size={20} color="#d97706" />
        <View style={styles.conflictInfo}>
          <Text style={styles.conflictTitle}>
            {tableLabel(record.table_name)} · {record.operation}
          </Text>
          <Text style={styles.conflictSub} numberOfLines={3}>
            {explanation}
          </Text>
          {record.error_message && !isSessionConflict ? (
            <Text style={styles.conflictError} numberOfLines={2}>
              {record.error_message}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.conflictActions}>
        {isSessionConflict ? (
          <>
            <Button
              variant="primary"
              size="sm"
              loading={acting}
              onPress={() => onAction('server')}
              disabled={acting}
            >
              {t('settings.keepServerSession')}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => onAction('dismiss')} disabled={acting}>
              {t('settings.dismissRecord')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              loading={acting}
              onPress={() => onAction('retry')}
              disabled={acting}
            >
              {t('common.retry')}
            </Button>
            <Button variant="outline" size="sm" onPress={() => onAction('mine')} disabled={acting}>
              {t('settings.keepMine')}
            </Button>
            <Button variant="outline" size="sm" onPress={() => onAction('server')} disabled={acting}>
              {t('settings.keepServer')}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => onAction('dismiss')} disabled={acting}>
              {t('settings.dismissRecord')}
            </Button>
          </>
        )}
      </View>
    </View>
  );
}

function getStatusLabel(status: string, t: (key: string) => string) {
  const labels: Record<string, string> = {
    idle: t('settings.statusIdle'),
    syncing: t('settings.statusSyncing'),
    synced: t('settings.statusSynced'),
    failed: t('settings.statusFailed'),
    offline: t('settings.statusOffline'),
  };
  return labels[status] ?? status;
}

function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-RW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  cloudTarget: {
    fontSize: 12,
    color: '#0ea5e9',
    marginTop: 8,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  statusDetails: {
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  statusLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  actionsSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  progressWrap: {
    marginTop: 16,
    gap: 8,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0f2fe',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0ea5e9',
  },
  conflictSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  conflictHint: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  conflictCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 16,
    marginBottom: 12,
  },
  conflictTop: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  conflictInfo: {
    flex: 1,
  },
  conflictTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  conflictSub: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 20,
  },
  conflictError: {
    fontSize: 12,
    color: '#92400e',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  conflictActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  actionButtons: {
    gap: 12,
  },
  infoSection: {
    marginHorizontal: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  infoItems: {
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  infoItemDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
    lineHeight: 20,
  },
});
