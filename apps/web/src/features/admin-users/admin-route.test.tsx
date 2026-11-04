import { DEFAULT_USER_SETTINGS, type Me } from '@ikrive/shared';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, type Mock } from 'vitest';
import { routeTree } from '@/routeTree.gen';
import { createTestQueryClient, mockApi, mockMediaQuery, renderWithProviders } from '@/test/render';

const calls = (fetchMock: Mock<typeof fetch>, path: string) =>
  fetchMock.mock.calls.filter(([input]) => String(input).startsWith(path));

const regularUser: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };

describe('/admin/users route', () => {
  it('redirects a regular user to the dashboard', async () => {
    mockMediaQuery(true);
    // No `GET /admin/users`: if the page asked for the list, the unmocked request would fail the test.
    const fetchMock = mockApi({
      'GET /me': { body: regularUser },
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
      'GET /vehicles': { body: [] },
    });
    const queryClient = createTestQueryClient();
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ['/admin/users'] }),
    });
    renderWithProviders(<RouterProvider router={router} />, { queryClient });

    // R3 is about the redirect, not the dashboard: wait for the location and for the dashboard loader's
    // request (it starts once the guard has redirected), not for the lazily loaded page to render.
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await waitFor(() => expect(calls(fetchMock, '/api/vehicles')).not.toHaveLength(0));
    expect(calls(fetchMock, '/api/admin/')).toHaveLength(0);
  });
});
