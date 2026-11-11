import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getNotificationPermission,
  requestNotificationPermission,
  showNotifications,
} from './native-notifications';

const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: plugin }));

afterEach(() => {
  plugin.checkPermissions.mockReset();
  plugin.requestPermissions.mockReset();
  plugin.schedule.mockReset();
});

describe('native notifications', () => {
  it('maps the plugin permission states', async () => {
    const cases = [
      ['granted', 'granted'],
      ['denied', 'denied'],
      ['prompt', 'prompt'],
      ['prompt-with-rationale', 'prompt'],
    ] as const;
    for (const [display, expected] of cases) {
      plugin.checkPermissions.mockResolvedValueOnce({ display });
      await expect(getNotificationPermission()).resolves.toBe(expected);
    }
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('requests the permission', async () => {
    plugin.requestPermissions.mockResolvedValueOnce({ display: 'granted' });
    await expect(requestNotificationPermission()).resolves.toBe('granted');

    plugin.requestPermissions.mockResolvedValueOnce({ display: 'prompt-with-rationale' });
    await expect(requestNotificationPermission()).resolves.toBe('prompt');

    plugin.requestPermissions.mockRejectedValueOnce(new Error('Plugin not implemented'));
    await expect(requestNotificationPermission()).rejects.toThrow('Plugin not implemented');
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(3);
  });

  it('shows immediate, inexact notifications with title and body', async () => {
    plugin.schedule.mockResolvedValue({ notifications: [{ id: 1 }, { id: 2 }] });

    await showNotifications([
      { id: 1, title: 'Mantenimiento próximo', body: 'Cambio de aceite · Renault Clio' },
      { id: 2, title: 'Registra los km', body: '' },
    ]);

    expect(plugin.schedule).toHaveBeenCalledExactlyOnceWith({
      notifications: [
        {
          id: 1,
          title: 'Mantenimiento próximo',
          body: 'Cambio de aceite · Renault Clio',
          isExactNotification: false,
        },
        { id: 2, title: 'Registra los km', body: '', isExactNotification: false },
      ],
    });
    // No `schedule` field: delivered now, nothing left for later.
    for (const item of plugin.schedule.mock.calls[0]?.[0].notifications ?? []) {
      expect(item).not.toHaveProperty('schedule');
    }

    // Nothing to show: no call at all.
    await showNotifications([]);
    expect(plugin.schedule).toHaveBeenCalledTimes(1);

    plugin.schedule.mockRejectedValue(new Error('Notifications disabled'));
    await expect(showNotifications([{ id: 3, title: 't', body: 'b' }])).rejects.toThrow(
      'Notifications disabled',
    );
  });
});
