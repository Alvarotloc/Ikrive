import {
  DEFAULT_USER_SETTINGS,
  type MaintenanceRecord,
  type Me,
  type NotificationList,
  type Vehicle,
  type VehicleStats,
} from '@ikrive/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { MaintenanceFormInput } from '@/features/maintenance/form';
import { type MockRoutes, mockApi, mockMediaQuery, mockObjectUrls, setServerMode } from '@/test/render';
import { renderApp } from '@/test/render-app';
import type { CaptureTarget, PendingCapture } from './camera-restore';
import { forgetRestoreRun } from './camera-restore';

/** The native side of the camera: the pending capture on disk and the photo in `Pictures`. */
const native = vi.hoisted(() => ({
  isCameraGranted: vi.fn(async () => true),
  savePendingCapture: vi.fn(async (_json: string) => {}),
  readPendingCapture: vi.fn(async (): Promise<string | null> => null),
  clearPendingCapture: vi.fn(async () => {}),
  readCameraPhotoSince: vi.fn(async (_openedAt: number): Promise<File | null> => null),
}));
vi.mock('@/lib/native-camera', () => native);

/** The phone notifications of the server mode's layout. */
vi.mock('@/lib/native-notifications', () => ({
  getNotificationPermission: vi.fn(async () => 'denied'),
  requestNotificationPermission: vi.fn(),
  showNotifications: vi.fn(),
  onNotificationTap: vi.fn(async () => async () => {}),
}));

const SERVER = 'https://ikrive.example.com';
const OPENED_AT = Date.UTC(2026, 10, 19, 10, 15, 30, 500);
const PHOTO_NAME = 'JPEG_20261119_101540_8123.jpg';

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };
const emptyList: NotificationList = { items: [], total: 0, unreadCount: 0 };

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

const record: MaintenanceRecord = {
  id: 'r1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: null,
  category: 'brakes',
  title: 'Pastillas delanteras',
  description: null,
  workshop: null,
  cost: null,
  includeInReport: true,
  scheduleId: null,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};
const created: MaintenanceRecord = { ...record, id: 'r9', title: 'ITV', category: 'inspection' };

const stats: VehicleStats = {
  distance: { driven: null, perYear: null, perMonth: null },
  consumption: { average: null },
  costPerDistance: { fuel: null, maintenance: null, expenses: null, total: null },
  spending: {
    purchase: null,
    fuel: 0,
    maintenance: 0,
    expenses: 0,
    total: 0,
    byCategory: [],
    expensesByCategory: [],
  },
  series: { distanceByMonth: [], consumptionBySegment: [], spendingByMonth: [] },
};

const attachmentBody = (recordId: string, name: string) => ({
  id: `a-${name}`,
  originalName: name,
  mimeType: 'image/jpeg',
  size: 10,
  sha256: 'a'.repeat(64),
  url: `/api/vehicles/v1/maintenance/${recordId}/attachments/a-${name}`,
  thumbnailUrl: null,
  createdAt: '2026-11-19T10:16:00.000Z',
});

const notFound = { status: 404, body: { type: 'about:blank', title: 'Not Found', status: 404 } };

/** The create form as it was when the camera opened. */
const draft: MaintenanceFormInput = {
  date: '2026-11-18',
  odometer: '123.456',
  category: 'inspection',
  title: 'ITV',
  description: 'Pasada sin defectos',
  workshop: 'Estación de Getafe',
  cost: '45,50',
  includeInReport: false,
  scheduleId: '',
};

const pending = (target: CaptureTarget, extra: Partial<PendingCapture> = {}) =>
  JSON.stringify({ target, mode: 'server', openedAt: OPENED_AT, ...extra });

const cameraPhoto = () =>
  new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00])], PHOTO_NAME, { type: 'image/jpeg' });

