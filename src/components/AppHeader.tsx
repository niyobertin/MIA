import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
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
    <View style={StyleSheet.flatten([styles.container, { paddingTop: insets.top + spacing.lg }])}>
      <View style={styles.topRow}>
        <View style={styles.logoWrap}>
          <MiaLogo size={28} />
        </View>
        <View style={styles.topMiddle}>
          <Text style={styles.business} numberOfLines={1}>{businessName}</Text>
          <Text style={styles.date}>{subtitle ?? formatDate(new Date())}</Text>
        </View>
        {showActions ? (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => router.push('/more/sync' as any)}
              hitSlop={10}
              accessibilityLabel={t('settings.sync')}
            >
              <SyncIndicator compact />
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
          <Text style={styles.greetingLine} numberOfLines={1}>
            {greeting ? `${greeting}` : ''}
            {greeting && userName ? ', ' : ''}
            {userName ? (
              <Text style={styles.userNameInline}>{userName}</Text>
            ) : null}
          </Text>
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
  logoWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
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
    paddingTop: 0,
  },
  greetingLine: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.muted,
  },
  userNameInline: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
});
