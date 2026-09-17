import { FormScrollView } from '@/components';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '@/stores/syncStore';
import { Button } from '@/components/Button';
import { SyncIndicator } from '@/components/SyncIndicator';

export default function SyncScreen() {
  const { t } = useTranslation();
  const { status, pendingCount, lastSyncAt, setStatus, setLastSyncAt } = useSyncStore();
  const [isSyncing, setIsSyncing] = React.useState(false);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setStatus({ status: 'syncing', pendingCount });
    
    // Simulate sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setStatus({ status: 'synced', pendingCount: 0 });
    setLastSyncAt(new Date());
    setIsSyncing(false);
  };

  const handleRetryFailed = async () => {
    setIsSyncing(true);
    setStatus({ status: 'syncing', pendingCount });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setStatus({ status: 'synced', pendingCount: 0 });
    setLastSyncAt(new Date());
    setIsSyncing(false);
  };

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.sync')}</Text>
        <Text style={styles.subtitle}>{t('settings.syncDesc')}</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <SyncIndicator />
          <Text style={styles.statusTitle}>{t('settings.syncStatus')}</Text>
        </View>
        <View style={styles.statusDetails}>
          <StatusRow label={t('settings.pendingTransactions')} value={pendingCount > 0 ? `${pendingCount} ${t('common.pending')}` : t('common.synced')} />
          <StatusRow label={t('settings.lastSync')} value={lastSyncAt ? formatDateTime(lastSyncAt) : t('settings.never')} />
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
            onPress={handleSyncNow}
            disabled={isSyncing}
          >
            {isSyncing ? t('common.syncing') : t('settings.syncNow')}
          </Button>
          {pendingCount > 0 && (
            <Button variant="outline" fullWidth onPress={handleRetryFailed} disabled={isSyncing}>
              {t('common.retry')}
            </Button>
          )}
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
  const { t } = useTranslation();
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={20} color="#0ea5e9" />
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