/** Every request of the app layout, the vehicle page and its edit page, plus `routes`. */
function setup(routes: MockRoutes = {}) {
  return mockApi({
    'GET /me': { body: me },
    'GET /settings': { body: DEFAULT_USER_SETTINGS },
    'GET /config': { body: { maxUploadMb: 10 } },
    'GET /notifications': { body: emptyList },
    'GET /vehicles': { body: [car] },
    'GET /vehicles/v1': { body: car },
    'GET /vehicles/v1/odometer': { body: [] },
    'GET /vehicles/v1/maintenance': { body: [record] },
    'GET /vehicles/v1/maintenance/spending': { body: { total: 0 } },
    'GET /vehicles/v1/schedules': { body: [] },
    'GET /vehicles/v1/fuel-logs': { body: [] },
    'GET /vehicles/v1/expenses': { body: [] },
    'GET /vehicles/v1/stats': { body: stats },
    'GET /vehicles/v1/maintenance/r1/attachments': { body: [] },
    ...routes,
  });
}

/** Requests sent with `method` to `path` (relative to `/api`). */
const callsTo = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => {
    const request = url instanceof Request ? url : new Request(String(url), init);
    return request.method === method && new URL(request.url).pathname === `/api${path}`;
  });

/** Names of the files sent with `method path` (multipart bodies, one `file` each). */
function uploadedNames(fetchMock: Mock<typeof fetch>, method: string, path: string) {
  return callsTo(fetchMock, method, path).map(([, init]) => {
    const body = init?.body;
    if (!(body instanceof FormData)) throw new Error(`Expected a multipart body for ${method} ${path}`);
    const file = body.get('file');
    return file instanceof File ? file.name : null;
  });
}

const RESTORE_FAILED = 'No se ha podido recuperar la foto de la cámara. Vuelve a hacerla.';
const LOST_INVOICES =
  'Hemos recuperado la foto, pero las otras facturas que habías añadido se han perdido. Vuelve a añadirlas.';

beforeEach(() => {
  vi.stubEnv('MODE', 'native');
  setServerMode(SERVER, 'secret-token');
  // The notification permission was already asked on this device.
  localStorage.setItem('ikrive.notificationPermissionAsked', '2026-11-09T08:00:00.000Z');
  mockMediaQuery(true);
  mockObjectUrls();
  // Each test is a new app run.
  forgetRestoreRun();
});

afterEach(() => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  toast.dismiss();
  vi.unstubAllEnvs();
  for (const mock of Object.values(native)) mock.mockClear();
  native.readPendingCapture.mockResolvedValue(null);
  native.readCameraPhotoSince.mockResolvedValue(null);
});

