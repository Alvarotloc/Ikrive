import { DEFAULT_USER_SETTINGS, type ReportShare, type Vehicle } from '@ikrive/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { type MockResponse, type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { SaleReportDialog } from './sale-report-dialog';

const car: Pick<Vehicle, 'id' | 'name' | 'make' | 'model' | 'plate' | 'vin'> = {
  id: 'v1',
  name: 'Señor Clio',
  make: 'Renault',
  model: 'Clio',
  plate: '1234 ABC',
  vin: 'VF1RFB00X12345678',
};

const SHARES = '/vehicles/v1/report-shares';
const URL_1 = `http://localhost:3000/api/public/reports/${'a'.repeat(43)}`;
const problem = { type: 'about:blank', title: 'Internal Server Error', status: 500 };

const share = (overrides: Partial<ReportShare> = {}): ReportShare => ({
  id: 's1',
  hidePrices: false,
  hidePlate: false,
  hideVin: false,
  includeInvoices: false,
  // 11:00 in Europe/Madrid, the default time zone.
  expiresAt: '2026-12-02T10:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  status: 'active',
  ...overrides,
});

const localWarning = /el enlace no se podrá abrir desde fuera de tu red/;
const reachabilityHelp =
  /Solo funciona si este servidor es accesible desde internet; si no lo es, descarga el PDF/;
const oneTimeHint = 'Cópialo ahora: por seguridad no se podrá volver a ver cuando cierres este diálogo.';

/** The list answers with each body in turn (the last one repeats). */
const listRoute = (...bodies: ReportShare[][]) => {
  let call = 0;
  return () => ({ body: bodies[Math.min(call++, bodies.length - 1)] });
};

function setup(routes: MockRoutes = {}) {
  const fetchMock = mockApi({
    'GET /config': { body: { maxUploadMb: 1, localBaseUrl: false } },
    'GET /settings': { body: DEFAULT_USER_SETTINGS },
    [`GET ${SHARES}`]: { body: [] },
    ...routes,
  });
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <SaleReportDialog vehicle={car} />
    </>,
  );
  return { fetchMock, ...rendered };
}

const open = async (user: ReturnType<typeof setup>['user']) => {
  await user.click(screen.getByRole('button', { name: 'Informe de venta' }));
  return screen.findByRole('dialog', { name: 'Informe de venta' });
};

const calls = (fetchMock: Mock<typeof fetch>, method: string, path = SHARES) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );

/** The list item that contains `target` (an element or its text). */
const row = (target: HTMLElement | string) => {
  const item = (typeof target === 'string' ? screen.getByText(target) : target).closest('li');
  if (!item) throw new Error('The element is not inside a list item');
  return item;
};

