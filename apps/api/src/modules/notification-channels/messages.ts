import type { Locale, NotificationType } from '@ikrive/shared';
import type { NotificationRow } from '../notifications/repository';
import type { ChannelMessage } from './channels';

interface ChannelTexts {
  /** Same labels as the web (`notifications.types.*`). */
  types: Record<NotificationType, string>;
  test: { title: string; body: string };
}

/** `Record<Locale, …>`: a new locale or notification type does not compile until it is translated. */
const TEXTS: Record<Locale, ChannelTexts> = {
  es: {
    types: {
      schedule_due_soon: 'Mantenimiento próximo',
      schedule_overdue: 'Mantenimiento vencido',
      odometer_nudge: 'Registra los km',
      document_expiring: 'Documento a punto de caducar',
      document_expired: 'Documento caducado',
    },
    test: { title: 'Ikrive: notificación de prueba', body: 'Si lees esto, el canal funciona.' },
  },
  en: {
    types: {
      schedule_due_soon: 'Maintenance due soon',
      schedule_overdue: 'Maintenance overdue',
      odometer_nudge: 'Log your mileage',
      document_expiring: 'Document expiring soon',
      document_expired: 'Document expired',
    },
    test: { title: 'Ikrive: test notification', body: 'If you can read this, the channel works.' },
  },
};

/** «<type label>: <title>», the body (or the title when there is none) and an absolute link. */
export function toChannelMessage(row: NotificationRow, locale: Locale, baseUrl: string): ChannelMessage {
  return {
    event: 'notification',
    type: row.type,
    title: `${TEXTS[locale].types[row.type]}: ${row.title}`,
    body: row.body ?? row.title,
    link: row.link ? new URL(row.link, baseUrl).toString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function testMessage(locale: Locale, now = new Date()): ChannelMessage {
  return {
    event: 'test',
    type: null,
    ...TEXTS[locale].test,
    link: null,
    createdAt: now.toISOString(),
  };
}
