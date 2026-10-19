import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '@/stores/syncStore';
import { Easing } from 'react-native';

export const SyncIndicator: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { t } = useTranslation();
  const { status, pendingCount } = useSyncStore();
  const syncStatus = status?.status ?? 'idle';
  
  const spinAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (syncStatus === 'syncing') {
      spinAnim.setValue(0);
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {});
    }
  }, [syncStatus]);

  const getStatusConfig = () => {
    switch (syncStatus) {
      case 'syncing':
        return {
          icon: 'sync',
          color: '#0ea5e9',
          label: t('common.syncing'),
          animate: true,
        };
      case 'synced':
        return {
          icon: 'checkmark-circle',
          color: '#22c55e',
          label: t('common.synced'),
          animate: false,
        };
      case 'failed':
        return {
          icon: 'alert-circle',
          color: '#ef4444',
          label: t('common.failed'),
          animate: false,
        };
      case 'offline':
        return {
          icon: 'wifi-off',
          color: '#f59e0b',
          label: t('common.offline'),
          animate: false,
        };
      default:
        if (pendingCount > 0) {
          return {
            icon: 'cloud-upload',
            color: '#f59e0b',
            label: `${pendingCount} pending`,
            animate: false,
          };
        }
        return {
          icon: 'checkmark-circle',
          color: '#22c55e',
          label: t('common.synced'),
          animate: false,
        };
    }
  };

  const config = getStatusConfig();

  if (compact) {
    return (
      <View
        style={[styles.compactIcon, { backgroundColor: config.color }]}
        accessibilityLabel={config.label}
        accessibilityRole="image"
      >
        {config.animate ? (
          <Animated.View
            style={[
              styles.spinner,
              {
                transform: [
                  {
                    rotate: spinAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name={config.icon as any} size={16} color="#fff" />
          </Animated.View>
        ) : (
          <Ionicons name={config.icon as any} size={16} color="#fff" />
        )}
        {pendingCount > 0 && syncStatus !== 'syncing' && syncStatus !== 'synced' ? (
          <View style={styles.compactBadge}>
            <Text style={styles.compactBadgeText}>
              {pendingCount > 9 ? '9+' : pendingCount}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.iconContainer,
          { backgroundColor: config.color },
        ]}
      >
        {config.animate ? (
          <Animated.View
            style={[
              styles.spinner,
              { transform: [{ rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
            ]}
          >
            <Ionicons name={config.icon} size={20} color="#fff" />
          </Animated.View>
        ) : (
          <Ionicons name={config.icon} size={20} color="#fff" />
        )}
      </Animated.View>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
      {pendingCount > 0 && syncStatus !== 'syncing' && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pendingCount}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  compactBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  compactBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
});