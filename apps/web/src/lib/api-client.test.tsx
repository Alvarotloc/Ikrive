import { describe, expect, it, type Mock } from 'vitest';
import { mockApi, setServerMode } from '@/test/render';
import { api } from './api-client';
import { setServerUrl } from './server';

const SERVER = 'https://ikrive.example.com';

/** Every request sent through the stubbed `fetch`, as `Request`s. */
const requestsOf = (fetchMock: Mock<typeof fetch>) =>
  fetchMock.mock.calls.map(([input, init]) =>
    input instanceof Request ? input : new Request(new URL(String(input), location.origin), init),
  );

const routes = {
  'GET /vehicles': { body: [] },
  'POST /vehicles': { status: 201, body: { id: 'v1' } },
  'POST /vehicles/v1/photo': { body: { id: 'v1' } },
  'GET /vehicles/v1/report': {
    body: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    headers: { 'content-disposition': 'attachment; filename="informe.pdf"' },
  },
};

describe('api client', () => {
  it('same origin: sends relative requests with cookies and no Authorization', async () => {
    const fetchMock = mockApi(routes);

    await api.get('/vehicles');
    await api.download('/vehicles/v1/report');

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/vehicles',
      '/api/vehicles/v1/report',
    ]);
    for (const request of requestsOf(fetchMock)) {
      expect(new URL(request.url).origin).toBe(location.origin);
      expect(request.credentials).toBe('include');
      expect(request.headers.get('authorization')).toBeNull();
    }
  });

  it('server mode: sends requests to the server without cookies', async () => {
    setServerMode(SERVER);
    const fetchMock = mockApi(routes);

    await api.get('/vehicles');

    const [request] = requestsOf(fetchMock);
    expect(request?.url).toBe(`${SERVER}/api/vehicles`);
    expect(request?.credentials).toBe('omit');
    // Without a token yet (before signing in) there is nothing to send.
    expect(request?.headers.get('authorization')).toBeNull();
  });

  it('server mode: adds the bearer token to JSON, FormData and download requests', async () => {
    setServerMode(SERVER, 'secret-token');
    const fetchMock = mockApi(routes);

    await api.post('/vehicles', { make: 'Toyota' });
    const form = new FormData();
    form.append('file', new File(['x'], 'foto.jpg', { type: 'image/jpeg' }));
    await api.post('/vehicles/v1/photo', form);
    const file = await api.download('/vehicles/v1/report');

    const requests = requestsOf(fetchMock);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST ${SERVER}/api/vehicles`,
      `POST ${SERVER}/api/vehicles/v1/photo`,
      `GET ${SERVER}/api/vehicles/v1/report`,
    ]);
    for (const request of requests) {
      expect(request.headers.get('authorization')).toBe('Bearer secret-token');
      expect(request.credentials).toBe('omit');
    }
    expect(requests[0]?.headers.get('content-type')).toBe('application/json');
    expect(await requests[0]?.json()).toEqual({ make: 'Toyota' });
    expect(requests[1]?.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(file.fileName).toBe('informe.pdf');
  });

  it('server mode: uses a new server URL on the next request', async () => {
    setServerMode(SERVER);
    const fetchMock = mockApi(routes);

    await api.get('/vehicles');
    setServerUrl('http://192.168.1.10:3000');
    await api.get('/vehicles');

    expect(requestsOf(fetchMock).map((request) => request.url)).toEqual([
      `${SERVER}/api/vehicles`,
      'http://192.168.1.10:3000/api/vehicles',
    ]);
  });
});
