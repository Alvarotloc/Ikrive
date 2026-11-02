import type { SaleReportOptions } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { fileNameFromContentDisposition, hidesAnything, saleReportPath } from './sale-report';

const none: SaleReportOptions = {
  hidePrices: false,
  hidePlate: false,
  hideVin: false,
  includeInvoices: false,
};

describe('saleReportPath', () => {
  it('builds the report path with only the checked options', () => {
    expect(saleReportPath('v1', none)).toBe('/vehicles/v1/report.pdf');
    expect(saleReportPath('v1', { ...none, hideVin: true })).toBe('/vehicles/v1/report.pdf?hideVin=true');
    expect(
      saleReportPath('v1', { includeInvoices: true, hideVin: true, hidePlate: true, hidePrices: true }),
    ).toBe('/vehicles/v1/report.pdf?hidePrices=true&hidePlate=true&hideVin=true&includeInvoices=true');
  });
});

describe('fileNameFromContentDisposition', () => {
  it('reads the file name from Content-Disposition', () => {
    expect(
      fileNameFromContentDisposition(
        `attachment; filename="ikrive-se_or-2026-11-01.pdf"; filename*=UTF-8''ikrive-se%C3%B1or-2026-11-01.pdf`,
      ),
    ).toBe('ikrive-señor-2026-11-01.pdf');
    expect(fileNameFromContentDisposition('attachment; filename="ikrive-clio-2026-11-01.pdf"')).toBe(
      'ikrive-clio-2026-11-01.pdf',
    );
    expect(fileNameFromContentDisposition('attachment; filename=ikrive-clio.pdf')).toBe('ikrive-clio.pdf');
    expect(
      fileNameFromContentDisposition(
        `attachment; filename="ikrive-clio.pdf"; filename*=UTF-8''ikrive-%E0%A4.pdf`,
      ),
    ).toBe('ikrive-clio.pdf');
  });

  it('returns null without a file name', () => {
    expect(fileNameFromContentDisposition(null)).toBeNull();
    expect(fileNameFromContentDisposition('attachment')).toBeNull();
    expect(fileNameFromContentDisposition('attachment; filename=""')).toBeNull();
  });
});

describe('hidesAnything', () => {
  it('detects any hide option', () => {
    expect(hidesAnything(none)).toBe(false);
    expect(hidesAnything({ ...none, hidePrices: true })).toBe(true);
    expect(hidesAnything({ ...none, hidePlate: true })).toBe(true);
    expect(hidesAnything({ ...none, hideVin: true })).toBe(true);
    expect(hidesAnything({ ...none, includeInvoices: true })).toBe(false);
  });
});
