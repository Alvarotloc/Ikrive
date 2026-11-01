import type { FuelType, Locale, MaintenanceCategory } from '../enums';
import type { SaleReportOptions } from '../schemas/reports';
import type { UserSettings } from '../schemas/settings';
import type { Vehicle } from '../schemas/vehicles';
import { averageDistancePerYear, latestOdometerReading, type OdometerPoint } from './odometer';
import { roundMoney } from './stats';

export interface SaleReportMaintenance {
  date: string;
  odometer: number | null;
  category: MaintenanceCategory;
  title: string;
  cost: number | null;
  includeInReport: boolean;
}

export interface SaleReportInput {
  vehicle: Pick<Vehicle, 'name' | 'make' | 'model' | 'version' | 'year' | 'fuelType' | 'plate' | 'vin'>;
  /** Every odometer reading of the vehicle, in any order. */
  readings: readonly OdometerPoint[];
  /** Every maintenance record of the vehicle, in creation order; only `includeInReport` ones are shown. */
  maintenance: readonly SaleReportMaintenance[];
  settings: Pick<UserSettings, 'locale' | 'currency' | 'distanceUnit'>;
  options: SaleReportOptions;
  /** `YYYY-MM-DD`; decided by the caller (the API: today in the owner's time zone). */
  issuedOn: string;
}

export type SaleReportColumn = 'date' | 'odometer' | 'category' | 'title' | 'cost';

export interface SaleReportRow {
  label: string;
  value: string;
}

/**
 * Content of the sale report with every text already translated and formatted, so the PDF document
 * only lays it out (and cannot leak anything the privacy options removed here).
 */
export interface SaleReport {
  locale: Locale;
  fileName: string;
  cover: { eyebrow: string; title: string; issued: string; heading: string; rows: SaleReportRow[] };
  summary: { title: string; rows: SaleReportRow[] };
  chart: {
    title: string;
    /** Text shown instead of the chart when there is not enough data; null when there is a chart. */
    empty: string | null;
    /** Odometer line, `x` (date) and `y` (value) normalized to [0, 1]. */
    points: { x: number; y: number }[];
    /** First and last date. */
    xLabels: [string, string] | null;
    /** Minimum and maximum value. */
    yLabels: [string, string] | null;
  };
  maintenance: {
    title: string;
    /** Text shown instead of the table when no record is included; null otherwise. */
    empty: string | null;
    /** Without `cost` when prices are hidden. */
    columns: { key: SaleReportColumn; label: string }[];
    /** Without the `cost` key when prices are hidden. */
    rows: Partial<Record<SaleReportColumn, string>>[];
  };
  footer: string;
}

export interface SaleReportTexts {
  eyebrow: string;
  issued: (date: string) => string;
  cover: {
    heading: string;
    makeModel: string;
    year: string;
    fuel: string;
    plate: string;
    vin: string;
    issuedOn: string;
  };
  summary: {
    title: string;
    currentOdometer: string;
    yearlyAverage: string;
    maintenanceCount: string;
    maintenanceSpending: string;
  };
  chart: { title: string; empty: string };
  maintenance: { title: string; empty: string; columns: Record<SaleReportColumn, string> };
  categories: Record<MaintenanceCategory, string>;
  fuels: Record<FuelType, string>;
  footer: string;
}

