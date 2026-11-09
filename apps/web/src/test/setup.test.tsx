import { describe, expect, it } from 'vitest';
import { authClient } from '@/lib/auth-client';
import { mockApi } from './render';
import { takeUnmockedRequests } from './unmocked-requests';

// Each test drains the unmocked requests it provokes on purpose, so `setup.ts` does not fail it.
describe('component test setup', () => {
  it('rejects a request made without mockApi, naming its method and URL', async () => {
    const message = `Unmocked request: DELETE ${location.origin}/api/vehicles/v1. Answer it with mockApi() in the test.`;

    await expect(fetch('/api/vehicles/v1', { method: 'DELETE' })).rejects.toThrow(message);
    expect(takeUnmockedRequests()).toEqual([message]);
  });

  it('rejects a request to a route mockApi does not declare, naming its method and URL', async () => {
    const fetchMock = mockApi({ 'GET /vehicles': { body: [] } });
    const message = `Unmocked request: GET ${location.origin}/api/settings. Answer it with mockApi() in the test.`;

    await expect(fetch('/api/settings')).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(takeUnmockedRequests()).toEqual([message]);
  });

  it('sends the auth client requests, captured on import, to the mockApi of the test', async () => {
    const fetchMock = mockApi({ 'POST /auth/sign-out': { body: { success: true } } });

    const { data, error } = await authClient.signOut();

    expect(error).toBeNull();
    expect(data).toEqual({ success: true });
    const urls = fetchMock.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input));
    // Same-origin mode: `apiFetch` sends the relative `/api/…` path.
    expect(urls).toEqual(['/api/auth/sign-out']);
    expect(takeUnmockedRequests()).toEqual([]);
  });
});
