import { describe, expect, it } from 'vitest';
import {
  buildSaleReport,
  type SaleReport,
  type SaleReportAttachment,
  type SaleReportInput,
  type SaleReportMaintenance,
  saleReportFileName,
} from './sale-report';

const input = (overrides: Partial<SaleReportInput> = {}): SaleReportInput => ({
  vehicle: {
    name: null,
    make: 'Seat',
    model: 'León',
    version: 'FR 1.5 TSI',
    year: 2019,
    fuelType: 'gasoline',
    plate: '1234ABC',
    vin: 'VSSZZZ5FZKR000001',
  },
  readings: [],
  maintenance: [],
  settings: { locale: 'es', currency: 'EUR', distanceUnit: 'km' },
  options: { hidePrices: false, hidePlate: false, hideVin: false, includeInvoices: false },
  issuedOn: '2026-11-01',
  ...overrides,
});

const record = (overrides: Partial<SaleReportMaintenance> = {}): SaleReportMaintenance => ({
  date: '2026-01-10',
  odometer: 45_000,
  category: 'oil_change',
  title: 'Cambio de aceite',
  cost: 120,
  includeInReport: true,
  ...overrides,
});

/** `Intl` separates numbers and currency symbols with (narrow) no-break spaces; compare with plain ones. */
const plain = (value: string) => value.replace(/[  ]/g, ' ');

const rowsOf = (rows: { label: string; value: string }[]) =>
  Object.fromEntries(rows.map((row) => [row.label, plain(row.value)]));

const summaryOf = (report: SaleReport) => rowsOf(report.summary.rows);

