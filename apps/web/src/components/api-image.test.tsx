import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type MockResponse,
  mockApi,
  mockObjectUrls,
  renderWithProviders,
  setServerMode,
} from '@/test/render';
import { ApiImage } from './api-image';

const URL_PATH = '/api/vehicles/v1/photo?v=1';

const jpeg = (): MockResponse => ({ body: new Blob(['jpeg'], { type: 'image/jpeg' }) });

describe('ApiImage', () => {
  beforeEach(() => {
    mockObjectUrls();
  });

  it('same origin: renders the URL directly without fetching', () => {
    // No route: any request would fail the test.
    mockApi({});
    renderWithProviders(<ApiImage src={URL_PATH} alt="Foto" className="size-10" loading="lazy" />);

    const image = screen.getByRole('img', { name: 'Foto' });
    expect(image).toHaveAttribute('src', URL_PATH);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveClass('size-10');
  });

  it('server mode: loads the image with the bearer token as a blob URL', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    const fetchMock = mockApi({ 'GET /vehicles/v1/photo': jpeg() });
    const { revokeObjectURL } = mockObjectUrls();
    const { unmount } = renderWithProviders(<ApiImage src={URL_PATH} alt="Foto" className="size-10" />);

    expect(await screen.findByRole('img', { name: 'Foto' })).toHaveAttribute('src', 'blob:1');
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const request = new Request(String(input), init);
    expect(request.url).toBe(`https://ikrive.example.com${URL_PATH}`);
    expect(request.headers.get('authorization')).toBe('Bearer secret-token');

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  it('server mode: shows the placeholder while loading', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    let release: (response: MockResponse) => void = () => {};
    const fetchMock = mockApi({
      'GET /vehicles/v1/photo': () => new Promise((resolve) => (release = resolve)),
    });
    const { container } = renderWithProviders(<ApiImage src={URL_PATH} alt="Foto" className="size-10" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const placeholder = container.firstElementChild;
    // A block <span>, valid inside a <button> (attachment thumbnail).
    expect(placeholder?.tagName).toBe('SPAN');
    expect(placeholder).toHaveClass('block', 'size-10', 'bg-muted');
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');

    release(jpeg());
    expect(await screen.findByRole('img', { name: 'Foto' })).toHaveAttribute('src', 'blob:1');
  });

  it('server mode: calls onError when the request fails', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    mockApi({
      'GET /vehicles/v1/photo': {
        status: 404,
        body: { type: 'about:blank', title: 'Not Found', status: 404 },
      },
    });
    const onError = vi.fn();
    const { container } = renderWithProviders(
      <ApiImage src={URL_PATH} alt="Foto" className="size-10" onError={onError} />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('bg-muted');
  });
});