/** Fixed texts of the report. Categories and fuels are copied from the web locale files. */
export const SALE_REPORT_TEXTS: Record<Locale, SaleReportTexts> = {
  es: {
    eyebrow: 'Informe de venta',
    issued: (date) => `Emitido el ${date}`,
    cover: {
      heading: 'Vehículo',
      makeModel: 'Marca y modelo',
      year: 'Año',
      fuel: 'Combustible',
      plate: 'Matrícula',
      vin: 'Número de bastidor (VIN)',
      issuedOn: 'Fecha de emisión',
    },
    summary: {
      title: 'Resumen',
      currentOdometer: 'Kilometraje actual',
      yearlyAverage: 'Media anual',
      maintenanceCount: 'Mantenimientos',
      maintenanceSpending: 'Gasto en mantenimiento',
    },
    chart: {
      title: 'Histórico del cuentakilómetros',
      empty: 'No hay lecturas suficientes para dibujar el gráfico.',
    },
    maintenance: {
      title: 'Historial de mantenimiento',
      empty: 'No hay mantenimientos incluidos en el informe.',
      columns: {
        date: 'Fecha',
        odometer: 'Kilometraje',
        category: 'Categoría',
        title: 'Título',
        cost: 'Coste',
      },
    },
    categories: {
      oil_change: 'Aceite',
      tires: 'Neumáticos',
      brakes: 'Frenos',
      inspection: 'Inspección',
      repair: 'Reparación',
      filters: 'Filtros',
      battery: 'Batería',
      other: 'Otros',
    },
    fuels: {
      gasoline: 'Gasolina',
      diesel: 'Diésel',
      hybrid: 'Híbrido',
      plugin_hybrid: 'Híbrido enchufable',
      electric: 'Eléctrico',
      lpg: 'GLP',
      cng: 'GNC',
      other: 'Otro',
    },
    footer: 'Ikrive · Informe de venta',
  },
  en: {
    eyebrow: 'Sale report',
    issued: (date) => `Issued on ${date}`,
    cover: {
      heading: 'Vehicle',
      makeModel: 'Make and model',
      year: 'Year',
      fuel: 'Fuel',
      plate: 'Number plate',
      vin: 'VIN',
      issuedOn: 'Issue date',
    },
    summary: {
      title: 'Summary',
      currentOdometer: 'Current mileage',
      yearlyAverage: 'Yearly average',
      maintenanceCount: 'Maintenance records',
      maintenanceSpending: 'Maintenance spending',
    },
    chart: {
      title: 'Odometer history',
      empty: 'Not enough odometer readings to draw the chart.',
    },
    maintenance: {
      title: 'Maintenance history',
      empty: 'No maintenance records included in the report.',
      columns: { date: 'Date', odometer: 'Mileage', category: 'Category', title: 'Title', cost: 'Cost' },
    },
    categories: {
      oil_change: 'Oil',
      tires: 'Tires',
      brakes: 'Brakes',
      inspection: 'Inspection',
      repair: 'Repair',
      filters: 'Filters',
      battery: 'Battery',
      other: 'Other',
    },
    fuels: {
      gasoline: 'Petrol',
      diesel: 'Diesel',
      hybrid: 'Hybrid',
      plugin_hybrid: 'Plug-in hybrid',
      electric: 'Electric',
      lpg: 'LPG',
      cng: 'CNG',
      other: 'Other',
    },
    footer: 'Ikrive · Sale report',
  },
};

const NONE = '—';
const DAY_MS = 86_400_000;
const MAX_SLUG_LENGTH = 60;

/** Same formatting as the web's `useFormat()`, in the owner's locale, currency and distance unit. */
function formatters(settings: SaleReportInput['settings']) {
  const number = new Intl.NumberFormat(settings.locale, { maximumFractionDigits: 0 });
  const money = new Intl.NumberFormat(settings.locale, { style: 'currency', currency: settings.currency });
  // Date-only values have no time zone: format them as UTC so the day never shifts.
  const date = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeZone: 'UTC' });
  return {
    number: (value: number) => number.format(value),
    distance: (value: number) => `${number.format(value)} ${settings.distanceUnit}`,
    money: (value: number) => money.format(value),
    date: (iso: string) => date.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)),
  };
}

/**
 * `ikrive-<slug>-<issuedOn>.pdf`: the display name lower-cased, without diacritics and with any run of
 * other characters replaced by `-` (`vehicle` when nothing is left).
 */
export function saleReportFileName(displayName: string, issuedOn: string): string {
  const slug =
    displayName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/-+$/, '') || 'vehicle';
  return `ikrive-${slug}-${issuedOn}.pdf`;
}

