import { describe, expect, it } from 'vitest';
import { createReportShareSchema } from './report-shares';

describe('createReportShareSchema', () => {
  it('defaults every option to false and the expiry to 30 days', () => {
    expect(createReportShareSchema.parse({})).toEqual({
      hidePrices: false,
      hidePlate: false,
      hideVin: false,
      includeInvoices: false,
      expiresInDays: 30,
    });
  });

  it('accepts 1 and 90 days', () => {
    expect(createReportShareSchema.parse({ expiresInDays: 1 }).expiresInDays).toBe(1);
    expect(createReportShareSchema.parse({ expiresInDays: 90 }).expiresInDays).toBe(90);
  });

  it('rejects 0, 91 and 1.5 days', () => {
    for (const expiresInDays of [0, 91, 1.5]) {
      expect(createReportShareSchema.safeParse({ expiresInDays }).success).toBe(false);
    }
  });

  it('rejects string flags', () => {
    expect(createReportShareSchema.safeParse({ hidePlate: 'true' }).success).toBe(false);
    expect(createReportShareSchema.safeParse({ includeInvoices: '1' }).success).toBe(false);
    expect(createReportShareSchema.safeParse({ expiresInDays: '30' }).success).toBe(false);
  });
});
