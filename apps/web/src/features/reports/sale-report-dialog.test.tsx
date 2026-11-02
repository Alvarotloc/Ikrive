import { saleReportFileName, type Vehicle } from '@ikrive/shared';
import { screen, waitFor } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { todayIso } from '@/lib/format';
import { type MockResponse, type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { SaleReportDialog } from './sale-report-dialog';

type ReportVehicle = Pick<Vehicle, 'id' | 'name' | 'make' | 'model' | 'plate' | 'vin'>;

const car: ReportVehicle = {
  id: 'v1',
  name: 'Señor Clio',
  make: 'Renault',
  model: 'Clio',
  plate: '1234 ABC',
  vin: 'VF1RFB00X12345678',
};

const REPORT = 'GET /vehicles/v1/report.pdf';
const pdf = () => new Blob(['%PDF-1.7'], { type: 'application/pdf' });
const ok: MockResponse = {
  body: pdf(),
  headers: {
    'content-disposition': `attachment; filename="ikrive-se_or-clio-2026-11-01.pdf"; filename*=UTF-8''ikrive-se%C3%B1or-clio-2026-11-01.pdf`,
  },
};

const label = {
  hidePrices: 'Ocultar precios',
  hidePlate: 'Ocultar matrícula',
  hideVin: 'Ocultar VIN',
  includeInvoices: /Incluir facturas/,
};
const freeTextWarning = /Solo se quitan los campos del vehículo y de los mantenimientos/;
const invoicesWarning = /Las facturas se anexan tal cual/;

function setup(routes: MockRoutes = {}, vehicle: Partial<ReportVehicle> = {}) {
  // The public links section of the dialog asks for the server config and the vehicle's links.
  const fetchMock = mockApi({
    'GET /config': { body: { maxUploadMb: 1, localBaseUrl: false } },
    'GET /vehicles/v1/report-shares': { body: [] },
    ...routes,
  });
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <SaleReportDialog vehicle={{ ...car, ...vehicle }} />
    </>,
  );
  return { fetchMock, ...rendered };
}

const open = async (user: ReturnType<typeof setup>['user']) => {
  await user.click(screen.getByRole('button', { name: 'Informe de venta' }));
  return screen.findByRole('dialog', { name: 'Informe de venta' });
};

/** Requests made to the report, as `/api/...` URLs with their query. */
const reportRequests = (fetchMock: Mock<typeof fetch>) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/report.pdf'));

/** jsdom has no object URLs: replace the browser APIs, not the component (as in `add-to-calendar.test.tsx`). */
function captureDownloads() {
  const blobs: Blob[] = [];
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL(blob: Blob) {
        blobs.push(blob);
        return 'blob:ikrive/report';
      }
      static override revokeObjectURL() {}
    },
  );
  const links: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    links.push(this);
  });
  return { blobs, links };
}

