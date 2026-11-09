import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import { setSessionToken } from '@/lib/server';

/**
 * Signs out, drops every cached query of the user and goes to the login page. The stored token (server
 * mode) is dropped even if the sign-out request fails.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    try {
      await authClient.signOut();
    } finally {
      setSessionToken(null);
    }
    queryClient.clear();
    await navigate({ to: '/login' });
  };
}
