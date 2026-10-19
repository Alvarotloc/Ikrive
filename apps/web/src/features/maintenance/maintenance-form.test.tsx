import { DEFAULT_USER_SETTINGS, type MaintenanceRecord } from '@ikrive/shared';
import { screen } from '@testing-library/react';
import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import i18n from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import { type MockResponse, type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { MaintenanceFormDialog } from './maintenance-form';

const record: MaintenanceRecord = {
  id: 'r1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: 120_000,
  category: 'brakes',
  title: 'Pastillas delanteras',
  description: 'Discos revisados',
  workshop: 'Taller Paco',
  cost: 180.5,
  includeInReport: false,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};

const problem = (status: number, extra: object = {}) => ({
  status,
  body: { type: 'about:blank', title: 'Error', status, ...extra },
});

/** Owns the `open` state like the timeline does, so closing the dialog is observable. */
function Harness({ record }: { record?: MaintenanceRecord }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <MaintenanceFormDialog vehicleId="v1" record={record} open={open} onOpenChange={setOpen} />
    </>
  );
}

function setup(routes: MockRoutes, options: { record?: MaintenanceRecord } = {}) {
  const fetchMock = mockApi({
    'GET /settings': { body: DEFAULT_USER_SETTINGS },
    'GET /config': { body: { maxUploadMb: 1 } },
    ...routes,
  });
  return { fetchMock, ...renderWithProviders(<Harness record={options.record} />) };
}

const callsTo = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url) === `/api${path}` && init?.method === method);

/** Requests sent with `method` to `path` (relative to `/api`), with their parsed JSON body. */
function requests(fetchMock: Mock<typeof fetch>, method: string, path: string) {
  return callsTo(fetchMock, method, path).map(([, init]) =>
    init?.body ? JSON.parse(String(init.body)) : undefined,
  );
}

/** Names of the files sent with `POST path`, in order (multipart bodies, one `file` each). */
function uploadedNames(fetchMock: Mock<typeof fetch>, path: string) {
  return callsTo(fetchMock, 'POST', path).map(([, init]) => {
    const body = init?.body;
    if (!(body instanceof FormData)) throw new Error(`Expected a multipart body for POST ${path}`);
    return (body.get('file') as File).name;
  });
}

const created: MaintenanceRecord = { ...record, id: 'r9' };
const ATTACHMENTS = '/vehicles/v1/maintenance/r9/attachments';
const attachmentBody = (name: string) => ({
  id: `a-${name}`,
  originalName: name,
  mimeType: 'application/pdf',
  size: 10,
  sha256: 'a'.repeat(64),
  url: `/api${ATTACHMENTS}/a-${name}`,
  thumbnailUrl: null,
  createdAt: '2025-03-10T10:00:00.000Z',
});
const pdfFile = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });
const invoiceInput = () => screen.getByLabelText('Elegir facturas');
const helpText = 'PDF, JPG, PNG o WebP · máx. 1 MB';

const label = {
  date: 'Fecha',
  odometer: 'Kilometraje (km)',
  category: 'Categoría',
  title: 'Título',
  workshop: 'Taller',
  cost: 'Coste (EUR)',
  description: 'Descripción',
  includeInReport: 'Incluir en el informe',
};

