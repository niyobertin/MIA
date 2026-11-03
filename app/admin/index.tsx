import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius, shadows } from '@/theme/tokens';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatCard } from '@/components/StatCard';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { isSuperAdmin } from '@/utils/permissions';

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  if (!isSuperAdmin(user?.role)) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t('admin.dashboard') ?? 'Admin'} />
        <EmptyState icon="shield-checkmark" title={t('common.unauthorized') ?? 'Access denied'} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('admin.dashboard') ?? 'Super Admin Dashboard'} subtitle={t('admin.multiBusinessOverview') ?? 'Cross-business overview'} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{t('admin.platformAdmin') ?? 'Platform Administrator'}</Text>
          <Text style={styles.heroSub}>{user?.name ?? 'Admin'}</Text>
        </View>

        <View style={styles.grid}>
          <StatCard title={t('admin.totalBusinesses') ?? 'Businesses'} value={0} color={colors.primary} icon="business" />
          <StatCard title={t('admin.activeUsers') ?? 'Active Users'} value={0} color={colors.success} icon="people" />
          <StatCard title={t('admin.pendingSync') ?? 'Pending Sync'} value={0} color={colors.warning} icon="cloud-download" />
          <StatCard title={t('admin.totalSalesToday') ?? 'Sales Today'} value={0} color={colors.info} icon="cash" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('admin.quickActions') ?? 'Quick Actions'}</Text>
          <TouchableOpacity style={styles.actionRow}>
            <Ionicons name="list-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>{t('admin.viewAllBusinesses') ?? 'View all businesses'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow}>
            <Ionicons name="people-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>{t('admin.manageUsers') ?? 'Manage users'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>{t('admin.auditLogs') ?? 'Audit logs'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{t('admin.note') ?? 'Super Admin has cross-business access. All business data is visible and manageable through this module.'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  hero: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  heroSub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, ...shadows.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.borderSoft },
  actionText: { fontSize: 15, color: colors.body },
  infoBox: { backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  infoText: { fontSize: 13, color: colors.info },
});