describe('CameraRestoreHandler', () => {
  it('restores a vehicle photo on the edit page after the app was killed', async () => {
    native.readPendingCapture.mockResolvedValue(pending({ kind: 'vehicle-photo', vehicleId: 'v1' }));
    native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
    const fetchMock = setup({ 'PUT /vehicles/v1/photo': { body: car } });

    const { router } = await renderApp('/');

    expect(await screen.findByText('Foto actualizada')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles/v1/edit');
    expect(screen.getByRole('heading', { name: 'Editar vehículo' })).toBeInTheDocument();
    expect(native.readCameraPhotoSince).toHaveBeenCalledExactlyOnceWith(OPENED_AT);
    expect(uploadedNames(fetchMock, 'PUT', '/vehicles/v1/photo')).toEqual([PHOTO_NAME]);
  });

  it('restores an invoice into the attachments dialog of its record', async () => {
    native.readPendingCapture.mockResolvedValue(
      pending({ kind: 'invoice', vehicleId: 'v1', recordId: 'r1' }),
    );
    native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
    const fetchMock = setup({
      'POST /vehicles/v1/maintenance/r1/attachments': { status: 201, body: attachmentBody('r1', PHOTO_NAME) },
    });

    const { router } = await renderApp('/');

    const dialog = await screen.findByRole('dialog', { name: 'Facturas' });
    expect(within(dialog).getByText('Pastillas delanteras')).toBeInTheDocument();
    expect(await screen.findByText('1 factura subida')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles/v1');
    expect(uploadedNames(fetchMock, 'POST', '/vehicles/v1/maintenance/r1/attachments')).toEqual([PHOTO_NAME]);
  });

  it('restores an invoice draft into the create form without saving it', async () => {
    native.readPendingCapture.mockResolvedValue(
      pending({ kind: 'invoice-draft', vehicleId: 'v1', draft, pendingCount: 0 }),
    );
    native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
    const fetchMock = setup({
      'POST /vehicles/v1/maintenance': { status: 201, body: created },
      'POST /vehicles/v1/maintenance/r9/attachments': { status: 201, body: attachmentBody('r9', PHOTO_NAME) },
    });

    const { user, router } = await renderApp('/');

    const form = await screen.findByRole('dialog', { name: 'Añadir mantenimiento' });
    expect(router.state.location.pathname).toBe('/vehicles/v1');
    expect(within(form).getByLabelText('Fecha')).toHaveValue('2026-11-18');
    expect(within(form).getByLabelText('Kilometraje (km)')).toHaveValue('123.456');
    expect(within(form).getByLabelText('Categoría')).toHaveValue('inspection');
    expect(within(form).getByLabelText('Título')).toHaveValue('ITV');
    expect(within(form).getByLabelText('Taller')).toHaveValue('Estación de Getafe');
    expect(within(form).getByLabelText('Coste (EUR)')).toHaveValue('45,50');
    expect(within(form).getByLabelText('Descripción')).toHaveValue('Pasada sin defectos');
    expect(within(form).getByLabelText('Incluir en el informe')).not.toBeChecked();
    expect(within(form).getByText(PHOTO_NAME)).toBeInTheDocument();
    expect(screen.queryByText(LOST_INVOICES)).not.toBeInTheDocument();
    // Nothing is saved until «Save».
    expect(callsTo(fetchMock, 'POST', '/vehicles/v1/maintenance')).toHaveLength(0);
    expect(uploadedNames(fetchMock, 'POST', '/vehicles/v1/maintenance/r9/attachments')).toEqual([]);

    await user.click(within(form).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Mantenimiento añadido')).toBeInTheDocument();
    expect(await screen.findByText('1 factura subida')).toBeInTheDocument();
    const [[, init] = []] = callsTo(fetchMock, 'POST', '/vehicles/v1/maintenance');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      date: '2026-11-18',
      odometer: 123_456,
      category: 'inspection',
      title: 'ITV',
      workshop: 'Estación de Getafe',
      cost: 45.5,
      includeInReport: false,
    });
    expect(uploadedNames(fetchMock, 'POST', '/vehicles/v1/maintenance/r9/attachments')).toEqual([PHOTO_NAME]);
  });

  it('warns that the other pending invoices were lost', async () => {
    native.readPendingCapture.mockResolvedValue(
      pending({ kind: 'invoice-draft', vehicleId: 'v1', draft, pendingCount: 2 }),
    );
    native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
    setup();

    await renderApp('/');

    const form = await screen.findByRole('dialog', { name: 'Añadir mantenimiento' });
    expect(within(form).getByText(PHOTO_NAME)).toBeInTheDocument();
    expect(await screen.findByText(LOST_INVOICES)).toBeInTheDocument();
  });

  it('restores only once per app run', async () => {
    native.readPendingCapture.mockResolvedValue(pending({ kind: 'vehicle-photo', vehicleId: 'v1' }));
    native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
    const fetchMock = setup({ 'PUT /vehicles/v1/photo': { body: car } });

    const first = await renderApp('/');
    expect(await screen.findByText('Foto actualizada')).toBeInTheDocument();
    first.unmount();
    // The layout mounts again in the same run (e.g. logging out and in).
    const second = await renderApp('/vehicles');
    expect(await screen.findByRole('heading', { name: 'Toyota Corolla' })).toBeInTheDocument();

    expect(second.router.state.location.pathname).toBe('/vehicles');
    expect(native.readPendingCapture).toHaveBeenCalledTimes(1);
    expect(uploadedNames(fetchMock, 'PUT', '/vehicles/v1/photo')).toHaveLength(1);
  });

  it('forgets the pending capture after restoring it', async () => {
    native.readPendingCapture.mockResolvedValue(pending({ kind: 'vehicle-photo', vehicleId: 'v1' }));
    native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
    setup({ 'PUT /vehicles/v1/photo': { body: car } });

    await renderApp('/');

    expect(await screen.findByText('Foto actualizada')).toBeInTheDocument();
    expect(native.clearPendingCapture).toHaveBeenCalledTimes(1);
    expect(native.readCameraPhotoSince.mock.invocationCallOrder[0]).toBeLessThan(
      native.clearPendingCapture.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does nothing without a pending capture', async () => {
    setup();

    const { router } = await renderApp('/vehicles');

    expect(await screen.findByRole('heading', { name: 'Toyota Corolla' })).toBeInTheDocument();
    await waitFor(() => expect(native.readPendingCapture).toHaveBeenCalledTimes(1));
    expect(native.readCameraPhotoSince).not.toHaveBeenCalled();
    expect(native.clearPendingCapture).not.toHaveBeenCalled();
    expect(screen.queryByText(RESTORE_FAILED)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles');
  });

  describe('when the photo cannot be restored', () => {
    /** Renders the vehicle list and waits for the warning: the app stays where it was. */
    async function expectWarning() {
      const { router } = await renderApp('/vehicles');
      expect(await screen.findByText(RESTORE_FAILED)).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/vehicles');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(native.clearPendingCapture).toHaveBeenCalledTimes(1);
    }

    it('warns when the pending capture is invalid', async () => {
      native.readPendingCapture.mockResolvedValue('{"target":{"kind":"vehicle-photo"}');
      native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
      setup();

      await expectWarning();
      expect(native.readCameraPhotoSince).not.toHaveBeenCalled();
    });

    it('warns when the camera photo cannot be found', async () => {
      native.readPendingCapture.mockResolvedValue(pending({ kind: 'vehicle-photo', vehicleId: 'v1' }));
      // The camera was closed without a photo: only an empty file.
      native.readCameraPhotoSince.mockResolvedValueOnce(null);
      const fetchMock = setup({ 'PUT /vehicles/v1/photo': { body: car } });

      await expectWarning();

      // Nor when it cannot be read.
      forgetRestoreRun();
      native.clearPendingCapture.mockClear();
      native.readCameraPhotoSince.mockRejectedValueOnce(new Error('File does not exist.'));
      toast.dismiss();
      await expectWarning();
      expect(callsTo(fetchMock, 'PUT', '/vehicles/v1/photo')).toHaveLength(0);
    });

    it('warns when the capture was taken in the other mode', async () => {
      native.readPendingCapture.mockResolvedValue(
        pending({ kind: 'vehicle-photo', vehicleId: 'v1' }, { mode: 'local' }),
      );
      native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
      setup();

      await expectWarning();
      expect(native.readCameraPhotoSince).not.toHaveBeenCalled();
    });

    it('warns when the vehicle no longer exists', async () => {
      native.readPendingCapture.mockResolvedValue(pending({ kind: 'vehicle-photo', vehicleId: 'v2' }));
      native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
      setup({ 'GET /vehicles/v2': notFound });

      await expectWarning();
      expect(native.readCameraPhotoSince).not.toHaveBeenCalled();
    });

    it('warns when the maintenance record no longer exists', async () => {
      native.readPendingCapture.mockResolvedValue(
        pending({ kind: 'invoice', vehicleId: 'v1', recordId: 'r2' }),
      );
      native.readCameraPhotoSince.mockResolvedValue(cameraPhoto());
      setup();

      await expectWarning();
      expect(native.readCameraPhotoSince).not.toHaveBeenCalled();
    });

    it('forgets the pending capture after a failed restore', async () => {
      native.readPendingCapture.mockResolvedValue(pending({ kind: 'vehicle-photo', vehicleId: 'v1' }));
      native.readCameraPhotoSince.mockResolvedValue(null);
      setup();

      await expectWarning();
      expect(native.readCameraPhotoSince.mock.invocationCallOrder[0]).toBeLessThan(
        native.clearPendingCapture.mock.invocationCallOrder[0] ?? 0,
      );
    });
  });
});
