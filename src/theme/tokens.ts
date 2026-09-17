export const colors = {
  primary: '#4338ca',
  primaryDark: '#3730a1',
  primarySoft: '#eef2ff',
  primaryText: '#312e81',

  success: '#16a34a',
  successSoft: '#dcfce7',
  successText: '#15803d',

  warning: '#d97706',
  warningSoft: '#fef3c7',
  warningText: '#b45309',

  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  dangerText: '#b91c1c',

  info: '#0284c7',
  infoSoft: '#e0f2fe',

  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b3',

  background: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  borderSoft: '#f1f5f9',

  inputBg: '#f8fafc',

  white: '#ffffff',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const typography = {
  heroAmount: { fontSize: 32, fontWeight: '800' as const },
  screenTitle: { fontSize: 22, fontWeight: '800' as const },
  sectionTitle: { fontSize: 16, fontWeight: '700' as const },
  cardTitle: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  captionStrong: { fontSize: 12, fontWeight: '600' as const },
  label: { fontSize: 12, fontWeight: '600' as const },
  kpiLabel: { fontSize: 11, fontWeight: '700' as const },
} as const;

export const shadows = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  raised: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;
