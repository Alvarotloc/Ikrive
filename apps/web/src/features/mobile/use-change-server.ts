import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { setServerUrl } from '@/lib/server';

/**
 * Saves `url` as the server (dropping the token of the previous one), empties the whole query cache so
 * nothing of the previous server is shown (session, vehicles, photos, invoices) and goes to its login.
 */
export function useChangeServer() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (url: string) => {
    setServerUrl(url);
    queryClient.clear();
    await navigate({ to: '/login' });
  };
}
