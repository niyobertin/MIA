import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme/tokens';
import { useSyncStore } from '@/stores/syncStore';

export const OfflineBanner: React.FC = () => {
  const { t } = useTranslation();
  const { pendingCount } = useSyncStore();

  if (pendingCount === 0) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.content}>
        <Ionicons name="cloud-offline" size={18} color="#fff" style={styles.icon} />
        <Text style={styles.text}>
          {t('common.offline')} — {t('settings.pendingSync', { count: pendingCount })}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    flexShrink: 1,
  },
});
