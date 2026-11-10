import { DEFAULT_USER_SETTINGS, type MaintenanceSchedule, scheduleCalendarEvent } from '@ikrive/shared';
import { screen, waitFor } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithProviders, setServerMode } from '@/test/render';
import { AddToCalendarMenu } from './add-to-calendar';

/**
 * The phone calendar: only `features/calendar/actions.ts` loads it, and only in the native app. `loaded`
 * turns true the first time it is imported (then it stays in the module cache: web tests go first).
 */
const nativeCalendar = vi.hoisted(() => ({ loaded: false, createDeviceEvent: vi.fn() }));
vi.mock('@/lib/native-calendar', () => {
  nativeCalendar.loaded = true;
  return { createDeviceEvent: nativeCalendar.createDeviceEvent };
});

const schedule = (overrides: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule => ({
  id: 's1',
  vehicleId: 'v1',
  title: 'Cambio de aceite',
  category: 'oil_change',
  intervalMonths: 12,
  intervalDistance: 15_000,
  warnDays: 30,
  warnDistance: 1000,
  lastDoneDate: '2025-03-10',
  lastDoneOdometer: 120_000,
  nextDueDate: '2026-03-10',
  nextDueDateEstimated: false,
  nextDueOdometer: 135_000,
  status: 'ok',
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
  ...overrides,
});

const vehicle = { id: 'v1', name: null, make: 'Renault', model: 'Clio' };

function setup(value = schedule()) {
  mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS } });
  return renderWithProviders(
    <>
      <Toaster />
      <AddToCalendarMenu schedule={value} vehicle={vehicle} />
    </>,
  );
}

const trigger = () => screen.getByRole('button', { name: 'Añadir «Cambio de aceite» al calendario' });

/** Decoded query parameters of a link. */
const paramsOf = (href: string | null) => Object.fromEntries(new URL(href ?? '').searchParams);

describe('AddToCalendarMenu', () => {
  afterEach(() => {
    // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
    toast.dismiss();
    vi.unstubAllEnvs();
    nativeCalendar.createDeviceEvent.mockReset();
  });

  it('web: offers Google, Outlook and .ics without loading the native calendar', async () => {
    const { user } = setup();
    expect(trigger()).not.toHaveAttribute('aria-disabled');

    await user.click(trigger());

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Google Calendar', 'Outlook', 'Descargar .ics']);
    expect(nativeCalendar.loaded).toBe(false);
  });

  it('links Google and Outlook in a new tab', async () => {
    const { user } = setup();
    await user.click(trigger());

    const google = await screen.findByRole('menuitem', { name: 'Google Calendar' });
    const outlook = screen.getByRole('menuitem', { name: 'Outlook' });
    for (const link of [google, outlook]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }

    const googleHref = google.getAttribute('href') ?? '';
    expect(new URL(googleHref).host).toBe('calendar.google.com');
    expect(paramsOf(googleHref)).toMatchObject({
      action: 'TEMPLATE',
      text: 'Cambio de aceite · Renault Clio',
      dates: '20260310/20260311',
    });
    expect(paramsOf(googleHref).details).toContain('Vence a los 135.000 km');
    expect(paramsOf(googleHref).details).toContain(`${window.location.origin}/vehicles/v1`);

    const outlookHref = outlook.getAttribute('href') ?? '';
    expect(new URL(outlookHref).host).toBe('outlook.live.com');
    expect(paramsOf(outlookHref)).toMatchObject({
      subject: 'Cambio de aceite · Renault Clio',
      startdt: '2026-03-10',
      enddt: '2026-03-11',
      allday: 'true',
    });
  });

  it('server mode: links the event to the server', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    const { user } = setup();
    await user.click(trigger());

    const google = await screen.findByRole('menuitem', { name: 'Google Calendar' });
    const details = paramsOf(google.getAttribute('href')).details;
    expect(details).toContain('https://ikrive.example.com/vehicles/v1');
    expect(details).not.toContain(window.location.origin);
  });

  it('downloads an .ics file', async () => {
    const blobs: Blob[] = [];
    // jsdom has no object URLs: replace the browser APIs, not the component.
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL(blob: Blob) {
          blobs.push(blob);
          return 'blob:ikrive/1';
        }
        static override revokeObjectURL() {}
      },
    );
    const downloads: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this);
    });
    const { user } = setup();

    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Descargar .ics' }));

    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe('text/calendar;charset=utf-8');
    const text = await blobs[0]?.text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('UID:schedule-s1@ikrive');
    expect(text).toContain('DTSTART;VALUE=DATE:20260310');
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.download).toBe('cambio-de-aceite-renault-clio.ics');
    expect(downloads[0]?.getAttribute('href')).toBe('blob:ikrive/1');
  });

  it('native: offers the phone calendar instead of the .ics', async () => {
    vi.stubEnv('MODE', 'native');
    setServerMode('https://ikrive.example.com', 'secret-token');
    const { user } = setup();

    await user.click(trigger());

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Google Calendar',
      'Outlook',
      'Calendario del teléfono',
    ]);
    expect(screen.queryByRole('menuitem', { name: 'Descargar .ics' })).not.toBeInTheDocument();
  });

  it('native: adds the schedule event to the phone calendar', async () => {
    vi.stubEnv('MODE', 'native');
    setServerMode('https://ikrive.example.com', 'secret-token');
    nativeCalendar.createDeviceEvent.mockResolvedValue(undefined);
    const downloads = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const { user } = setup();

    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Calendario del teléfono' }));

    await waitFor(() => expect(nativeCalendar.createDeviceEvent).toHaveBeenCalledTimes(1));
    const expected = scheduleCalendarEvent({
      schedule: schedule(),
      vehicle: { id: 'v1', name: 'Renault Clio' },
      baseUrl: 'https://ikrive.example.com',
      locale: 'es',
      distanceUnit: 'km',
    });
    expect(nativeCalendar.createDeviceEvent).toHaveBeenCalledWith(expected);
    expect(nativeCalendar.createDeviceEvent.mock.calls[0]?.[0]).toMatchObject({
      date: '2026-03-10',
      title: 'Cambio de aceite · Renault Clio',
      description: expect.stringContaining('https://ikrive.example.com/vehicles/v1'),
    });
    expect(downloads).not.toHaveBeenCalled();
    expect(screen.queryByText('No se ha podido abrir el calendario del teléfono')).not.toBeInTheDocument();
  });

  it('native: shows an error toast when the phone calendar fails', async () => {
    vi.stubEnv('MODE', 'native');
    setServerMode('https://ikrive.example.com', 'secret-token');
    nativeCalendar.createDeviceEvent.mockRejectedValue(new Error('No Activity found to handle Intent'));
    const { user } = setup();

    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Calendario del teléfono' }));

    expect(await screen.findByText('No se ha podido abrir el calendario del teléfono')).toBeInTheDocument();
  });

  it('explains why a schedule without date cannot be added', async () => {
    const { user } = setup(schedule({ nextDueDate: null }));
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');

    await user.click(trigger());

    expect(await screen.findByText(/no tiene fecha: solo vence por kilómetros/)).toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
});
