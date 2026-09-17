import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { SyncIndicator } from '@/components/SyncIndicator';
import { getInitials } from '@/utils/formatters';
import { canManageUsers, canCloseDay } from '@/utils/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { APP_VERSION } from '@/constants';

export default function MoreScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { business, user, logout } = useAuthStore();
  const { language, setLanguage } = useUIStore();

  const operations = [
    { title: t('navigation.reports'), icon: 'analytics', screen: '/reports' },
    { title: t('customers.customers'), icon: 'people', screen: '/customers' },
    ...(canCloseDay(user?.role)
      ? [{ title: t('cash.cashDay'), icon: 'sunny', screen: '/closing' }]
      : []),
    { title: t('navigation.stockIn'), icon: 'cube', screen: '/stock-in' },
    { title: t('navigation.expense'), icon: 'cash', screen: '/expense' },
    { title: t('navigation.customerPayment'), icon: 'person', screen: '/payment/customer-payment' },
    { title: t('navigation.supplierPayment'), icon: 'business', screen: '/payment/supplier-payment' },
  ];

  const menuItems = [
    { title: t('settings.business'), icon: 'storefront', screen: 'business-settings' },
    ...(canManageUsers(user?.role)
      ? [{ title: t('settings.userManagement'), icon: 'people', screen: 'user-management' }]
      : []),
    { title: t('settings.language'), icon: 'globe', screen: 'language' },
    { title: t('settings.sync'), icon: 'sync', screen: 'sync' },
    { title: t('settings.about'), icon: 'information-circle', screen: 'about' },
    { title: t('settings.help'), icon: 'help-circle', screen: 'help' },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={StyleSheet.flatten([
          styles.content,
          { paddingTop: insets.top + spacing.sm },
        ])}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(business?.name ?? 'MIA')}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.businessName} numberOfLines={1}>{business?.name ?? 'MIA'}</Text>
            <Text style={styles.businessCode}>{business?.business_code ?? ''}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {user?.role ? t(`users.${user.role.toLowerCase()}` as any) : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('settings.operations')}</Text>
        <View style={styles.menuList}>
          {operations.map((item, index) => (
            <Link key={item.screen} href={item.screen as any} asChild>
              <TouchableOpacity
                style={StyleSheet.flatten([
                  styles.menuItem,
                  index === operations.length - 1 ? styles.menuItemLast : null,
                ])}
                activeOpacity={0.7}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon as any} size={20} color={colors.primary} />
                </View>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.faint} />
              </TouchableOpacity>
            </Link>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('settings.settings')}</Text>
        <View style={styles.menuList}>
          {menuItems.map((item, index) => (
            <Link key={item.screen} href={`/(tabs)/more/${item.screen}` as any} asChild>
              <TouchableOpacity
                style={StyleSheet.flatten([
                  styles.menuItem,
                  index === menuItems.length - 1 ? styles.menuItemLast : null,
                ])}
                activeOpacity={0.7}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon as any} size={20} color={colors.primary} />
                </View>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.faint} />
              </TouchableOpacity>
            </Link>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
        <View style={styles.menuList}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.menuIcon}>
                <Ionicons name="globe" size={20} color={colors.primary} />
              </View>
              <Text style={styles.menuTitle}>{t('settings.language')}</Text>
            </View>
            <View style={styles.langGroup}>
              <TouchableOpacity
                style={StyleSheet.flatten([
                  styles.langButton,
                  language === 'en' ? styles.langButtonActive : null,
                ])}
                onPress={() => setLanguage('en')}
              >
                <Text
                  style={StyleSheet.flatten([
                    styles.langText,
                    language === 'en' ? styles.langTextActive : null,
                  ])}
                >
                  EN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={StyleSheet.flatten([
                  styles.langButton,
                  language === 'rw' ? styles.langButtonActive : null,
                ])}
                onPress={() => setLanguage('rw')}
              >
                <Text
                  style={StyleSheet.flatten([
                    styles.langText,
                    language === 'rw' ? styles.langTextActive : null,
                  ])}
                >
                  RW
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={StyleSheet.flatten([styles.settingRow, styles.menuItemLast])}>
            <View style={styles.settingLeft}>
              <View style={styles.menuIcon}>
                <SyncIndicator compact />
              </View>
              <Text style={styles.menuTitle}>{t('settings.syncStatus')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.logoutWrap}>
          <Button variant="danger" fullWidth onPress={logout} leftIcon={<Ionicons name="log-out-outline" size={20} color={colors.dangerText} />}>
            {t('common.logout')}
          </Button>
        </View>

        <Text style={styles.version}>
          {t('settings.version')} {APP_VERSION}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  businessCode: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  userEmail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryText,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.muted,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  menuList: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    minHeight: 60,
    gap: spacing.md,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    minHeight: 60,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  langGroup: {
    flexDirection: 'row',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 3,
  },
  langButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  langButtonActive: {
    backgroundColor: colors.card,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  langText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  langTextActive: {
    color: colors.primaryText,
  },
  logoutWrap: {
    marginTop: spacing.lg,
  },
  version: {
    fontSize: 12,
    color: colors.faint,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