describe('MaintenanceFormDialog', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('creates a record, closes the dialog and shows a toast', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/maintenance': { status: 201, body: record } });

    expect(screen.getByRole('heading', { name: 'Añadir mantenimiento' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText(label.date));
    await user.type(screen.getByLabelText(label.date), '2025-03-10');
    await user.type(screen.getByLabelText(label.title), 'Cambio de aceite');
    await user.type(screen.getByLabelText(label.cost), '1.234,56');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Mantenimiento añadido')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/maintenance')).toEqual([
      {
        date: '2025-03-10',
        odometer: null,
        category: 'oil_change',
        title: 'Cambio de aceite',
        description: null,
        workshop: null,
        cost: 1234.56,
        includeInReport: true,
      },
    ]);
  });

  it('shows field errors without calling the API when the form is invalid', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/maintenance': { status: 201, body: record } });

    await user.type(screen.getByLabelText(label.odometer), 'mucho');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect((await screen.findAllByRole('alert')).map((alert) => alert.textContent)).toEqual([
      'Introduce un número válido.',
      'Este campo es obligatorio.',
    ]);
    expect(screen.getByLabelText(label.title)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/maintenance')).toEqual([]);
  });

  it('prefills the form with the record when editing', () => {
    setup({}, { record });

    expect(screen.getByRole('heading', { name: 'Editar mantenimiento' })).toBeInTheDocument();
    expect(screen.getByLabelText(label.date)).toHaveValue('2025-03-10');
    expect(screen.getByLabelText(label.odometer)).toHaveValue('120000');
    expect(screen.getByLabelText(label.category)).toHaveValue('brakes');
    expect(screen.getByLabelText(label.title)).toHaveValue('Pastillas delanteras');
    expect(screen.getByLabelText(label.workshop)).toHaveValue('Taller Paco');
    expect(screen.getByLabelText(label.cost)).toHaveValue('180.5');
    expect(screen.getByLabelText(label.description)).toHaveValue('Discos revisados');
    expect(screen.getByLabelText(label.includeInReport)).not.toBeChecked();
  });

  it('sends every field with PATCH and a blank odometer as null when editing', async () => {
    const { user, fetchMock } = setup(
      { 'PATCH /vehicles/v1/maintenance/r1': { body: { ...record, odometer: null } } },
      { record },
    );

    await user.clear(screen.getByLabelText(label.odometer));
    await user.selectOptions(screen.getByLabelText(label.category), 'repair');
    await user.click(screen.getByLabelText(label.includeInReport));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Mantenimiento actualizado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'PATCH', '/vehicles/v1/maintenance/r1')).toEqual([
      {
        date: '2025-03-10',
        odometer: null,
        category: 'repair',
        title: 'Pastillas delanteras',
        description: 'Discos revisados',
        workshop: 'Taller Paco',
        cost: 180.5,
        includeInReport: true,
      },
    ]);
  });

  it('shows the odometer conflict on the km field and keeps the dialog open on 409', async () => {
    const { user } = setup(
      { 'PATCH /vehicles/v1/maintenance/r1': problem(409, { detail: 'The odometer cannot go backwards' }) },
      { record },
    );

    await user.clear(screen.getByLabelText(label.odometer));
    await user.type(screen.getByLabelText(label.odometer), '10.000');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('maintenance.errors.odometerConflict'));
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the future-date error on the date field on a 400 without errors', async () => {
    const { user } = setup({
      'POST /vehicles/v1/maintenance': problem(400, {
        detail: 'The maintenance date cannot be in the future',
      }),
    });

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('maintenance.errors.future'));
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the generic error when saving fails for another reason', async () => {
    const { user } = setup({ 'POST /vehicles/v1/maintenance': problem(500) });

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('common.error'));
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('invalidates the vehicle queries after saving', async () => {
    const fetchMock = mockApi({
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'POST /vehicles/v1/maintenance': { status: 201, body: record },
    });
    const rendered = renderWithProviders(<Harness />);
    const { user, queryClient } = rendered;
    queryClient.setQueryData(queryKeys.vehicles.detail('v1'), { id: 'v1' });
    queryClient.setQueryData(queryKeys.vehicles.maintenance('v1'), []);

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Mantenimiento añadido')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/maintenance')).toHaveLength(1);
    expect(queryClient.getQueryState(queryKeys.vehicles.detail('v1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.vehicles.maintenance('v1'))?.isInvalidated).toBe(true);
  });

  describe('invoices when creating', () => {
    it('lets the user choose several invoices when creating', async () => {
      const { user } = setup({});

      expect(invoiceInput()).toHaveAttribute('type', 'file');
      expect(invoiceInput()).toHaveAttribute('multiple');
      expect(invoiceInput()).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png,image/webp');
      expect(screen.getByRole('button', { name: 'Añadir facturas' })).toBeEnabled();
      expect(await screen.findByText(helpText)).toBeInTheDocument();

      await user.upload(invoiceInput(), [pdfFile('a.pdf'), pdfFile('b.pdf')]);

      const chosen = screen.getAllByRole('button', { name: /^Quitar/ });
      expect(chosen.map((button) => button.getAttribute('aria-label'))).toEqual([
        'Quitar «a.pdf»',
        'Quitar «b.pdf»',
      ]);
      expect(screen.getByText('a.pdf')).toBeInTheDocument();
      expect(screen.getByText('b.pdf')).toBeInTheDocument();
    });

    it('removes a chosen invoice before saving', async () => {
      const { user, fetchMock } = setup({
        'POST /vehicles/v1/maintenance': { status: 201, body: created },
        [`POST ${ATTACHMENTS}`]: { status: 201, body: attachmentBody('b.pdf') },
      });

      await user.type(screen.getByLabelText(label.title), 'ITV');
      await user.upload(invoiceInput(), [pdfFile('a.pdf'), pdfFile('b.pdf')]);
      await user.click(screen.getByRole('button', { name: 'Quitar «a.pdf»' }));
      expect(screen.queryByText('a.pdf')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('1 factura subida')).toBeInTheDocument();
      expect(uploadedNames(fetchMock, ATTACHMENTS)).toEqual(['b.pdf']);
    });

    it('uploads the chosen invoices after creating the record', async () => {
      const { user, fetchMock } = setup({
        'POST /vehicles/v1/maintenance': { status: 201, body: created },
        [`POST ${ATTACHMENTS}`]: { status: 201, body: attachmentBody('a.pdf') },
      });

      await user.type(screen.getByLabelText(label.title), 'ITV');
      await user.upload(invoiceInput(), [pdfFile('a.pdf'), pdfFile('b.pdf')]);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('Mantenimiento añadido')).toBeInTheDocument();
      expect(await screen.findByText('2 facturas subidas')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(requests(fetchMock, 'POST', '/vehicles/v1/maintenance')).toHaveLength(1);
      expect(uploadedNames(fetchMock, ATTACHMENTS)).toEqual(['a.pdf', 'b.pdf']);
      // The record is created before any invoice is sent.
      const order = fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`);
      expect(order.indexOf('POST /api/vehicles/v1/maintenance')).toBeLessThan(
        order.indexOf(`POST /api${ATTACHMENTS}`),
      );
    });

    it('does not upload invoices when the creation fails', async () => {
      const { user, fetchMock } = setup({
        'POST /vehicles/v1/maintenance': problem(409, { detail: 'The odometer cannot go backwards' }),
        [`POST ${ATTACHMENTS}`]: { status: 201, body: attachmentBody('a.pdf') },
      });

      await user.type(screen.getByLabelText(label.title), 'ITV');
      await user.type(screen.getByLabelText(label.odometer), '10');
      await user.upload(invoiceInput(), [pdfFile('a.pdf')]);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        i18n.t('maintenance.errors.odometerConflict'),
      );
      expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/attachments'))).toHaveLength(0);
      expect(screen.getByText('a.pdf')).toBeInTheDocument();
    });

    it('keeps the record and points to the attachments dialog when an invoice fails', async () => {
      let count = 0;
      const { user, fetchMock } = setup({
        'POST /vehicles/v1/maintenance': { status: 201, body: created },
        [`POST ${ATTACHMENTS}`]: () =>
          count++ === 0 ? problem(415) : { status: 201, body: attachmentBody('b.pdf') },
      });

      await user.type(screen.getByLabelText(label.title), 'ITV');
      await user.upload(invoiceInput(), [pdfFile('a.pdf'), pdfFile('b.pdf')]);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(
        await screen.findByText('«a.pdf» no es un tipo admitido: solo PDF, JPG, PNG o WebP.'),
      ).toBeInTheDocument();
      expect(await screen.findByText('1 factura subida')).toBeInTheDocument();
      expect(await screen.findByText(i18n.t('maintenance.attachments.retryHint'))).toBeInTheDocument();
      expect(screen.getByText('Mantenimiento añadido')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(uploadedNames(fetchMock, ATTACHMENTS)).toEqual(['a.pdf', 'b.pdf']);
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    });

    it('rejects invoices over the limit when choosing them', async () => {
      const { user, fetchMock } = setup({
        'POST /vehicles/v1/maintenance': { status: 201, body: created },
      });

      await screen.findByText(helpText);
      await user.type(screen.getByLabelText(label.title), 'ITV');
      await user.upload(invoiceInput(), [pdfFile('grande.pdf', 1024 * 1024 + 1)]);

      expect(await screen.findByText('«grande.pdf» supera el tamaño máximo de 1 MB.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Quitar «grande.pdf»' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('Mantenimiento añadido')).toBeInTheDocument();
      expect(callsTo(fetchMock, 'POST', ATTACHMENTS)).toHaveLength(0);
    });

    it('disables save while the invoices upload', async () => {
      let release: (response: MockResponse) => void = () => {};
      const { user } = setup({
        'POST /vehicles/v1/maintenance': { status: 201, body: created },
        [`POST ${ATTACHMENTS}`]: () => new Promise((resolve) => (release = resolve)),
      });

      await user.type(screen.getByLabelText(label.title), 'ITV');
      await user.upload(invoiceInput(), [pdfFile('a.pdf')]);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByRole('button', { name: 'Subiendo facturas…' })).toBeDisabled();
      // Closing is ignored until the batch ends, so its toasts are not lost.
      await user.keyboard('{Escape}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      release({ status: 201, body: attachmentBody('a.pdf') });

      expect(await screen.findByText('1 factura subida')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not offer invoices when editing', () => {
      setup({}, { record });

      expect(screen.queryByLabelText('Elegir facturas')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Añadir facturas' })).not.toBeInTheDocument();
      expect(screen.queryByText('Facturas')).not.toBeInTheDocument();
    });
  });
});