describe('buildSaleReport', () => {
  describe('cover and summary', () => {
    it('fills the cover with the vehicle data', () => {
      const report = buildSaleReport(input());
      expect(report.cover.eyebrow).toBe('Informe de venta');
      expect(report.cover.title).toBe('Seat León');
      expect(report.cover.issued).toBe('Emitido el 1 nov 2026');
      expect(report.cover.rows).toEqual([
        { label: 'Marca y modelo', value: 'Seat León FR 1.5 TSI' },
        { label: 'Año', value: '2019' },
        { label: 'Combustible', value: 'Gasolina' },
        { label: 'Matrícula', value: '1234ABC' },
        { label: 'Número de bastidor (VIN)', value: 'VSSZZZ5FZKR000001' },
        { label: 'Fecha de emisión', value: '1 nov 2026' },
      ]);

      const sparse = buildSaleReport(
        input({
          vehicle: {
            name: 'El León',
            make: 'Seat',
            model: 'León',
            version: null,
            year: null,
            fuelType: 'diesel',
            plate: null,
            vin: null,
          },
        }),
      );
      expect(sparse.cover.title).toBe('El León');
      expect(sparse.cover.rows).toEqual([
        { label: 'Marca y modelo', value: 'Seat León' },
        { label: 'Combustible', value: 'Diésel' },
        { label: 'Fecha de emisión', value: '1 nov 2026' },
      ]);
    });

    it('summarises the odometer', () => {
      const report = buildSaleReport(
        input({
          readings: [
            { date: '2025-11-01', value: 60_000 },
            { date: '2024-11-01', value: 40_000 },
            { date: '2025-05-01', value: 50_000 },
          ],
        }),
      );
      expect(summaryOf(report)['Kilometraje actual']).toBe('60.000 km');
      // 20 000 km in 365 days.
      expect(summaryOf(report)['Media anual']).toBe('20.000 km');

      const empty = summaryOf(buildSaleReport(input()));
      expect(empty['Kilometraje actual']).toBe('—');
      expect(empty['Media anual']).toBe('—');

      const short = summaryOf(
        buildSaleReport(
          input({
            readings: [
              { date: '2026-10-01', value: 10_000 },
              { date: '2026-10-20', value: 11_000 },
            ],
          }),
        ),
      );
      expect(short['Kilometraje actual']).toBe('11.000 km');
      expect(short['Media anual']).toBe('—');
    });

    it('counts and sums only included maintenance', () => {
      const report = buildSaleReport(
        input({
          maintenance: [
            record({ cost: 10.1 }),
            record({ cost: 999, includeInReport: false }),
            record({ cost: null }),
            record({ cost: 20.2 }),
          ],
        }),
      );
      expect(summaryOf(report).Mantenimientos).toBe('3');
      expect(summaryOf(report)['Gasto en mantenimiento']).toBe('30,30 €');
    });
  });

  describe('maintenance table and chart', () => {
    it('lists only included maintenance by date', () => {
      const report = buildSaleReport(
        input({
          maintenance: [
            record({ date: '2026-03-01', title: 'Neumáticos' }),
            record({ date: '2025-06-01', title: 'Oculto', includeInReport: false }),
            record({ date: '2026-01-10', title: 'Primero del día' }),
            record({ date: '2025-02-01', title: 'Más antiguo' }),
            record({ date: '2026-01-10', title: 'Segundo del día' }),
          ],
        }),
      );
      expect(report.maintenance.rows.map((row) => row.title)).toEqual([
        'Más antiguo',
        'Primero del día',
        'Segundo del día',
        'Neumáticos',
      ]);
      expect(report.maintenance.empty).toBeNull();
    });

    it('formats each maintenance row', () => {
      const report = buildSaleReport(
        input({
          maintenance: [
            record({
              date: '2026-01-10',
              odometer: 45_000,
              category: 'brakes',
              title: 'Pastillas',
              cost: 150.5,
            }),
            record({ date: '2026-02-10', odometer: null, category: 'tires', title: 'Ruedas', cost: null }),
          ],
        }),
      );
      expect(report.maintenance.columns.map((column) => column.key)).toEqual([
        'date',
        'odometer',
        'category',
        'title',
        'cost',
      ]);
      expect(report.maintenance.columns.map((column) => column.label)).toEqual([
        'Fecha',
        'Kilometraje',
        'Categoría',
        'Título',
        'Coste',
      ]);
      expect(
        report.maintenance.rows.map((row) =>
          Object.fromEntries(Object.entries(row).map(([key, value]) => [key, plain(value)])),
        ),
      ).toEqual([
        {
          date: '10 ene 2026',
          odometer: '45.000 km',
          category: 'Frenos',
          title: 'Pastillas',
          cost: '150,50 €',
        },
        { date: '10 feb 2026', odometer: '—', category: 'Neumáticos', title: 'Ruedas', cost: '—' },
      ]);
    });

    it('builds the odometer chart', () => {
      const report = buildSaleReport(
        input({
          readings: [
            { date: '2026-01-11', value: 20_000 },
            { date: '2026-01-01', value: 10_000 },
            { date: '2026-01-11', value: 30_000 },
            { date: '2026-01-06', value: 15_000 },
          ],
        }),
      );
      expect(report.chart.title).toBe('Histórico del cuentakilómetros');
      expect(report.chart.empty).toBeNull();
      expect(report.chart.points).toEqual([
        { x: 0, y: 0 },
        { x: 0.5, y: 0.25 },
        { x: 1, y: 1 },
      ]);
      expect(report.chart.xLabels).toEqual(['1 ene 2026', '11 ene 2026']);
      expect(report.chart.yLabels?.map(plain)).toEqual(['10.000 km', '30.000 km']);

      const flat = buildSaleReport(
        input({
          readings: [
            { date: '2026-01-01', value: 10_000 },
            { date: '2026-02-01', value: 10_000 },
          ],
        }),
      );
      expect(flat.chart.points).toEqual([
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ]);
    });

    it('omits the chart with readings on fewer than two days', () => {
      const report = buildSaleReport(
        input({
          readings: [
            { date: '2026-01-01', value: 10_000 },
            { date: '2026-01-01', value: 10_500 },
          ],
        }),
      );
      expect(report.chart).toEqual({
        title: 'Histórico del cuentakilómetros',
        empty: 'No hay lecturas suficientes para dibujar el gráfico.',
        points: [],
        xLabels: null,
        yLabels: null,
      });
    });

    it('handles a vehicle without maintenance or readings', () => {
      const report = buildSaleReport(input());
      expect(report.maintenance.rows).toEqual([]);
      expect(report.maintenance.empty).toBe('No hay mantenimientos incluidos en el informe.');
      expect(report.chart.points).toEqual([]);
      expect(report.chart.empty).toBe('No hay lecturas suficientes para dibujar el gráfico.');
      expect(summaryOf(report).Mantenimientos).toBe('0');
      expect(summaryOf(report)['Gasto en mantenimiento']).toBe('0,00 €');
    });
  });

  describe('privacy, language and file name', () => {
    const priced = input({
      maintenance: [record({ cost: 12_345.67 }), record({ cost: 98_765.43, date: '2026-02-01' })],
    });

    it('hides prices', () => {
      const shown = buildSaleReport(priced);
      expect(plain(JSON.stringify(shown))).toContain('12.345,67');
      expect(JSON.stringify(shown)).toContain('€');

      const report = buildSaleReport({ ...priced, options: { ...priced.options, hidePrices: true } });
      expect(report.maintenance.columns.map((column) => column.key)).not.toContain('cost');
      for (const row of report.maintenance.rows) expect(row).not.toHaveProperty('cost');
      expect(summaryOf(report)).not.toHaveProperty('Gasto en mantenimiento');
      const json = plain(JSON.stringify(report));
      for (const amount of ['12.345,67', '98.765,43', '111.111,1', '€']) expect(json).not.toContain(amount);
    });

    it('hides the plate', () => {
      expect(JSON.stringify(buildSaleReport(input()))).toContain('1234ABC');
      const report = buildSaleReport(
        input({ options: { hidePrices: false, hidePlate: true, hideVin: false, includeInvoices: false } }),
      );
      expect(JSON.stringify(report)).not.toContain('1234ABC');
      expect(report.cover.rows.map((row) => row.label)).not.toContain('Matrícula');
      expect(JSON.stringify(report)).toContain('VSSZZZ5FZKR000001');
    });

    it('hides the vin', () => {
      expect(JSON.stringify(buildSaleReport(input()))).toContain('VSSZZZ5FZKR000001');
      const report = buildSaleReport(
        input({ options: { hidePrices: false, hidePlate: false, hideVin: true, includeInvoices: false } }),
      );
      expect(JSON.stringify(report)).not.toContain('VSSZZZ5FZKR000001');
      expect(report.cover.rows.map((row) => row.label)).not.toContain('Número de bastidor (VIN)');
      expect(JSON.stringify(report)).toContain('1234ABC');
    });

    it("uses the owner's locale", () => {
      const withRecord = { ...priced, maintenance: [record({ category: 'repair' })] };
      const es = buildSaleReport(withRecord);
      const en = buildSaleReport({ ...withRecord, settings: { ...withRecord.settings, locale: 'en' } });
      expect(es.locale).toBe('es');
      expect(en.locale).toBe('en');
      expect([es.cover.eyebrow, en.cover.eyebrow]).toEqual(['Informe de venta', 'Sale report']);
      expect([es.summary.title, en.summary.title]).toEqual(['Resumen', 'Summary']);
      expect([es.maintenance.title, en.maintenance.title]).toEqual([
        'Historial de mantenimiento',
        'Maintenance history',
      ]);
      expect([es.chart.empty, en.chart.empty]).toEqual([
        'No hay lecturas suficientes para dibujar el gráfico.',
        'Not enough odometer readings to draw the chart.',
      ]);
      expect([es.maintenance.rows[0]?.category, en.maintenance.rows[0]?.category]).toEqual([
        'Reparación',
        'Repair',
      ]);
      expect(rowsOf(es.cover.rows).Combustible).toBe('Gasolina');
      expect(rowsOf(en.cover.rows).Fuel).toBe('Petrol');
      expect(en.footer).toBe('Ikrive · Sale report');
    });

    it("formats with the owner's currency and unit", () => {
      const data: Partial<SaleReportInput> = {
        readings: [
          { date: '2025-01-01', value: 12_345 },
          { date: '2026-01-01', value: 23_456 },
        ],
        maintenance: [record({ date: '2025-06-15', odometer: 17_890, cost: 12_345.6 })],
      };
      const es = buildSaleReport(input(data));
      const en = buildSaleReport(
        input({ ...data, settings: { locale: 'en', currency: 'USD', distanceUnit: 'mi' } }),
      );

      expect(summaryOf(es)['Kilometraje actual']).toBe('23.456 km');
      expect(summaryOf(es)['Gasto en mantenimiento']).toBe('12.345,60 €');
      expect(es.maintenance.rows[0]).toMatchObject({ date: '15 jun 2025' });
      expect(plain(es.maintenance.rows[0]?.odometer ?? '')).toBe('17.890 km');

      expect(summaryOf(en)['Current mileage']).toBe('23,456 mi');
      expect(summaryOf(en)['Yearly average']).toBe('11,111 mi');
      expect(summaryOf(en)['Maintenance spending']).toBe('$12,345.60');
      expect(en.maintenance.rows[0]).toMatchObject({ date: 'Jun 15, 2025', odometer: '17,890 mi' });
      expect(en.cover.issued).toBe('Issued on Nov 1, 2026');
    });

    it('builds a readable file name', () => {
      expect(saleReportFileName('Seat León FR', '2026-11-01')).toBe('ikrive-seat-leon-fr-2026-11-01.pdf');
      expect(saleReportFileName('  ¡¿***?!  ', '2026-11-01')).toBe('ikrive-vehicle-2026-11-01.pdf');
      expect(saleReportFileName(`${'a'.repeat(59)} bcd`, '2026-11-01')).toBe(
        `ikrive-${'a'.repeat(59)}-2026-11-01.pdf`,
      );
      expect(buildSaleReport(input()).fileName).toBe('ikrive-seat-leon-2026-11-01.pdf');
      expect(
        buildSaleReport(input({ vehicle: { ...input().vehicle, name: 'Coche de Ñuño' } })).fileName,
      ).toBe('ikrive-coche-de-nuno-2026-11-01.pdf');
    });
  });

  describe('annexes', () => {
    const withInvoices = (overrides: Partial<SaleReportInput> = {}) =>
      input({ options: { ...input().options, includeInvoices: true }, ...overrides });
    const attachment = (id: string, skipped: SaleReportAttachment['skipped'] = null) => ({
      id,
      name: `${id}.pdf`,
      skipped,
    });
    const keys = (report: SaleReport) => report.maintenance.columns.map((column) => column.key);

    it('numbers annexes in table order', () => {
      const report = buildSaleReport(
        withInvoices({
          // Creation order differs from the table (date) order.
          maintenance: [
            record({ date: '2026-03-01', title: 'Frenos', attachments: [attachment('frenos')] }),
            record({ date: '2025-06-15', title: 'Aceite', attachments: [attachment('a'), attachment('b')] }),
            record({ date: '2026-05-01', title: 'ITV' }),
          ],
        }),
      );

      expect(keys(report)).toEqual(['date', 'odometer', 'category', 'title', 'cost', 'annexes']);
      expect(report.maintenance.columns.at(-1)?.label).toBe('Anexos');
      expect(report.maintenance.rows.map((row) => [row.title, row.annexes])).toEqual([
        ['Aceite', 'A1, A2'],
        ['Frenos', 'A3'],
        ['ITV', '—'],
      ]);
      expect(report.annexes?.title).toBe('Facturas anexadas');
      expect(report.annexes?.items).toEqual([
        { id: 'a', ref: 'A1', label: 'A1 · 15 jun 2025 · Aceite · a.pdf', notice: null },
        { id: 'b', ref: 'A2', label: 'A2 · 15 jun 2025 · Aceite · b.pdf', notice: null },
        { id: 'frenos', ref: 'A3', label: 'A3 · 1 mar 2026 · Frenos · frenos.pdf', notice: null },
      ]);
    });

    it('never annexes excluded maintenance', () => {
      const report = buildSaleReport(
        withInvoices({
          maintenance: [
            record({ attachments: [attachment('shown')] }),
            record({ title: 'Privado', includeInReport: false, attachments: [attachment('secret-invoice')] }),
          ],
        }),
      );
      expect(report.annexes?.items.map((item) => item.ref)).toEqual(['A1']);
      expect(JSON.stringify(report)).not.toContain('secret-invoice');

      const onlyExcluded = buildSaleReport(
        withInvoices({
          maintenance: [record({ includeInReport: false, attachments: [attachment('secret-invoice')] })],
        }),
      );
      expect(onlyExcluded.annexes).toBeNull();
      expect(JSON.stringify(onlyExcluded)).not.toContain('secret-invoice');
    });

    it('marks annexes that could not be read', () => {
      const report = buildSaleReport(
        withInvoices({
          maintenance: [record({ attachments: [attachment('broken', 'unreadable'), attachment('ok')] })],
        }),
      );
      expect(report.maintenance.rows[0]?.annexes).toBe('A1, A2');
      expect(report.annexes?.items).toEqual([
        {
          id: 'broken',
          ref: 'A1',
          label: 'A1 · 10 ene 2026 · Cambio de aceite · broken.pdf',
          notice: 'No se pudo anexar este archivo.',
        },
        { id: 'ok', ref: 'A2', label: 'A2 · 10 ene 2026 · Cambio de aceite · ok.pdf', notice: null },
      ]);
    });

    it('marks annexes skipped by the size limit', () => {
      const data = {
        maintenance: [
          record({ attachments: [attachment('big', 'size_limit'), attachment('bad', 'unreadable')] }),
        ],
      };
      const es = buildSaleReport(withInvoices(data));
      const en = buildSaleReport(
        withInvoices({ ...data, settings: { locale: 'en', currency: 'EUR', distanceUnit: 'km' } }),
      );
      expect(es.annexes?.items.map((item) => [item.ref, item.notice])).toEqual([
        ['A1', 'No se anexó: se superó el tamaño máximo del informe.'],
        ['A2', 'No se pudo anexar este archivo.'],
      ]);
      expect(en.annexes?.items.map((item) => [item.ref, item.notice])).toEqual([
        ['A1', "Not attached: the report's maximum size was exceeded."],
        ['A2', 'This file could not be attached.'],
      ]);
    });

    it('keeps the #29 report without includeInvoices', () => {
      const maintenance = [record({ attachments: [attachment('a')] }), record({ date: '2026-02-01' })];
      const plainReport = buildSaleReport(
        input({ maintenance: maintenance.map(({ attachments, ...rest }) => rest) }),
      );
      const withoutOption = buildSaleReport(input({ maintenance }));
      const withoutAttachments = buildSaleReport(
        withInvoices({ maintenance: maintenance.map((item) => ({ ...item, attachments: [] })) }),
      );

      for (const report of [withoutOption, withoutAttachments]) {
        expect(report.annexes).toBeNull();
        expect(keys(report)).toEqual(['date', 'odometer', 'category', 'title', 'cost']);
        expect(report).toEqual(plainReport);
      }
    });

    it('translates the annex texts', () => {
      const data = { maintenance: [record({ attachments: [attachment('a')] })] };
      const es = buildSaleReport(withInvoices(data));
      const en = buildSaleReport(
        withInvoices({ ...data, settings: { locale: 'en', currency: 'EUR', distanceUnit: 'km' } }),
      );
      expect([es.maintenance.columns.at(-1)?.label, en.maintenance.columns.at(-1)?.label]).toEqual([
        'Anexos',
        'Annexes',
      ]);
      expect([es.annexes?.title, en.annexes?.title]).toEqual(['Facturas anexadas', 'Attached invoices']);
      expect(en.annexes?.items[0]?.label).toBe('A1 · Jan 10, 2026 · Cambio de aceite · a.pdf');
    });
  });
});
