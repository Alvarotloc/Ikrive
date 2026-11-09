import { describe, expect, it, type Mock } from 'vitest';
import { type MockResponse, mockApi, setServerMode } from '@/test/render';
import { authClient } from './auth-client';
import { getSessionToken } from './server';

const SERVER = 'https://ikrive.example.com';

const session = (token: string): MockResponse => ({
  body: { token: 'unsigned', user: { id: 'u1', email: 'ana@example.com', name: 'Ana' } },
  headers: { 'set-auth-token': token },
});

const requestsOf = (fetchMock: Mock<typeof fetch>) =>
  fetchMock.mock.calls.map(([input, init]) =>
    input instanceof Request ? input : new Request(new URL(String(input), location.origin), init),
  );

const credentials = { email: 'ana@example.com', password: 'secret-password' };

describe('auth client', () => {
  it('server mode: signs in against the server and stores the set-auth-token', async () => {
    setServerMode(SERVER);
    const fetchMock = mockApi({ 'POST /auth/sign-in/email': session('signed-token') });

    const { error } = await authClient.signIn.email(credentials);

    expect(error).toBeNull();
    const [request] = requestsOf(fetchMock);
    expect(request?.url).toBe(`${SERVER}/api/auth/sign-in/email`);
    expect(request?.credentials).toBe('omit');
    expect(getSessionToken()).toBe('signed-token');
  });

  it('server mode: stores the token of sign-up', async () => {
    setServerMode(SERVER);
    const fetchMock = mockApi({ 'POST /auth/sign-up/email': session('signed-up-token') });

    await authClient.signUp.email({ ...credentials, name: 'Ana' });

    expect(requestsOf(fetchMock)[0]?.url).toBe(`${SERVER}/api/auth/sign-up/email`);
    expect(getSessionToken()).toBe('signed-up-token');
  });

  it('server mode: does not store a token on a failed sign-in', async () => {
    setServerMode(SERVER);
    mockApi({
      'POST /auth/sign-in/email': {
        status: 401,
        body: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
        headers: { 'set-auth-token': 'should-not-be-stored' },
      },
    });

    const { error } = await authClient.signIn.email(credentials);

    expect(error?.status).toBe(401);
    expect(getSessionToken()).toBeNull();
  });

  it('same origin: signs in with cookies and stores no token', async () => {
    const fetchMock = mockApi({ 'POST /auth/sign-in/email': session('signed-token') });

    await authClient.signIn.email(credentials);

    const [request] = requestsOf(fetchMock);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/auth/sign-in/email');
    expect(new URL(request?.url ?? '').origin).toBe(location.origin);
    expect(request?.credentials).toBe('include');
    expect(request?.headers.get('authorization')).toBeNull();
    expect(getSessionToken()).toBeNull();
  });
});
