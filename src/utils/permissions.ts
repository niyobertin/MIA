import { UserRole } from '@/types';

export function canSeeProfit(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function canCloseDay(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

/** Issue / pay / return waiter tabs (same gate as close day). */
export function canManageWaiterTabs(role?: UserRole | null): boolean {
  return canCloseDay(role);
}

export function canManageUsers(role?: UserRole | null): boolean {
  return role === 'OWNER';
}

export function canManageInventory(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function canAdjustStock(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function canReverseStock(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function canRecordOperationalStock(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER' || role === 'CASHIER';
}

export function roleLabel(role?: UserRole | null): string {
  return role ?? '';
}