describe('ReportSharesSection', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  describe('creating a link', () => {
    it('offers a 30-day link by default with 7 and 90 days', async () => {
      const { user } = setup();
      await open(user);

      expect(screen.getByRole('heading', { name: 'Compartir con un enlace' })).toBeInTheDocument();
      expect(screen.getByText(reachabilityHelp)).toBeInTheDocument();
      const expiry = screen.getByRole('combobox', { name: 'Caducidad' });
      expect(
        within(expiry)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['7 días', '30 días', '90 días']);
      expect(expiry).toHaveValue('30');
      expect(screen.getByRole('button', { name: 'Crear enlace' })).toBeEnabled();
    });

    it('creates a link with the checked options and lets the user copy it', async () => {
      let body: unknown;
      const { user, fetchMock } = setup({
        [`POST ${SHARES}`]: async (request) => {
          body = await request.json();
          return { status: 201, body: { ...share({ hidePrices: true, includeInvoices: true }), url: URL_1 } };
        },
      });
      // `user-event` installs its own clipboard on `navigator`: spy on it.
      const writeText = vi.spyOn(navigator.clipboard, 'writeText');
      await open(user);

      await user.click(screen.getByRole('checkbox', { name: 'Ocultar precios' }));
      await user.click(screen.getByRole('checkbox', { name: /Incluir facturas/ }));
      await user.selectOptions(screen.getByRole('combobox', { name: 'Caducidad' }), '7 días');
      await user.click(screen.getByRole('button', { name: 'Crear enlace' }));

      const field = await screen.findByRole('textbox', { name: 'Enlace público' });
      expect(field).toHaveValue(URL_1);
      expect(field).toHaveAttribute('readonly');
      expect(field).toHaveAccessibleDescription(oneTimeHint);
      expect(calls(fetchMock, 'POST')).toHaveLength(1);
      expect(body).toEqual({
        hidePrices: true,
        hidePlate: false,
        hideVin: false,
        includeInvoices: true,
        expiresInDays: 7,
      });
      // Creating a link is not the report download: the dialog stays open and no PDF is requested.
      expect(screen.getByRole('dialog', { name: 'Informe de venta' })).toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/report.pdf'))).toBe(false);

      await user.click(screen.getByRole('button', { name: 'Copiar' }));

      expect(writeText).toHaveBeenCalledWith(URL_1);
      expect(await screen.findByText('Enlace copiado')).toBeInTheDocument();
    });

    it('disables the create button while the link is being created', async () => {
      let respond: (response: MockResponse) => void = () => {};
      const { user } = setup({
        [`POST ${SHARES}`]: () => new Promise<MockResponse>((resolve) => (respond = resolve)),
      });
      await open(user);

      await user.click(screen.getByRole('button', { name: 'Crear enlace' }));

      const pending = await screen.findByRole('button', { name: 'Creando…' });
      expect(pending).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Crear enlace' })).not.toBeInTheDocument();

      respond({ status: 201, body: { ...share(), url: URL_1 } });

      expect(await screen.findByRole('textbox', { name: 'Enlace público' })).toHaveValue(URL_1);
      expect(screen.getByRole('button', { name: 'Crear enlace' })).toBeEnabled();
    });

    it('shows an error toast when creating the link fails', async () => {
      const { user } = setup({ [`POST ${SHARES}`]: { status: 500, body: problem } });
      await open(user);

      await user.click(screen.getByRole('button', { name: 'Crear enlace' }));

      expect(
        await screen.findByText('No se ha podido crear el enlace. Inténtalo de nuevo.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Informe de venta' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Enlace público' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Crear enlace' })).toBeEnabled();
    });
  });

  describe('local BASE_URL', () => {
    it('warns that a local BASE_URL is not reachable from outside', async () => {
      const { user } = setup({ 'GET /config': { body: { maxUploadMb: 1, localBaseUrl: true } } });
      await open(user);

      expect(await screen.findByText(localWarning)).toBeInTheDocument();
    });

    it('does not warn with a public BASE_URL', async () => {
      const { user, fetchMock } = setup();
      await open(user);

      await waitFor(() => expect(calls(fetchMock, 'GET', '/config')).toHaveLength(1));
      await screen.findByText('Todavía no has creado ningún enlace para este vehículo.');
      expect(screen.queryByText(localWarning)).not.toBeInTheDocument();
      expect(screen.getByText(reachabilityHelp)).toBeInTheDocument();
    });
  });

  describe('listing links', () => {
    it('lists the links with their options, expiry and status', async () => {
      const { user } = setup({
        [`GET ${SHARES}`]: {
          body: [
            share({ id: 's1', hidePrices: true, includeInvoices: true }),
            share({ id: 's2', status: 'expired', expiresAt: '2026-10-01T10:00:00.000Z' }),
            share({
              id: 's3',
              hidePlate: true,
              hideVin: true,
              status: 'revoked',
              revokedAt: '2026-10-20T10:00:00.000Z',
            }),
          ],
        },
      });
      await open(user);

      const active = row(await screen.findByText('Activo'));
      expect(active).toHaveTextContent('Caduca el 2 dic 2026, 11:00');
      expect(within(active).getByText('Sin precios')).toBeInTheDocument();
      expect(within(active).getByText('Con facturas')).toBeInTheDocument();
      expect(within(active).queryByText('Sin matrícula')).not.toBeInTheDocument();
      expect(within(active).getByRole('button', { name: 'Revocar' })).toBeInTheDocument();

      const expired = row('Caducado');
      expect(expired).toHaveTextContent('Caduca el 1 oct 2026, 12:00');
      expect(within(expired).getByText('Informe completo')).toBeInTheDocument();
      expect(within(expired).queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument();

      const revoked = row('Revocado');
      expect(within(revoked).getByText('Sin matrícula')).toBeInTheDocument();
      expect(within(revoked).getByText('Sin VIN')).toBeInTheDocument();
      expect(within(revoked).queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument();

      expect(screen.getAllByRole('button', { name: 'Revocar' })).toHaveLength(1);
    });

    it('shows an empty state without links', async () => {
      const { user } = setup();
      await open(user);

      expect(
        await screen.findByText('Todavía no has creado ningún enlace para este vehículo.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('shows an error when the links cannot be loaded', async () => {
      const { user } = setup({ [`GET ${SHARES}`]: { status: 500, body: problem } });
      await open(user);

      expect(await screen.findByText('No se han podido cargar los enlaces.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Descargar' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Crear enlace' })).toBeEnabled();
    });

    it('refreshes the list after creating a link', async () => {
      const created = share({ id: 's9', hideVin: true });
      const { user, fetchMock } = setup({
        [`GET ${SHARES}`]: listRoute([], [created]),
        [`POST ${SHARES}`]: { status: 201, body: { ...created, url: URL_1 } },
      });
      await open(user);
      await screen.findByText('Todavía no has creado ningún enlace para este vehículo.');

      await user.click(screen.getByRole('button', { name: 'Crear enlace' }));

      const fresh = row(await screen.findByText('Activo'));
      expect(within(fresh).getByText('Sin VIN')).toBeInTheDocument();
      expect(
        screen.queryByText('Todavía no has creado ningún enlace para este vehículo.'),
      ).not.toBeInTheDocument();
      expect(calls(fetchMock, 'GET')).toHaveLength(2);
    });
  });

  describe('revoking a link', () => {
    it('revokes an active link after confirming', async () => {
      const { user, fetchMock } = setup({
        [`GET ${SHARES}`]: listRoute(
          [share()],
          [share({ status: 'revoked', revokedAt: '2026-11-02T12:00:00.000Z' })],
        ),
        [`DELETE ${SHARES}/s1`]: { status: 204 },
      });
      await open(user);
      await user.click(await screen.findByRole('button', { name: 'Revocar' }));

      let confirm = await screen.findByRole('alertdialog', { name: '¿Revocar este enlace?' });
      expect(confirm).toHaveAccessibleDescription(
        'Quien lo tenga dejará de poder abrir el informe. No se puede deshacer.',
      );
      await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(calls(fetchMock, 'DELETE', `${SHARES}/s1`)).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'Revocar' }));
      confirm = await screen.findByRole('alertdialog', { name: '¿Revocar este enlace?' });
      await user.click(within(confirm).getByRole('button', { name: 'Revocar' }));

      expect(await screen.findByText('Revocado')).toBeInTheDocument();
      expect(screen.queryByText('Activo')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument();
      expect(calls(fetchMock, 'DELETE', `${SHARES}/s1`)).toHaveLength(1);
      expect(calls(fetchMock, 'GET')).toHaveLength(2);
      // Revoking does not close the report dialog.
      expect(screen.getByRole('dialog', { name: 'Informe de venta' })).toBeInTheDocument();
    });

    it('shows an error toast when revoking fails', async () => {
      const { user } = setup({
        [`GET ${SHARES}`]: { body: [share()] },
        [`DELETE ${SHARES}/s1`]: { status: 500, body: problem },
      });
      await open(user);
      await user.click(await screen.findByRole('button', { name: 'Revocar' }));
      const confirm = await screen.findByRole('alertdialog', { name: '¿Revocar este enlace?' });

      await user.click(within(confirm).getByRole('button', { name: 'Revocar' }));

      expect(
        await screen.findByText('No se ha podido revocar el enlace. Inténtalo de nuevo.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });
  });
});
