import { FormScrollView } from '@/components';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '@/stores/syncStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/Button';
import { SyncIndicator } from '@/components/SyncIndicator';
import { getSyncEngine } from '@/services/sync/syncEngine';
import { refreshPendingCount } from '@/services/sync/queue';
import { showToast } from '@/stores/toastStore';

export default function SyncScreen() {
  const { t } = useTranslation();
  const { status, pendingCount, lastSyncAt, setStatus, setLastSyncAt, setPendingCount } = useSyncStore();
  const businessId = useAuthStore((s) => s.business?.id);
  const [isSyncing, setIsSyncing] = React.useState(false);

  React.useEffect(() => {
    if (!businessId) return;
    void refreshPendingCount(businessId);
  }, [businessId]);

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
        showToast(result.errors[0] ?? t('settings.statusFailed'), 'error');
      } else if (result.synced === 0) {
        showToast(t('settings.nothingToSync'), 'info');
      } else {
        showToast(t('settings.syncUploaded', { count: result.synced }), 'success');
      }
    } catch (error) {
      showToast(String(error), 'error');
    } finally {
      setIsSyncing(false);
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
        showToast(result.errors[0] ?? t('settings.statusFailed'), 'error');
      } else {
        showToast(
          t('settings.forceSyncDone', { reset, uploaded: result.synced }),
          'success'
        );
      }
    } catch (error) {
      showToast(String(error), 'error');
    } finally {
      setIsSyncing(false);
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
        showToast(result.errors[0] ?? t('settings.statusFailed'), 'error');
      }
    } catch (error) {
      showToast(String(error), 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.sync')}</Text>
        <Text style={styles.subtitle}>{t('settings.syncDesc')}</Text>
        <Text style={styles.cloudTarget}>
          {process.env.EXPO_PUBLIC_SUPABASE_URL
            ? t('settings.cloudTarget', {
                host: String(process.env.EXPO_PUBLIC_SUPABASE_URL).replace(/^https?:\/\//, ''),
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
          <StatusRow label={t('settings.currentStatus')} value={getStatusLabel(status.status, t)} />
        </View>
      </View>

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

function formatDateTime(date: Date) {
  return date.toLocaleString('en-RW', {
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
