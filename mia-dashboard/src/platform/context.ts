import { createContext, useContext } from 'react';
import type { PlatformAdmin } from '../lib/platformAuth';

export const AdminContext = createContext<PlatformAdmin | null>(null);

export function useAdmin() {
  return useContext(AdminContext) as PlatformAdmin;
}

export function useCan(permission: string) {
  return useAdmin().permissions.includes(permission);
}
