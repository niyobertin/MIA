import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/uiStore';

const LANGUAGES = [
  { code: 'en', nameKey: 'settings.english', nativeName: 'English', flag: '🇺🇸' },
  { code: 'rw', nameKey: 'settings.kinyarwanda', nativeName: 'Ikinyarwanda', flag: '🇷🇼' },
];

export default function LanguageScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useUIStore();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.language')}</Text>
        <Text style={styles.subtitle}>{t('settings.languageDesc')}</Text>
      </View>

      <View style={styles.list}>
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.languageItem,
              language === lang.code && styles.languageItemSelected,
            ]}
            onPress={() => setLanguage(lang.code as 'en' | 'rw')}
          >
            <View style={styles.languageInfo}>
              <Text style={styles.languageFlag}>{lang.flag}</Text>
              <View style={styles.languageNames}>
                <Text style={styles.languageName}>{t(lang.nameKey)}</Text>
                <Text style={styles.languageNativeName}>{lang.nativeName}</Text>
              </View>
            </View>
            {language === lang.code && (
              <View style={styles.checkContainer}>
                <Ionicons name="checkmark-circle" size={24} color="#0ea5e9" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoSection}>
        <Ionicons name="information-circle" size={20} color="#0ea5e9" style={styles.infoIcon} />
        <Text style={styles.infoText}>{t('settings.languageInfo')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    marginBottom: 24,
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
  list: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  languageItemSelected: {
    backgroundColor: '#eff6ff',
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageFlag: {
    fontSize: 28,
  },
  languageNames: {
    gap: 2,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  languageNativeName: {
    fontSize: 13,
    color: '#6b7280',
  },
  checkContainer: {
    padding: 4,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    marginTop: 2,
  },
  infoText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
});