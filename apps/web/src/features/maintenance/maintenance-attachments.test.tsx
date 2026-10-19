import type { Attachment } from '@ikrive/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { type MockResponse, type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { MaintenanceAttachmentsDialog } from './maintenance-attachments';

const BASE = '/vehicles/v1/maintenance/r1/attachments';

const attachment = (overrides: Partial<Attachment>): Attachment => ({
  id: 'a1',
  originalName: 'ticket.jpg',
  mimeType: 'image/jpeg',
  size: 1000,
  sha256: 'a'.repeat(64),
  url: `/api${BASE}/a1`,
  thumbnailUrl: `/api${BASE}/a1/thumbnail`,
  createdAt: '2025-03-10T10:00:00.000Z',
  ...overrides,
});

const image = attachment({});
const pdf = attachment({
  id: 'a2',
  originalName: 'factura.pdf',
  mimeType: 'application/pdf',
  url: `/api${BASE}/a2`,
  thumbnailUrl: null,
});

const problem = (status: number): MockResponse => ({
  status,
  body: { type: 'about:blank', title: 'Error', status },
});

const pdfFile = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });

/** Owns the `open` state like the timeline does. */
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <MaintenanceAttachmentsDialog
        vehicleId="v1"
        record={{ id: 'r1', title: 'Cambio de aceite' }}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function setup(routes: MockRoutes) {
  const fetchMock = mockApi({ 'GET /config': { body: { maxUploadMb: 1 } }, ...routes });
  return { fetchMock, ...renderWithProviders(<Harness />) };
}

const calls = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );

/** Names of the files sent with `POST path`, in order (multipart bodies, one `file` each). */
const uploadedNames = (fetchMock: Mock<typeof fetch>, path = BASE) =>
  calls(fetchMock, 'POST', path).map(([, init]) => {
    const body = init?.body;
    if (!(body instanceof FormData)) throw new Error(`Expected a multipart body for POST ${path}`);
    return (body.get('file') as File).name;
  });

const fileInput = () => screen.getByLabelText('Elegir facturas');
const helpText = 'PDF, JPG, PNG o WebP · máx. 1 MB';

