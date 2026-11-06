import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';

export type Me = {
  user: { id: string; name: string; email: string; role: string };
  business: { id: string; name: string; currency: string; country: string; timezone: string; business_code: string };
  permissions: string[];
  flags: Record<string, boolean>;
  announcements: { id: string; title: string; body: string; severity: 'info' | 'warning' | 'critical' }[];
};

export function useMe(userId: string) {
  return useQuery({
    queryKey: ['dashboard-me', userId],
    queryFn: async () => (await api.get<Me>('/dashboard/me')).data,
    staleTime: 60000,
  });
}
