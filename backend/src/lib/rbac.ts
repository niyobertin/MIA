import type { PlatformRole } from '../entities/platform';

export type BusinessRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'STAFF';

export const DASHBOARD_PERMISSIONS = {
  overview: ['OWNER', 'MANAGER'],
  reports: ['OWNER', 'MANAGER'],
  sales: ['OWNER', 'MANAGER', 'CASHIER'],
  salesAll: ['OWNER', 'MANAGER'],
  payments: ['OWNER', 'MANAGER', 'CASHIER'],
  paymentsAll: ['OWNER', 'MANAGER'],
  customers: ['OWNER', 'MANAGER', 'CASHIER'],
  products: ['OWNER', 'MANAGER', 'CASHIER', 'STAFF'],
  costs: ['OWNER', 'MANAGER'],
  purchases: ['OWNER', 'MANAGER'],
  movements: ['OWNER', 'MANAGER'],
  stockReport: ['OWNER', 'MANAGER'],
  expenses: ['OWNER', 'MANAGER'],
  staff: ['OWNER', 'MANAGER'],
  staffManage: ['OWNER'],
  audit: ['OWNER'],
  supportAccess: ['OWNER'],
} as const satisfies Record<string, readonly BusinessRole[]>;

export type DashboardPermission = keyof typeof DASHBOARD_PERMISSIONS;

export function hasDashboardPermission(role: string | null | undefined, permission: DashboardPermission): boolean {
  return (DASHBOARD_PERMISSIONS[permission] as readonly string[]).includes(role ?? '');
}

export function dashboardPermissionsFor(role: string | null | undefined): DashboardPermission[] {
  return (Object.keys(DASHBOARD_PERMISSIONS) as DashboardPermission[]).filter((permission) =>
    hasDashboardPermission(role, permission),
  );
}

export const FEATURE_FLAGS = {
  web_dashboard: { label: 'Web dashboard', description: 'Lets this business sign in to the web dashboard.', default: true },
  stock_reports: { label: 'Stock reports', description: 'Shows the stock valuation report in the web dashboard.', default: true },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function resolveFlags(stored: Record<string, boolean> | null | undefined): Record<FeatureFlag, boolean> {
  const flags = {} as Record<FeatureFlag, boolean>;
  for (const key of Object.keys(FEATURE_FLAGS) as FeatureFlag[]) {
    flags[key] = stored?.[key] ?? FEATURE_FLAGS[key].default;
  }
  return flags;
}

const SUPPORT_PERMISSIONS = [
  'metrics:read',
  'businesses:read',
  'users:read',
  'users:manage',
  'sync:read',
  'alerts:read',
  'support:access',
] as const;

const FINANCE_PERMISSIONS = ['metrics:read', 'businesses:read', 'billing:read', 'billing:write'] as const;

const SUPER_ADMIN_PERMISSIONS = [
  ...SUPPORT_PERMISSIONS,
  'businesses:suspend',
  'billing:read',
  'billing:write',
  'audit:read',
  'data:manage',
  'announcements:manage',
  'flags:manage',
  'admins:manage',
] as const;

export type PlatformPermission = (typeof SUPER_ADMIN_PERMISSIONS)[number];

const PLATFORM_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
  SUPPORT: SUPPORT_PERMISSIONS,
  FINANCE: FINANCE_PERMISSIONS,
};

export function platformPermissionsFor(role: PlatformRole): readonly PlatformPermission[] {
  return PLATFORM_PERMISSIONS[role] ?? [];
}

export function hasPlatformPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return platformPermissionsFor(role).includes(permission);
}
