import type { Vehicle } from '@ikrive/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { type MockRoutes, mockApi, mockMediaQuery, renderWithProviders, setServerMode } from '@/test/render';
import { PhotoPicker } from './photo-picker';

/** The native side of the camera permission: `CameraCaptureButton` loads it only in the native app. */
const nativeCamera = vi.hoisted(() => ({ isCameraGranted: vi.fn() }));
vi.mock('@/lib/native-camera', () => nativeCamera);

const car: Vehicle = {
  id: 'v1',
  name: null,
  make: 'Toyota',
  model: 'Corolla',
  version: null,
  year: 2021,
  plate: '4821 LKP',
  vin: null,
  type: 'car',
  fuelType: 'hybrid',
  purchaseDate: null,
  purchasePrice: null,
  purchaseOdometer: null,
  notes: null,
  soldAt: null,
  archivedAt: null,
  status: 'active',
  photoUrl: null,
  odometer: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PHOTO = '/vehicles/v1/photo';
const SERVER = 'https://ikrive.example.com';
const DENIED = /Ikrive no tiene permiso para usar la cámara/;

const photo = () => new File([new Uint8Array(10)], 'JPEG_20261118.jpg', { type: 'image/jpeg' });

/** The picker on a touch device (`true`) or a desktop (`false`), with the given API routes. */
function setup({ touch = true, routes = {} }: { touch?: boolean; routes?: MockRoutes } = {}) {
  mockMediaQuery(touch);
  const fetchMock = mockApi(routes);
  return {
    fetchMock,
    ...renderWithProviders(
      <>
        <Toaster />
        <PhotoPicker vehicle={car} />
      </>,
    ),
  };
}

const cameraInput = () => screen.getByLabelText('Hacer una foto con la cámara');
const galleryInput = () => screen.getByLabelText('Elegir foto del vehículo');

/** The `PUT` requests of the photo: their URL, headers and the uploaded file (the `file` part). */
const photoRequests = (fetchMock: Mock<typeof fetch>) =>
  fetchMock.mock.calls
    .filter(([input, init]) => init?.method === 'PUT' && String(input).endsWith(`/api${PHOTO}`))
    .map(([input, init]) => {
      const body = init?.body;
      if (!(body instanceof FormData)) throw new Error(`Expected a multipart body for PUT ${PHOTO}`);
      return { url: String(input), headers: new Headers(init?.headers), file: body.get('file') as File };
    });

describe('PhotoPicker', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    nativeCamera.isCameraGranted.mockReset();
    // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
    toast.dismiss();
  });

  it('offers take photo and choose from gallery on a touch device', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Hacer foto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elegir de la galería' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir foto' })).not.toBeInTheDocument();

    const camera = cameraInput();
    expect(camera).toHaveAttribute('type', 'file');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(camera).toHaveAttribute('accept', 'image/*');
    expect(camera).not.toHaveAttribute('multiple');

    const gallery = galleryInput();
    expect(gallery).toHaveAttribute('accept', 'image/*');
    expect(gallery).not.toHaveAttribute('capture');
  });

  it('uploads a photo taken with the camera like a chosen one', async () => {
    const { user, fetchMock } = setup({ routes: { [`PUT ${PHOTO}`]: { body: car } } });

    await user.upload(cameraInput(), photo());

    expect(await screen.findByText('Foto actualizada')).toBeInTheDocument();
    const [request] = photoRequests(fetchMock);
    expect(request).toBeDefined();
    expect(request?.file.name).toBe('JPEG_20261118.jpg');
    expect(cameraInput()).toHaveValue('');
  });

  it('shows the invalid image error for a camera photo the API rejects', async () => {
    const { user } = setup({
      routes: {
        [`PUT ${PHOTO}`]: { status: 415, body: { type: 'about:blank', title: 'Unsupported', status: 415 } },
      },
    });

    await user.upload(cameraInput(), photo());

    expect(
      await screen.findByText('No se pudo usar esa imagen. Prueba con un JPG, PNG o WebP más pequeño.'),
    ).toBeInTheDocument();
  });

  it('desktop: hides take photo and keeps add photo', () => {
    setup({ touch: false });

    expect(screen.queryByRole('button', { name: 'Hacer foto' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hacer una foto con la cámara')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Elegir de la galería' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir foto' })).toBeInTheDocument();
  });

  it('desktop: keeps change photo when the vehicle has one', () => {
    mockMediaQuery(false);
    mockApi({ [`GET ${PHOTO}`]: { body: new Blob(['jpeg'], { type: 'image/jpeg' }) } });
    renderWithProviders(<PhotoPicker vehicle={{ ...car, photoUrl: `/api${PHOTO}` }} />);

    expect(screen.getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hacer foto' })).not.toBeInTheDocument();
  });

  it('native: warns when the camera is cancelled without permission', async () => {
    vi.stubEnv('MODE', 'native');
    nativeCamera.isCameraGranted.mockResolvedValue(false);
    setup({ touch: false });

    fireEvent(cameraInput(), new Event('cancel'));

    expect(await screen.findByText(DENIED)).toHaveTextContent(
      'Ikrive no tiene permiso para usar la cámara. Actívalo en Ajustes › Aplicaciones › Ikrive › Permisos, o elige una imagen o un archivo ya guardado.',
    );
    expect(nativeCamera.isCameraGranted).toHaveBeenCalledTimes(1);
  });

  it('native: says nothing when the camera is cancelled with permission', async () => {
    vi.stubEnv('MODE', 'native');
    nativeCamera.isCameraGranted.mockResolvedValue(true);
    setup({ touch: false });

    fireEvent(cameraInput(), new Event('cancel'));

    await waitFor(() => expect(nativeCamera.isCameraGranted).toHaveBeenCalledTimes(1));
    // Let the resolved permission reach the handler before checking that no toast came out.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(DENIED)).not.toBeInTheDocument();
  });

  it('chooses from the gallery after the camera permission warning', async () => {
    vi.stubEnv('MODE', 'native');
    nativeCamera.isCameraGranted.mockResolvedValue(false);
    const { user, fetchMock } = setup({ routes: { [`PUT ${PHOTO}`]: { body: car } } });

    fireEvent(cameraInput(), new Event('cancel'));
    expect(await screen.findByText(DENIED)).toBeInTheDocument();

    const chosen = new File([new Uint8Array(10)], 'garaje.png', { type: 'image/png' });
    await user.upload(galleryInput(), chosen);

    expect(await screen.findByText('Foto actualizada')).toBeInTheDocument();
    const [request] = photoRequests(fetchMock);
    expect(request?.file.name).toBe('garaje.png');
  });

  it('web: never checks the camera permission on cancel', async () => {
    setup();

    fireEvent(cameraInput(), new Event('cancel'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(nativeCamera.isCameraGranted).not.toHaveBeenCalled();
    expect(screen.queryByText(DENIED)).not.toBeInTheDocument();
  });

  it('server mode: sends the camera photo to the server with the token', async () => {
    setServerMode(SERVER, 'secret-token');
    const { user, fetchMock } = setup({ routes: { [`PUT ${PHOTO}`]: { body: car } } });

    await user.upload(cameraInput(), photo());

    expect(await screen.findByText('Foto actualizada')).toBeInTheDocument();
    const [request] = photoRequests(fetchMock);
    expect(request?.url).toBe(`${SERVER}/api${PHOTO}`);
    expect(request?.headers.get('authorization')).toBe('Bearer secret-token');
    expect(request?.file.name).toBe('JPEG_20261118.jpg');
  });
});
