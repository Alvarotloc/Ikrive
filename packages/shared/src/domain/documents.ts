import type { DocumentStatus } from '../enums';
import { type NotificationDraft, vehicleName } from './reminders';
import { addDays } from './schedules';

/**
 * Status of a document on `today`: `expired` from the day after `expiryDate` (the last valid day),
 * `expiring` from `expiryDate - warnDays` (included), `valid` before that or without an expiry date.
 */
export function documentStatus(
  doc: { expiryDate: string | null; warnDays: number },
  today: string,
): DocumentStatus {
  if (doc.expiryDate === null) return 'valid';
  if (today > doc.expiryDate) return 'expired';
  if (today >= addDays(doc.expiryDate, -doc.warnDays)) return 'expiring';
  return 'valid';
}

/**
 * One key per document, status and expiry date: running again does not notify twice, becoming expired
 * after expiring does, and so does renewing (a new `expiryDate`). Editing the title or `warnDays` does not.
 */
export function documentDedupeKey(
  documentId: string,
  status: Exclude<DocumentStatus, 'valid'>,
  expiryDate: string,
): string {
  return `document:${documentId}:${status}:${expiryDate}`;
}

/**
 * Reminder of an expiring or expired document for `today`, with the vehicle's name (or make and
 * model) as body and a link to the vehicle; null when the document is valid or has no expiry date.
 */
export function documentReminderNotification(
  doc: { id: string; title: string; expiryDate: string | null; warnDays: number },
  vehicle: { id: string; name: string | null; make: string; model: string },
  today: string,
): NotificationDraft | null {
  const status = documentStatus(doc, today);
  if (status === 'valid' || doc.expiryDate === null) return null;
  return {
    vehicleId: vehicle.id,
    type: `document_${status}`,
    title: doc.title,
    body: vehicleName(vehicle),
    link: `/vehicles/${vehicle.id}`,
    dedupeKey: documentDedupeKey(doc.id, status, doc.expiryDate),
  };
}
