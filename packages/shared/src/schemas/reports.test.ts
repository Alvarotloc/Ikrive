import { describe, expect, it } from 'vitest';
import { saleReportQuerySchema } from './reports';

describe('saleReportQuerySchema', () => {
  it('defaults every option to false', () => {
    expect(saleReportQuerySchema.parse({})).toEqual({
      hidePrices: false,
      hidePlate: false,
      hideVin: false,
      includeInvoices: false,
    });
  });

  it('accepts true/false/1/0', () => {
    expect(
      saleReportQuerySchema.parse({
        hidePrices: 'true',
        hidePlate: '1',
        hideVin: 'TRUE',
        includeInvoices: 'true',
      }),
    ).toEqual({
      hidePrices: true,
      hidePlate: true,
      hideVin: true,
      includeInvoices: true,
    });
    expect(saleReportQuerySchema.parse({ includeInvoices: '1' }).includeInvoices).toBe(true);
    expect(saleReportQuerySchema.parse({ includeInvoices: '0' }).includeInvoices).toBe(false);
    expect(
      saleReportQuerySchema.parse({
        hidePrices: 'false',
        hidePlate: '0',
        hideVin: 'False',
        includeInvoices: 'false',
      }),
    ).toEqual({
      hidePrices: false,
      hidePlate: false,
      hideVin: false,
      includeInvoices: false,
    });
  });

  it('rejects other values', () => {
    for (const query of [
      { hidePrices: 'yes' },
      { hidePlate: '2' },
      { hideVin: '' },
      { hideVin: ['true', 'true'] },
      { hidePrices: true },
      { includeInvoices: 'yes' },
      { includeInvoices: '' },
      { includeInvoices: true },
    ]) {
      expect(saleReportQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});
