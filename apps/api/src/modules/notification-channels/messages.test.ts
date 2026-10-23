import { describe, expect, it } from 'vitest';
import type { NotificationRow } from '../notifications/repository';
import { testMessage, toChannelMessage } from './messages';

const row: NotificationRow = {
  id: 'n1',
  userId: 'u1',
  vehicleId: 'v1',
  type: 'schedule_overdue',
  title: 'Cambio de aceite',
  body: 'Mi coche',
  link: '/vehicles/v1',
  dedupeKey: 'k',
  readAt: null,
  createdAt: new Date('2026-10-23T08:00:00.000Z'),
};

describe('toChannelMessage', () => {
  it("composes the message in the owner's locale", () => {
    expect(toChannelMessage(row, 'es', 'https://ikrive.example.com')).toEqual({
      event: 'notification',
      type: 'schedule_overdue',
      title: 'Mantenimiento vencido: Cambio de aceite',
      body: 'Mi coche',
      link: 'https://ikrive.example.com/vehicles/v1',
      createdAt: '2026-10-23T08:00:00.000Z',
    });
    expect(
      toChannelMessage({ ...row, type: 'schedule_due_soon', body: null }, 'en', 'http://localhost:3000/'),
    ).toEqual({
      event: 'notification',
      type: 'schedule_due_soon',
      title: 'Maintenance due soon: Cambio de aceite',
      body: 'Cambio de aceite',
      link: 'http://localhost:3000/vehicles/v1',
      createdAt: '2026-10-23T08:00:00.000Z',
    });
    expect(toChannelMessage({ ...row, link: null }, 'es', 'http://localhost:3000').link).toBeNull();
  });
});

describe('testMessage', () => {
  it('builds the test message', () => {
    const now = new Date('2026-10-23T10:00:00.000Z');
    expect(testMessage('es', now)).toEqual({
      event: 'test',
      type: null,
      title: 'Ikrive: notificación de prueba',
      body: 'Si lees esto, el canal funciona.',
      link: null,
      createdAt: '2026-10-23T10:00:00.000Z',
    });
    expect(testMessage('en', now)).toMatchObject({ event: 'test', title: 'Ikrive: test notification' });
  });
});
