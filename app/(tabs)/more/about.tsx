import { FormScrollView } from '@/components';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_VERSION, APP_NAME } from '@/constants';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components';

export default function AboutScreen() {
  const { t } = useTranslation();

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Logo size={160} style={{ marginBottom: 16 }} />
        <Text style={styles.appName}>{APP_NAME}</Text>
        <Text style={styles.version}>{t('settings.version')} {APP_VERSION}</Text>
        <Text style={styles.tagline}>{t('settings.appTagline')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
        <Text style={styles.description}>{t('settings.aboutDescription')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.features')}</Text>
        <View style={styles.featuresList}>
          <FeatureItem icon="cube" title={t('features.inventory')} desc={t('features.inventoryDesc')} />
          <FeatureItem icon="cart" title={t('features.sales')} desc={t('features.salesDesc')} />
          <FeatureItem icon="add-circle" title={t('features.purchases')} desc={t('features.purchasesDesc')} />
          <FeatureItem icon="cash" title={t('features.expenses')} desc={t('features.expensesDesc')} />
          <FeatureItem icon="analytics" title={t('features.reports')} desc={t('features.reportsDesc')} />
          <FeatureItem icon="wifi-off" title={t('features.offline')} desc={t('features.offlineDesc')} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.links')}</Text>
        <View style={styles.linksList}>
          <LinkItem icon="logo-github" title={t('settings.sourceCode')} onPress={() => Linking.openURL('https://github.com/mia-app')} />
          <LinkItem icon="document-text" title={t('settings.privacyPolicy')} onPress={() => Linking.openURL('https://mia.app/privacy')} />
          <LinkItem icon="document-text" title={t('settings.termsOfService')} onPress={() => Linking.openURL('https://mia.app/terms')} />
          <LinkItem icon="help-circle" title={t('settings.help')} onPress={() => Linking.openURL('https://mia.app/help')} />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.copyright}>© 2024 MIA. {t('settings.allRightsReserved')}</Text>
        <Text style={styles.madeWith}>{t('settings.madeForAfrica')}</Text>
      </View>
    </FormScrollView>
  );
}

function FeatureItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={20} color="#0ea5e9" />
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function LinkItem({ icon, title, onPress }: { icon: string; title: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.linkItem} onPress={onPress}>
      <View style={styles.linkIcon}>
        <Ionicons name={icon} size={20} color="#0ea5e9" />
      </View>
      <Text style={styles.linkTitle}>{title}</Text>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </TouchableOpacity>
  );
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
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  appIcon: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  version: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  tagline: {
    fontSize: 14,
    color: '#0ea5e9',
    fontWeight: '500',
    marginTop: 8,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
  },
  featuresList: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    gap: 12,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  featureDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
    lineHeight: 20,
  },
  linksList: {
    gap: 8,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
    gap: 4,
  },
  copyright: {
    fontSize: 12,
    color: '#9ca3af',
  },
  madeWith: {
    fontSize: 11,
    color: '#d1d5db',
  },
});
