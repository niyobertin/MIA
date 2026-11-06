import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import BusinessApp from './business/BusinessApp';
import Login from './Login';
import { useSession } from './lib/auth';

export default function AuthGate() {
  const session = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) queryClient.clear();
  }, [userId, queryClient]);

  return session ? <BusinessApp key={session.user.id} session={session} /> : <Login />;
}
