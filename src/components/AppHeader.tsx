import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme/tokens';
import { formatDate } from '@/utils/formatters';
import { MiaLogo } from './MiaLogo';
import { SyncIndicator } from './SyncIndicator';

interface AppHeaderProps {
  greeting?: string;
  businessName: string;
  userName?: string;
  subtitle?: string;
  showActions?: boolean;
  avatarLabel?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  greeting,
  businessName,
  userName,
  subtitle,
  showActions = false,
  avatarLabel,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.flatten([styles.container, { paddingTop: insets.top + spacing.sm }])}>
      <View style={styles.topRow}>
        <MiaLogo size={36} />
        <View style={styles.topMiddle}>
          <Text style={styles.business} numberOfLines={1}>{businessName}</Text>
          <Text style={styles.date}>{subtitle ?? formatDate(new Date())}</Text>
        </View>
        {showActions ? (
          <View style={styles.actions}>
            <SyncIndicator compact />
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.push('/more/sync' as any)}
              hitSlop={10}
              accessibilityLabel={t('dashboard.notifications')}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatar}
              onPress={() => router.push('/more' as any)}
              hitSlop={10}
              accessibilityLabel={t('settings.settings')}
            >
              <Text style={styles.avatarText}>
                {avatarLabel ?? businessName.charAt(0).toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <SyncIndicator compact />
        )}
      </View>

      {greeting || userName ? (
        <View style={styles.greetingBlock}>
          {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
          {userName ? (
            <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topMiddle: {
    flex: 1,
  },
  business: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  date: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
  greetingBlock: {
    paddingTop: 2,
  },
  greeting: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 2,
  },
});