describe('SaleReportDialog', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('opens an accessible dialog with the report options', async () => {
    const { user, fetchMock } = setup();

    const dialog = await open(user);

    const boxes = [label.hidePrices, label.hidePlate, label.hideVin, label.includeInvoices].map((name) =>
      screen.getByRole('checkbox', { name }),
    );
    for (const box of boxes) expect(box).not.toBeChecked();

    // Focus is trapped: Tab from the last element («Descargar», below the public links) wraps to the
    // first one and Shift+Tab back.
    await screen.findByText('Todavía no has creado ningún enlace para este vehículo.');
    const download = screen.getByRole('button', { name: 'Descargar' });
    download.focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(boxes[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(download).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(reportRequests(fetchMock)).toEqual([]);
  });

  it('starts unchecked every time it opens', async () => {
    const { user } = setup();
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: label.hidePrices }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await open(user);

    expect(screen.getByRole('checkbox', { name: label.hidePrices })).not.toBeChecked();
  });

  it('hides the plate and VIN options when the vehicle has neither', async () => {
    const { user } = setup({}, { plate: null, vin: null });

    await open(user);

    expect(screen.getByRole('checkbox', { name: label.hidePrices })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: label.includeInvoices })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: label.hidePlate })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: label.hideVin })).not.toBeInTheDocument();
  });

  it('warns that free text is not redacted', async () => {
    const { user } = setup();
    const dialog = await open(user);
    expect(screen.queryByText(freeTextWarning)).not.toBeInTheDocument();
    // The live region exists (and is not hidden) before any warning, so its later content is announced.
    const region = dialog.querySelector('[aria-live="polite"]');
    expect(region).toBeInstanceOf(HTMLElement);
    expect(region).toBeEmptyDOMElement();
    expect(region).toBeVisible();
    expect(region?.className).not.toMatch(/\bempty:hidden\b/);

    for (const name of [label.hidePrices, label.hidePlate, label.hideVin]) {
      const box = screen.getByRole('checkbox', { name });
      await user.click(box);
      expect(screen.getByText(freeTextWarning)).toBeInTheDocument();
      expect(screen.getByText(freeTextWarning).closest('[aria-live="polite"]')).toBe(region);
      await user.click(box);
      expect(screen.queryByText(freeTextWarning)).not.toBeInTheDocument();
    }

    await user.click(screen.getByRole('checkbox', { name: label.includeInvoices }));
    expect(screen.queryByText(freeTextWarning)).not.toBeInTheDocument();
  });

  it('warns that invoices are appended as they are', async () => {
    const { user } = setup();
    await open(user);
    const hidePlate = screen.getByRole('checkbox', { name: label.hidePlate });
    const invoices = screen.getByRole('checkbox', { name: label.includeInvoices });

    await user.click(hidePlate);
    expect(screen.queryByText(invoicesWarning)).not.toBeInTheDocument();

    await user.click(invoices);
    expect(screen.getByText(invoicesWarning)).toBeInTheDocument();

    await user.click(hidePlate);
    expect(screen.queryByText(invoicesWarning)).not.toBeInTheDocument();
  });

  it('requests the report with the checked options and downloads it with the API file name', async () => {
    const { blobs, links } = captureDownloads();
    const { user, fetchMock } = setup({ [REPORT]: ok });
    await open(user);

    await user.click(screen.getByRole('checkbox', { name: label.hidePrices }));
    await user.click(screen.getByRole('checkbox', { name: label.hideVin }));
    await user.click(screen.getByRole('checkbox', { name: label.includeInvoices }));
    await user.click(screen.getByRole('button', { name: 'Descargar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(reportRequests(fetchMock)).toEqual([
      '/api/vehicles/v1/report.pdf?hidePrices=true&hideVin=true&includeInvoices=true',
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(links).toHaveLength(1);
    expect(links[0]?.download).toBe('ikrive-señor-clio-2026-11-01.pdf');
    expect(links[0]?.getAttribute('href')).toBe('blob:ikrive/report');
    expect(blobs).toHaveLength(1);
    expect(await blobs[0]?.text()).toBe('%PDF-1.7');
  });

  it('falls back to the shared file name without Content-Disposition', async () => {
    const { links } = captureDownloads();
    const { user } = setup({ [REPORT]: { body: pdf() } });
    await open(user);

    await user.click(screen.getByRole('button', { name: 'Descargar' }));

    await waitFor(() => expect(links).toHaveLength(1));
    expect(links[0]?.download).toBe(saleReportFileName('Señor Clio', todayIso()));
  });

  it('disables the download button while the report is generating', async () => {
    const { links } = captureDownloads();
    let respond: (response: MockResponse) => void = () => {};
    const { user } = setup({ [REPORT]: () => new Promise<MockResponse>((resolve) => (respond = resolve)) });
    await open(user);

    await user.click(screen.getByRole('button', { name: 'Descargar' }));

    const pending = await screen.findByRole('button', { name: 'Generando…' });
    expect(pending).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Descargar' })).not.toBeInTheDocument();

    respond(ok);

    await waitFor(() => expect(links).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows an error toast and keeps the dialog open when the API fails', async () => {
    const { links } = captureDownloads();
    const { user } = setup({
      [REPORT]: { status: 500, body: { type: 'about:blank', title: 'Internal Server Error', status: 500 } },
    });
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: label.hidePrices }));
    await user.click(screen.getByRole('checkbox', { name: label.includeInvoices }));

    await user.click(screen.getByRole('button', { name: 'Descargar' }));

    expect(
      await screen.findByText('No se ha podido generar el informe. Inténtalo de nuevo en unos segundos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Informe de venta' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: label.hidePrices })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: label.includeInvoices })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeEnabled();
    expect(links).toEqual([]);
  });

  it('shows the error toast even if the dialog was closed while generating', async () => {
    const { links } = captureDownloads();
    let respond: (response: MockResponse) => void = () => {};
    const { user } = setup({ [REPORT]: () => new Promise<MockResponse>((resolve) => (respond = resolve)) });
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Descargar' }));
    await screen.findByRole('button', { name: 'Generando…' });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    respond({ status: 500, body: { type: 'about:blank', title: 'Internal Server Error', status: 500 } });

    expect(
      await screen.findByText('No se ha podido generar el informe. Inténtalo de nuevo en unos segundos.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(links).toEqual([]);
  });
});
