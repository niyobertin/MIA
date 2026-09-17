import { UserRole } from '@/types';

export function canSeeProfit(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function canCloseDay(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function canManageUsers(role?: UserRole | null): boolean {
  return role === 'OWNER';
}

export function canManageInventory(role?: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function roleLabel(role?: UserRole | null): string {
  return role ?? '';
}
