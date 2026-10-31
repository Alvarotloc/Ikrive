import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';

/** Signs out, drops every cached query of the user and goes to the login page. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: '/login' });
  };
}
