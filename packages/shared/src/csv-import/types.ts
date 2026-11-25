import type { DistanceUnit, FuelQuantityUnit } from '../enums';
import type { CreateExpense } from '../schemas/expenses';
import type { CreateFuelLog } from '../schemas/fuel-logs';
import type { CreateMaintenanceRecord } from '../schemas/maintenance';
import type { CreateOdometerReading } from '../schemas/vehicles';
import type { CsvDocument } from './tokenizer';

export type CsvFormat = 'fuelio' | 'drivvo' | 'lubelogger' | 'generic';
export type CsvDateFormat = 'ymd' | 'dmy' | 'mdy';
export type CsvDecimalSeparator = '.' | ',';
export type CsvRowKind = 'odometer' | 'fuel' | 'maintenance' | 'expense';
export type CsvColumn =
  | 'date'
  | 'value'
  | 'odometer'
  | 'quantity'
  | 'totalPrice'
  | 'pricePerUnit'
  | 'fullTank'
  | 'missedPrevious'
  | 'title'
  | 'category'
  | 'description'
  | 'workshop'
  | 'cost';

export interface CsvSourceUnits {
  distance: DistanceUnit | null;
  quantity: FuelQuantityUnit | null;
}

export type CsvGenericMapping = {
  kind: CsvRowKind;
  /** 0-based indexes: headers may be repeated or empty. */
  columns: Partial<Record<CsvColumn, number>>;
  dateFormat: CsvDateFormat;
  decimalSeparator: CsvDecimalSeparator;
};

export interface CsvImportOptions {
  /** Units of the vehicle: `quantity` comes from `fuelQuantityUnit(fuelType, volumeUnit)`. */
  target: { distance: DistanceUnit; quantity: FuelQuantityUnit };
  dateFormat?: CsvDateFormat;
  decimalSeparator?: CsvDecimalSeparator;
  /** Overrides the units detected in the file. */
  sourceUnits?: Partial<CsvSourceUnits>;
  /** When present, the file is read as generic and detection is skipped. */
  mapping?: CsvGenericMapping;
}

export type CsvRowWarning = 'odometer_rounded' | 'merged_fuels';

interface CsvRowBase {
  sourceRow: number;
  /** The source app's own id, when it has one. */
  sourceId: string | null;
  key: string;
  warnings: CsvRowWarning[];
}

export type CsvRow =
  | (CsvRowBase & { kind: 'odometer'; data: CreateOdometerReading })
  | (CsvRowBase & { kind: 'fuel'; data: CreateFuelLog })
  | (CsvRowBase & { kind: 'maintenance'; data: CreateMaintenanceRecord })
  | (CsvRowBase & { kind: 'expense'; data: CreateExpense });

export type CsvRowErrorCode =
  | 'malformed_row'
  | 'missing_field'
  | 'invalid_date'
  | 'invalid_number'
  | 'invalid_boolean'
  | 'out_of_range'
  | 'mixed_fuel_units';

export interface CsvRowError {
  row: number;
  code: CsvRowErrorCode;
  field: string | null;
}

export interface CsvSkippedRow {
  row: number;
  reason: 'template' | 'income';
  label: string | null;
}

export type CsvImportResult =
  | { status: 'unknown'; headers: string[] }
  | {
      status: 'needs_options';
      format: CsvFormat;
      headers: string[];
      missing: ('dateFormat' | 'decimalSeparator' | `columns.${CsvColumn}`)[];
    }
  | { status: 'unit_mismatch'; format: CsvFormat; source: CsvSourceUnits; target: CsvImportOptions['target'] }
  | {
      status: 'parsed';
      format: CsvFormat;
      dateFormat: CsvDateFormat;
      decimalSeparator: CsvDecimalSeparator;
      sourceUnits: CsvSourceUnits;
      rows: CsvRow[];
      errors: CsvRowError[];
      skipped: CsvSkippedRow[];
      /** The source had these fuel fields, which Ikrive cannot store (#86 warns about it). */
      droppedFuelFields: { notes: boolean; station: boolean };
    };

/** Columns whose cells take part in resolving the decimal separator. */
export type CsvNumberColumn = 'odometer' | 'quantity' | 'totalPrice' | 'pricePerUnit' | 'cost';

export interface CsvImportedCells {
  dates: string[];
  numbers: { column: CsvNumberColumn; raw: string }[];
}

export interface CsvValueContext {
  dateFormat: CsvDateFormat;
  decimalSeparator: CsvDecimalSeparator;
}

/** A row read by an adapter, before validating it against its creation schema. */
export interface CsvDraftRow {
  sourceRow: number;
  sourceId: string | null;
  kind: CsvRowKind;
  input: Record<string, unknown>;
  warnings: CsvRowWarning[];
  dropped: { notes: boolean; station: boolean };
}

export interface CsvAdapterOutput {
  drafts: CsvDraftRow[];
  errors: CsvRowError[];
  skipped: CsvSkippedRow[];
}

export interface CsvAdapter {
  format: Exclude<CsvFormat, 'generic'>;
  headers(doc: CsvDocument): string[];
  declaredDateFormat(doc: CsvDocument): CsvDateFormat | null;
  sourceUnits(doc: CsvDocument): CsvSourceUnits;
  /** Only the cells that are imported: rows going to `skipped` and unused columns do not count. */
  collectImportedCells(doc: CsvDocument): CsvImportedCells;
  normalize(doc: CsvDocument, context: CsvValueContext): CsvAdapterOutput;
}
