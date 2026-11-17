import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { MaintenanceCategory } from '../enums';
import type { SaleReportOptions } from '../schemas/reports';
import type { UpdateUserSettings } from '../schemas/settings';

/**
 * Data of the cross-mode sale report test (only for tests): the API (`apps/api/test/reports.test.ts`) and
 * the local mode (`apps/web/src/lib/data-source/local/local-sale-report.test.ts`) seed it through their
 * own interfaces, render the report and compare its text with the same snapshot file
 * (`__snapshots__/cross-report.txt`). Both use the local annex budget, 25 MB.
 */

/** Fixed clock of both sides: the report is issued on 2026-11-17 in Madrid. */
export const CROSS_NOW = new Date('2026-11-17T10:00:00.000Z');

export const CROSS_SETTINGS = {
  locale: 'es',
  currency: 'EUR',
  distanceUnit: 'km',
  timezone: 'Europe/Madrid',
} satisfies UpdateUserSettings;

export const CROSS_VEHICLE = {
  make: 'Seat',
  model: 'Ibiza',
  version: 'FR 1.0 TSI',
  year: 2019,
  fuelType: 'gasoline',
  plate: '1234BCD',
  vin: 'VSSZZZ6JZKR000001',
} as const;

export const CROSS_READINGS = [
  { date: '2024-01-10', value: 30_000 },
  { date: '2025-06-01', value: 52_000 },
] as const;

export type CrossRecordKey = 'oil' | 'tyres' | 'private';

/** In creation order; `private` is left out of the report, and so are its invoices. */
export const CROSS_MAINTENANCE: readonly {
  key: CrossRecordKey;
  date: string;
  odometer?: number;
  category: MaintenanceCategory;
  title: string;
  cost: number;
  includeInReport: boolean;
}[] = [
  {
    key: 'oil',
    date: '2024-03-01',
    odometer: 31_000,
    category: 'oil_change',
    title: 'Cambio de aceite',
    cost: 89.9,
    includeInReport: true,
  },
  {
    key: 'tyres',
    date: '2025-02-10',
    odometer: 48_000,
    category: 'tires',
    title: 'Neumáticos',
    cost: 420,
    includeInReport: true,
  },
  {
    key: 'private',
    date: '2025-04-01',
    category: 'repair',
    title: 'Reparación privada',
    cost: 80,
    includeInReport: false,
  },
];

export const CROSS_OPTIONS: SaleReportOptions = {
  hidePrices: false,
  hidePlate: true,
  hideVin: false,
  includeInvoices: true,
};

/** Size stored for `neumaticos.pdf` after the upload: over the 25 MB budget, so it is never read. */
export const CROSS_INFLATED_SIZE = 26 * 1024 * 1024;

export interface CrossFile {
  record: CrossRecordKey;
  name: string;
  data: Uint8Array;
  /** Size to write over the stored one after the upload. */
  storedSize?: number;
}

/**
 * A one-page PDF of `size` points with `text`, so it shows up in the extracted text of the report once
 * appended. Also used by the local tests, which do not depend on pdf-lib.
 */
export async function textPdf(text: string, size: [number, number] = [300, 200]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage(size).drawText(text, { x: 20, y: size[1] / 2, size: 14, font });
  return doc.save();
}

/**
 * Invoices in upload order: one appended (`Factura de prueba`), one unreadable (a PDF signature with
 * garbage), one over the budget, and one of the excluded record.
 */
export async function crossScenarioFiles(): Promise<CrossFile[]> {
  return [
    { record: 'oil', name: 'factura-aceite.pdf', data: await textPdf('Factura de prueba') },
    {
      record: 'oil',
      name: 'factura-rota.pdf',
      data: new Uint8Array([...new TextEncoder().encode('%PDF-1.7\n'), ...new Uint8Array(64)]),
    },
    {
      record: 'tyres',
      name: 'neumaticos.pdf',
      data: await textPdf('Factura demasiado grande'),
      storedSize: CROSS_INFLATED_SIZE,
    },
    { record: 'private', name: 'factura-privada.pdf', data: await textPdf('Factura privada') },
  ];
}
