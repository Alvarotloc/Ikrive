import { describe, expect, it } from 'vitest';
import { documentDedupeKey, documentReminderNotification, documentStatus } from './documents';

describe('documentStatus', () => {
  it('computes valid, expiring and expired at the boundaries', () => {
    const doc = { expiryDate: '2026-06-30', warnDays: 30 };
    expect(documentStatus({ expiryDate: null, warnDays: 30 }, '2099-01-01')).toBe('valid');
    expect(documentStatus(doc, '2026-05-30')).toBe('valid');
    expect(documentStatus(doc, '2026-05-31')).toBe('expiring');
    expect(documentStatus(doc, '2026-06-30')).toBe('expiring');
    expect(documentStatus(doc, '2026-07-01')).toBe('expired');
    expect(documentStatus({ expiryDate: '2026-06-30', warnDays: 0 }, '2026-06-29')).toBe('valid');
    expect(documentStatus({ expiryDate: '2026-06-30', warnDays: 0 }, '2026-06-30')).toBe('expiring');
    expect(documentStatus({ expiryDate: '2026-06-30', warnDays: 0 }, '2026-07-01')).toBe('expired');
  });
});

const vehicle = { id: 'v1', name: null, make: 'Seat', model: 'Ibiza' };
const doc = { id: 'd1', title: 'Seguro', expiryDate: '2026-06-30', warnDays: 30 };

describe('documentReminderNotification', () => {
  it('builds an expiring and an expired reminder', () => {
    expect(documentReminderNotification(doc, vehicle, '2026-06-10')).toEqual({
      vehicleId: 'v1',
      type: 'document_expiring',
      title: 'Seguro',
      body: 'Seat Ibiza',
      link: '/vehicles/v1',
      dedupeKey: 'document:d1:expiring:2026-06-30',
    });
    expect(documentReminderNotification(doc, { ...vehicle, name: 'Coche' }, '2026-07-01')).toEqual({
      vehicleId: 'v1',
      type: 'document_expired',
      title: 'Seguro',
      body: 'Coche',
      link: '/vehicles/v1',
      dedupeKey: 'document:d1:expired:2026-06-30',
    });
  });

  it('returns no reminder for a valid or undated document', () => {
    expect(documentReminderNotification(doc, vehicle, '2026-05-01')).toBeNull();
    expect(documentReminderNotification({ ...doc, expiryDate: null }, vehicle, '2026-07-01')).toBeNull();
  });
});

describe('documentDedupeKey', () => {
  it('document dedupe key changes with status and expiry date', () => {
    const expiring = documentDedupeKey('d1', 'expiring', '2026-06-30');
    expect(expiring).toBe('document:d1:expiring:2026-06-30');
    expect(documentDedupeKey('d1', 'expired', '2026-06-30')).not.toBe(expiring);
    expect(documentDedupeKey('d1', 'expiring', '2027-06-30')).not.toBe(expiring);
  });
});
