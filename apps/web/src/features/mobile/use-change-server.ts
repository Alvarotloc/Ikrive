import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { setLocalMode } from '@/lib/app-mode';
import { setDataSource } from '@/lib/data-source';
import { httpDataSource } from '@/lib/data-source/http';
import { setServerUrl } from '@/lib/server';

/**
 * Saves `url` as the server (dropping the token of the previous one) and turns the local mode off (back to
 * the HTTP `DataSource`), empties the whole query cache so nothing of the previous server or of the phone
 * is shown (session, vehicles, photos, invoices) and goes to its login.
 */
export function useChangeServer() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (url: string) => {
    setServerUrl(url);
    setLocalMode(false);
    setDataSource(httpDataSource);
    queryClient.clear();
    await navigate({ to: '/login' });
  };
}
