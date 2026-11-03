import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNetInfo } from '@react-native-community/netinfo';
import { colors } from '@/theme/tokens';
import { useSyncStore } from '@/stores/syncStore';

export const OfflineBanner: React.FC = () => {
  const { t } = useTranslation();
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const syncStatus = useSyncStore((s) => s.status.status);
  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;

  if (!offline && pendingCount === 0) return null;

  if (offline) {
    return (
      <View style={[styles.banner, styles.offline]}>
        <Ionicons name="cloud-offline" size={16} color={colors.white} style={styles.icon} />
        <Text style={[styles.text, styles.textLight]}>
          {t('common.offline')} — {pendingCount > 0
            ? t('settings.pendingSync', { count: pendingCount })
            : t('settings.savedOnPhone')}
        </Text>
      </View>
    );
  }

  const failed = syncStatus === 'failed';
  return (
    <View style={[styles.banner, failed ? styles.failed : styles.syncing]}>
      <Ionicons
        name={failed ? 'alert-circle' : 'sync'}
        size={16}
        color={failed ? colors.warningText : colors.info}
        style={styles.icon}
      />
      <Text style={[styles.text, { color: failed ? colors.warningText : colors.info }]}>
        {failed
          ? t('settings.pendingSync', { count: pendingCount })
          : t('settings.syncingCount', { count: pendingCount })}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: {
    backgroundColor: colors.warning,
  },
  syncing: {
    backgroundColor: colors.infoSoft,
  },
  failed: {
    backgroundColor: colors.warningSoft,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  textLight: {
    color: colors.white,
  },
});
