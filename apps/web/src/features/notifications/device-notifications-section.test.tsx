import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { DeviceNotificationsSection } from './device-notifications-section';

const native = vi.hoisted(() => ({
  getNotificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  showNotifications: vi.fn(),
}));
vi.mock('@/lib/native-notifications', () => native);

afterEach(() => {
  native.getNotificationPermission.mockReset();
  native.requestNotificationPermission.mockReset();
});

const allow = () => screen.queryByRole('button', { name: 'Permitir notificaciones' });

describe('DeviceNotificationsSection', () => {
  it('shows that phone notifications are on', async () => {
    native.getNotificationPermission.mockResolvedValue('granted');
    renderWithProviders(<DeviceNotificationsSection />);

    expect(screen.getByRole('heading', { name: 'Notificaciones del teléfono' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Comprobando el permiso…');
    expect(await screen.findByText(/^Activadas/)).toBeInTheDocument();
    expect(allow()).not.toBeInTheDocument();
    expect(native.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('asks for the permission from the button and shows the new state', async () => {
    native.getNotificationPermission.mockResolvedValue('prompt');
    native.requestNotificationPermission.mockResolvedValue('granted');
    const { user } = renderWithProviders(<DeviceNotificationsSection />);

    expect(await screen.findByText(/todavía no tiene permiso/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Permitir notificaciones' }));

    expect(await screen.findByText(/^Activadas/)).toBeInTheDocument();
    expect(native.requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(allow()).not.toBeInTheDocument();
    // Asked from settings: the first-launch prompt will not show up later.
    expect(localStorage.getItem('ikrive.notificationPermissionAsked')).not.toBeNull();
  });

  it('explains how to enable them in Android settings when denied', async () => {
    native.getNotificationPermission.mockResolvedValue('denied');
    renderWithProviders(<DeviceNotificationsSection />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ajustes › Aplicaciones › Ikrive › Notificaciones',
    );
    expect(allow()).not.toBeInTheDocument();
  });

  it('treats a failing plugin as denied', async () => {
    native.getNotificationPermission.mockRejectedValue(new Error('Plugin not implemented'));
    renderWithProviders(<DeviceNotificationsSection />);

    expect(await screen.findByText(/el permiso está denegado/)).toBeInTheDocument();
  });
});