/** One reading per day (the highest), in date order. */
function dailyReadings(readings: readonly OdometerPoint[]): OdometerPoint[] {
  const byDay = new Map<string, number>();
  for (const { date, value } of readings) byDay.set(date, Math.max(value, byDay.get(date) ?? value));
  return [...byDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildChart(
  readings: readonly OdometerPoint[],
  texts: SaleReportTexts,
  format: ReturnType<typeof formatters>,
): SaleReport['chart'] {
  const days = dailyReadings(readings);
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last || days.length < 2) {
    return { title: texts.chart.title, empty: texts.chart.empty, points: [], xLabels: null, yLabels: null };
  }
  const values = days.map((day) => day.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const start = Date.parse(first.date) / DAY_MS;
  const span = Date.parse(last.date) / DAY_MS - start;
  return {
    title: texts.chart.title,
    empty: null,
    points: days.map((day) => ({
      x: (Date.parse(day.date) / DAY_MS - start) / span,
      y: max === min ? 0.5 : (day.value - min) / (max - min),
    })),
    xLabels: [format.date(first.date), format.date(last.date)],
    yLabels: [format.distance(min), format.distance(max)],
  };
}

/** Builds the sale report content: included maintenance only, privacy options applied, texts resolved. */
export function buildSaleReport(input: SaleReportInput): SaleReport {
  const { vehicle, readings, settings, options, issuedOn } = input;
  const texts = SALE_REPORT_TEXTS[settings.locale];
  const format = formatters(settings);
  const displayName = vehicle.name ?? `${vehicle.make} ${vehicle.model}`;

  const coverRows: (SaleReportRow | null)[] = [
    {
      label: texts.cover.makeModel,
      value: [vehicle.make, vehicle.model, vehicle.version].filter(Boolean).join(' '),
    },
    vehicle.year != null ? { label: texts.cover.year, value: String(vehicle.year) } : null,
    { label: texts.cover.fuel, value: texts.fuels[vehicle.fuelType] },
    vehicle.plate && !options.hidePlate ? { label: texts.cover.plate, value: vehicle.plate } : null,
    vehicle.vin && !options.hideVin ? { label: texts.cover.vin, value: vehicle.vin } : null,
    { label: texts.cover.issuedOn, value: format.date(issuedOn) },
  ];

  // `sort` is stable: records on the same day keep their creation order.
  const included = input.maintenance
    .filter((record) => record.includeInReport)
    .sort((a, b) => a.date.localeCompare(b.date));

  const latest = latestOdometerReading(readings);
  const perYear = averageDistancePerYear(readings);
  const spending = roundMoney(included.reduce((total, record) => total + (record.cost ?? 0), 0));
  const summaryRows: (SaleReportRow | null)[] = [
    { label: texts.summary.currentOdometer, value: latest ? format.distance(latest.value) : NONE },
    { label: texts.summary.yearlyAverage, value: perYear === null ? NONE : format.distance(perYear) },
    { label: texts.summary.maintenanceCount, value: format.number(included.length) },
    options.hidePrices ? null : { label: texts.summary.maintenanceSpending, value: format.money(spending) },
  ];

  const columnKeys: SaleReportColumn[] = ['date', 'odometer', 'category', 'title'];
  if (!options.hidePrices) columnKeys.push('cost');

  return {
    locale: settings.locale,
    fileName: saleReportFileName(displayName, issuedOn),
    cover: {
      eyebrow: texts.eyebrow,
      title: displayName,
      issued: texts.issued(format.date(issuedOn)),
      heading: texts.cover.heading,
      rows: coverRows.filter((row) => row !== null),
    },
    summary: { title: texts.summary.title, rows: summaryRows.filter((row) => row !== null) },
    chart: buildChart(readings, texts, format),
    maintenance: {
      title: texts.maintenance.title,
      empty: included.length === 0 ? texts.maintenance.empty : null,
      columns: columnKeys.map((key) => ({ key, label: texts.maintenance.columns[key] })),
      rows: included.map((record) => {
        const row: Partial<Record<SaleReportColumn, string>> = {
          date: format.date(record.date),
          odometer: record.odometer === null ? NONE : format.distance(record.odometer),
          category: texts.categories[record.category],
          title: record.title,
        };
        if (!options.hidePrices) row.cost = record.cost === null ? NONE : format.money(record.cost);
        return row;
      }),
    },
    footer: texts.footer,
  };
}
