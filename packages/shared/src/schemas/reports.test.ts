import { describe, expect, it } from 'vitest';
import { saleReportQuerySchema } from './reports';

describe('saleReportQuerySchema', () => {
  it('defaults every option to false', () => {
    expect(saleReportQuerySchema.parse({})).toEqual({ hidePrices: false, hidePlate: false, hideVin: false });
  });

  it('accepts true/false/1/0', () => {
    expect(saleReportQuerySchema.parse({ hidePrices: 'true', hidePlate: '1', hideVin: 'TRUE' })).toEqual({
      hidePrices: true,
      hidePlate: true,
      hideVin: true,
    });
    expect(saleReportQuerySchema.parse({ hidePrices: 'false', hidePlate: '0', hideVin: 'False' })).toEqual({
      hidePrices: false,
      hidePlate: false,
      hideVin: false,
    });
  });

  it('rejects other values', () => {
    for (const query of [
      { hidePrices: 'yes' },
      { hidePlate: '2' },
      { hideVin: '' },
      { hideVin: ['true', 'true'] },
      { hidePrices: true },
    ]) {
      expect(saleReportQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});
