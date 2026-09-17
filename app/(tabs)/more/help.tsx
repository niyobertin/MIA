import { FormScrollView } from '@/components';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const FAQ = [
  {
    question: 'faq.howToCreateSale',
    answer: 'faq.howToCreateSaleAnswer',
  },
  {
    question: 'faq.howToAddStock',
    answer: 'faq.howToAddStockAnswer',
  },
  {
    question: 'faq.howToRecordExpense',
    answer: 'faq.howToRecordExpenseAnswer',
  },
  {
    question: 'faq.howToCloseDay',
    answer: 'faq.howToCloseDayAnswer',
  },
  {
    question: 'faq.offlineMode',
    answer: 'faq.offlineModeAnswer',
  },
  {
    question: 'faq.dataSync',
    answer: 'faq.dataSyncAnswer',
  },
];

export default function HelpScreen() {
  const { t } = useTranslation();
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.help')}</Text>
        <Text style={styles.subtitle}>{t('settings.helpSubtitle')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.quickActions')}</Text>
        <View style={styles.quickActions}>
          <QuickActionButton
            icon="chatbubble"
            title={t('settings.contactSupport')}
            subtitle={t('settings.emailSupport')}
            onPress={() => Linking.openURL('mailto:support@mia.app')}
          />
          <QuickActionButton
            icon="call"
            title={t('settings.callSupport')}
            subtitle={t('settings.phoneSupport')}
            onPress={() => Linking.openURL('tel:+250788123456')}
          />
          <QuickActionButton
            icon="globe"
            title={t('settings.visitWebsite')}
            subtitle={t('settings.websiteUrl')}
            onPress={() => Linking.openURL('https://mia.app')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.frequentlyAsked')}</Text>
        <View style={styles.faqList}>
          {FAQ.map((item, index) => (
            <FAQItem
              key={index}
              question={t(item.question)}
              answer={t(item.answer)}
              expanded={expandedIndex === index}
              onPress={() => setExpandedIndex(expandedIndex === index ? null : index)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.guides')}</Text>
        <View style={styles.guidesList}>
          <GuideItem
            icon="document-text"
            title={t('guides.gettingStarted')}
            desc={t('guides.gettingStartedDesc')}
            onPress={() => Linking.openURL('https://mia.app/guides/getting-started')}
          />
          <GuideItem
            icon="videocam"
            title={t('guides.videoTutorials')}
            desc={t('guides.videoTutorialsDesc')}
            onPress={() => Linking.openURL('https://mia.app/guides/videos')}
          />
          <GuideItem
            icon="download"
            title={t('guides.userManual')}
            desc={t('guides.userManualDesc')}
            onPress={() => Linking.openURL('https://mia.app/guides/manual.pdf')}
          />
        </View>
      </View>
    </FormScrollView>
  );
}

function QuickActionButton({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickActionButton} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={24} color="#fff" />
      </View>
      <View style={styles.quickActionContent}>
        <Text style={styles.quickActionTitle}>{title}</Text>
        <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </TouchableOpacity>
  );
}

function FAQItem({ question, answer, expanded, onPress }: { question: string; answer: string; expanded: boolean; onPress: () => void }) {
  return (
    <View style={styles.faqItem}>
      <TouchableOpacity style={styles.faqQuestion} onPress={onPress} activeOpacity={0.9}>
        <Text style={styles.faqQuestionText}>{question}</Text>
        <Ionicons name={expanded ? 'remove' : 'add'} size={24} color="#9ca3af" />
      </TouchableOpacity>
      {expanded && (
        <Text style={styles.faqAnswer}>{answer}</Text>
      )}
    </View>
  );
}

function GuideItem({ icon, title, desc, onPress }: { icon: string; title: string; desc: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.guideItem} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.guideIcon}>
        <Ionicons name={icon} size={20} color="#0ea5e9" />
      </View>
      <View style={styles.guideContent}>
        <Text style={styles.guideTitle}>{title}</Text>
        <Text style={styles.guideDesc}>{desc}</Text>
      </View>
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
  section: {
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  quickActions: {
    gap: 12,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  faqList: {
    gap: 8,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  faqQuestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  faqQuestionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
    paddingRight: 12,
  },
  faqAnswer: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
    paddingBottom: 16,
    paddingHorizontal: 4,
  },
  guidesList: {
    gap: 12,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  guideIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideContent: {
    flex: 1,
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  guideDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
});