describe('MaintenanceAttachmentsDialog', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('lists images with their thumbnail and PDFs with an icon, all linking to the original', async () => {
    setup({ [`GET ${BASE}`]: { body: [image, pdf] } });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Facturas' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Cambio de aceite');

    const thumbnail = await screen.findByRole('img', { name: 'ticket.jpg' });
    expect(thumbnail).toHaveAttribute('src', `/api${BASE}/a1/thumbnail`);
    expect(thumbnail.closest('a')).toHaveAttribute('href', `/api${BASE}/a1`);
    expect(screen.getByText('ticket.jpg').closest('a')).toHaveAttribute('href', `/api${BASE}/a1`);

    const pdfName = screen.getByText('factura.pdf');
    expect(pdfName.closest('a')).toHaveAttribute('href', `/api${BASE}/a2`);
    const pdfCard = pdfName.closest('li') as HTMLElement;
    expect(within(pdfCard).queryByRole('img')).not.toBeInTheDocument();
    expect(pdfCard.querySelector('svg')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('shows the empty message when the record has no attachments', async () => {
    setup({ [`GET ${BASE}`]: { body: [] } });

    expect(await screen.findByText('Este mantenimiento todavía no tiene facturas.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows the loading message and then the error when the list fails', async () => {
    let release: (response: MockResponse) => void = () => {};
    setup({ [`GET ${BASE}`]: () => new Promise((resolve) => (release = resolve)) });

    expect(await screen.findByText('Cargando…')).toBeInTheDocument();
    release(problem(500));

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo ha ido mal');
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('offers a multiple file picker limited to the attachment types', async () => {
    setup({ [`GET ${BASE}`]: { body: [] } });

    await screen.findByText('Este mantenimiento todavía no tiene facturas.');
    expect(fileInput()).toHaveAttribute('type', 'file');
    expect(fileInput()).toHaveAttribute('multiple');
    expect(fileInput()).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png,image/webp');
    expect(screen.getByRole('button', { name: 'Subir facturas' })).toBeEnabled();
  });

  it('shows the accepted types and the upload limit next to the picker', async () => {
    setup({ [`GET ${BASE}`]: { body: [] } });

    expect(await screen.findByText(helpText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir facturas' })).toHaveAccessibleDescription(helpText);
  });

  it('uploads several files one request each and refreshes the list', async () => {
    let list: Attachment[] = [];
    const { user, fetchMock } = setup({
      [`GET ${BASE}`]: () => ({ body: list }),
      [`POST ${BASE}`]: () => {
        const added = attachment({
          id: `n${list.length}`,
          originalName: `subida-${list.length}.pdf`,
          thumbnailUrl: null,
        });
        list = [...list, added];
        return { status: 201, body: added };
      },
    });

    await screen.findByText(helpText);
    await user.upload(fileInput(), [pdfFile('a.pdf'), pdfFile('b.pdf')]);

    expect(await screen.findByText('2 facturas subidas')).toBeInTheDocument();
    expect(uploadedNames(fetchMock)).toEqual(['a.pdf', 'b.pdf']);
    expect(await screen.findByText('subida-1.pdf')).toBeInTheDocument();
    expect(screen.getByText('subida-0.pdf')).toBeInTheDocument();
    expect(calls(fetchMock, 'GET', BASE).length).toBeGreaterThan(1);
  });

  it('disables the upload button while an upload is in progress', async () => {
    let release: (response: MockResponse) => void = () => {};
    const { user } = setup({
      [`GET ${BASE}`]: { body: [] },
      [`POST ${BASE}`]: () => new Promise((resolve) => (release = resolve)),
    });

    await screen.findByText(helpText);
    await user.upload(fileInput(), [pdfFile('a.pdf')]);

    expect(await screen.findByRole('button', { name: 'Subiendo…' })).toBeDisabled();
    release({ status: 201, body: pdf });

    expect(await screen.findByRole('button', { name: 'Subir facturas' })).toBeEnabled();
    expect(await screen.findByText('1 factura subida')).toBeInTheDocument();
  });

  it('rejects files over the limit without uploading them', async () => {
    const { user, fetchMock } = setup({
      [`GET ${BASE}`]: { body: [] },
      [`POST ${BASE}`]: { status: 201, body: pdf },
    });

    await screen.findByText(helpText);
    await user.upload(fileInput(), [pdfFile('grande.pdf', 1024 * 1024 + 1), pdfFile('small.pdf')]);

    expect(await screen.findByText('«grande.pdf» supera el tamaño máximo de 1 MB.')).toBeInTheDocument();
    expect(await screen.findByText('1 factura subida')).toBeInTheDocument();
    expect(uploadedNames(fetchMock)).toEqual(['small.pdf']);
  });

  it('shows the unsupported type error with the file name and keeps uploading the rest', async () => {
    let count = 0;
    const { user, fetchMock } = setup({
      [`GET ${BASE}`]: { body: [] },
      [`POST ${BASE}`]: () => (count++ === 0 ? problem(415) : { status: 201, body: pdf }),
    });

    await screen.findByText(helpText);
    await user.upload(fileInput(), [pdfFile('a.pdf'), pdfFile('b.pdf')]);

    expect(
      await screen.findByText('«a.pdf» no es un tipo admitido: solo PDF, JPG, PNG o WebP.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('1 factura subida')).toBeInTheDocument();
    expect(uploadedNames(fetchMock)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('shows the size error with the file name and the limit when the API answers 413', async () => {
    const { user } = setup({ [`GET ${BASE}`]: { body: [] }, [`POST ${BASE}`]: problem(413) });

    await screen.findByText(helpText);
    await user.upload(fileInput(), [pdfFile('a.pdf')]);

    expect(await screen.findByText('«a.pdf» supera el tamaño máximo de 1 MB.')).toBeInTheDocument();
    expect(screen.queryByText(/factura subida/)).not.toBeInTheDocument();
  });

  it('shows the size error without the limit when the config is unavailable', async () => {
    const { user, fetchMock } = setup({
      'GET /config': problem(500),
      [`GET ${BASE}`]: { body: [] },
      [`POST ${BASE}`]: problem(413),
    });

    await screen.findByText('Este mantenimiento todavía no tiene facturas.');
    await waitFor(() => expect(calls(fetchMock, 'GET', '/config')).toHaveLength(1));
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();
    await user.upload(fileInput(), [pdfFile('a.pdf')]);

    expect(await screen.findByText('«a.pdf» supera el tamaño máximo permitido.')).toBeInTheDocument();
    expect(uploadedNames(fetchMock)).toEqual(['a.pdf']);
  });

  it('shows the generic error when an upload fails for another reason', async () => {
    const { user } = setup({ [`GET ${BASE}`]: { body: [] }, [`POST ${BASE}`]: problem(500) });

    await screen.findByText(helpText);
    await user.upload(fileInput(), [pdfFile('a.pdf')]);

    expect(await screen.findByText('Algo ha ido mal')).toBeInTheDocument();
    expect(screen.queryByText(/factura subida/)).not.toBeInTheDocument();
  });

  it('deletes an attachment only after confirming', async () => {
    let list = [image, pdf];
    const { user, fetchMock } = setup({
      [`GET ${BASE}`]: () => ({ body: list }),
      [`DELETE ${BASE}/a2`]: () => {
        list = [image];
        return { status: 204 };
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Eliminar «factura.pdf»' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent('¿Eliminar «factura.pdf»?');
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', `${BASE}/a2`)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Eliminar «factura.pdf»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Factura eliminada')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', `${BASE}/a2`)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('factura.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('ticket.jpg')).toBeInTheDocument();
    expect(calls(fetchMock, 'GET', BASE)).toHaveLength(2);
  });

  it('shows the generic error when deleting fails', async () => {
    const { user, fetchMock } = setup({
      [`GET ${BASE}`]: { body: [pdf] },
      [`DELETE ${BASE}/a2`]: problem(500),
    });

    await user.click(await screen.findByRole('button', { name: 'Eliminar «factura.pdf»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Algo ha ido mal')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', `${BASE}/a2`)).toHaveLength(1);
    expect(screen.getByText('factura.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Factura eliminada')).not.toBeInTheDocument();
  });
});
