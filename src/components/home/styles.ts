import { StyleSheet } from 'react-native';
import { colors, radius, spacing, shadows } from '@/theme/tokens';

export const homeCard = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  hint: { fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  muted: { fontSize: 15, color: colors.muted },
  link: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
