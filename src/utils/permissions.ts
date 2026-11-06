import { UserRole } from '@/types';

export function isSuperAdmin(role?: UserRole | null): boolean {
  return role === 'SUPER_ADMIN';
}

export function canSeeProfit(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || isSuperAdmin(role);
}

export function canCloseDay(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || isSuperAdmin(role);
}

/** Issue / pay / return waiter tabs (same gate as close day). */
export function canManageWaiterTabs(role?: UserRole | null): boolean {
  return canCloseDay(role);
}

export function canManageUsers(role?: UserRole | null): boolean {
  return role === 'OWNER' || isSuperAdmin(role);
}

export function canManageInventory(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || isSuperAdmin(role);
}

export function canAdjustStock(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || isSuperAdmin(role);
}

export function canReverseStock(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || isSuperAdmin(role);
}

export function canRecordOperationalStock(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || role === 'CASHIER';
}

export function canManageBusiness(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || isSuperAdmin(role);
}

export function roleLabel(role?: UserRole | null): string {
  return role ?? '';
}
