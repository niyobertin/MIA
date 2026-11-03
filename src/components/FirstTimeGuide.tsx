import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { useUIStore } from '@/stores/uiStore';

type Step = {
  icon: string;
  iconColor: string;
  bgColor: string;
  titleKey: string;
  bodyKey: string;
};

const STEPS: Step[] = [
  {
    icon: 'storefront',
    iconColor: '#fff',
    bgColor: colors.primary,
    titleKey: 'guide.step1Title',
    bodyKey: 'guide.step1Body',
  },
  {
    icon: 'cart',
    iconColor: '#fff',
    bgColor: '#16a34a',
    titleKey: 'guide.step2Title',
    bodyKey: 'guide.step2Body',
  },
  {
    icon: 'cube',
    iconColor: '#fff',
    bgColor: '#7c3aed',
    titleKey: 'guide.step3Title',
    bodyKey: 'guide.step3Body',
  },
  {
    icon: 'people',
    iconColor: '#fff',
    bgColor: '#d97706',
    titleKey: 'guide.step4Title',
    bodyKey: 'guide.step4Body',
  },
  {
    icon: 'sunny',
    iconColor: '#fff',
    bgColor: '#0284c7',
    titleKey: 'guide.step5Title',
    bodyKey: 'guide.step5Body',
  },
];

export function FirstTimeGuide() {
  const { t } = useTranslation();
  const { onboardingDone, setOnboardingDone } = useUIStore();
  const [step, setStep] = React.useState(0);
  const { width } = useWindowDimensions();

  if (onboardingDone) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = () => {
    if (isLast) {
      setOnboardingDone(true);
    } else {
      setStep((s) => s + 1);
    }
  };

  const skip = () => setOnboardingDone(true);

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { maxWidth: Math.min(width - 40, 420) }]}>
          <TouchableOpacity style={styles.skipBtn} onPress={skip} hitSlop={12}>
            <Text style={styles.skipText}>{t('guide.skip')}</Text>
          </TouchableOpacity>

          <View style={[styles.iconWrap, { backgroundColor: current.bgColor }]}>
            <Ionicons name={current.icon as any} size={52} color={current.iconColor} />
          </View>

          <Text style={styles.title}>{t(current.titleKey as any)}</Text>
          <Text style={styles.body}>{t(current.bodyKey as any)}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === step && styles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
            <Text style={styles.nextText}>
              {isLast ? t('guide.startUsing') : t('guide.next')}
            </Text>
            <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.xs,
  },
  skipText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '600',
  },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 30,
  },
  body: {
    fontSize: 15,
    color: colors.body,
    textAlign: 'center',
    lineHeight: 23,
    paddingHorizontal: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderSoft,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 22,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 28,
    gap: 8,
    width: '100%',
    marginTop: spacing.xs,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
});
