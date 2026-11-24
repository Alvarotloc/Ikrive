import type { OdometerPoint } from '../domain/odometer';
import { validateOdometerWrite } from '../domain/odometer-writes';
import type { CsvImportSummary } from '../schemas/csv-import';
import type { CreateFuelLog } from '../schemas/fuel-logs';
import type { CreateMaintenanceRecord } from '../schemas/maintenance';
import { csvRowKey } from './keys';
import type { CsvImportResult, CsvRow, CsvSourceUnits } from './types';

/**
 * Decodes the bytes of a CSV as UTF-8 and strips the BOM. Invalid bytes become U+FFFD and set
 * `replaced`, so the caller can warn that the file may not be UTF-8; a U+FFFD written in a valid
 * UTF-8 file does not.
 */
export function decodeCsv(bytes: Uint8Array): { text: string; replaced: boolean } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), replaced: false };
  } catch {
    return { text: new TextDecoder('utf-8').decode(bytes), replaced: true };
  }
}

/** What the vehicle already has, to deduplicate and validate the rows against it. */
export interface CsvImportExisting {
  readings: readonly (OdometerPoint & { id: string })[];
  fuelLogs: readonly Pick<CreateFuelLog, 'date' | 'odometer' | 'quantity' | 'totalPrice'>[];
  maintenance: readonly Pick<CreateMaintenanceRecord, 'date' | 'odometer' | 'title' | 'cost'>[];
}

export interface CsvImportPlan {
  /** Rows to write, in processing order. */
  accepted: CsvRow[];
  duplicates: number;
  rejected: CsvImportSummary['rejected'];
}

type Parsed = Extract<CsvImportResult, { status: 'parsed' }>;

const rowOdometer = (row: CsvRow) => (row.kind === 'odometer' ? row.data.value : row.data.odometer);

/** Refuels and maintenance first, then the loose readings, each group by row number. */
const processingOrder = (a: CsvRow, b: CsvRow) =>
  Number(a.kind === 'odometer') - Number(b.kind === 'odometer') || a.sourceRow - b.sourceRow;

function storedKeys(existing: CsvImportExisting): Set<string> {
  // `csvRowKey` only reads the fields picked in `CsvImportExisting`.
  return new Set([
    ...existing.readings.map(({ date, value }) => csvRowKey({ kind: 'odometer', data: { date, value } })),
    ...existing.fuelLogs.map((log) => csvRowKey({ kind: 'fuel', data: log as CreateFuelLog })),
    ...existing.maintenance.map((record) =>
      csvRowKey({ kind: 'maintenance', data: record as CreateMaintenanceRecord }),
    ),
  ]);
}

/**
 * Decides which parsed rows are written: a row whose key is already stored or was already seen in the
 * file is a duplicate; a row whose date is in the future or whose odometer contradicts the stored
 * readings, or those of the rows accepted before it, is rejected; the rest are accepted.
 */
export function planCsvImport(
  rows: readonly CsvRow[],
  existing: CsvImportExisting,
  today: string,
): CsvImportPlan {
  const seen = storedKeys(existing);
  const readings = [...existing.readings];
  const plan: CsvImportPlan = { accepted: [], duplicates: 0, rejected: [] };
  for (const row of [...rows].sort(processingOrder)) {
    if (seen.has(row.key)) {
      plan.duplicates += 1;
      continue;
    }
    seen.add(row.key);
    const { date } = row.data;
    const odometer = rowOdometer(row);
    const error = validateOdometerWrite({ readings, date, odometer, today });
    if (error) {
      plan.rejected.push({
        row: row.sourceRow,
        kind: row.kind,
        reason: error.kind === 'future_date' ? 'future_date' : 'odometer_conflict',
        conflict:
          error.kind === 'conflict' ? { date: error.conflict.date, value: error.conflict.value } : null,
      });
      continue;
    }
    plan.accepted.push(row);
    if (odometer != null) {
      readings.push({ id: `csv:${row.sourceRow}`, date, value: odometer });
      seen.add(csvRowKey({ kind: 'odometer', data: { date, value: odometer } }));
    }
  }
  return plan;
}

/** Response of the import, from the parser result and the plan. */
export function csvImportSummary(
  parsed: Parsed,
  plan: CsvImportPlan,
  flags: { dryRun: boolean; encodingReplaced: boolean },
): CsvImportSummary {
  const created = { odometer: 0, fuel: 0, maintenance: 0 };
  for (const row of plan.accepted) created[row.kind] += 1;
  return {
    dryRun: flags.dryRun,
    format: parsed.format,
    created,
    duplicates: plan.duplicates,
    rejected: plan.rejected,
    errors: parsed.errors,
    skipped: parsed.skipped,
    droppedFuelFields: parsed.droppedFuelFields,
    encodingReplaced: flags.encodingReplaced,
  };
}

const formatUnits = (units: CsvSourceUnits) =>
  [units.distance, units.quantity].filter((unit) => unit !== null).join(', ');

/** `errors` of the 400 for a result that is not `parsed`: which file or option to change. */
export function csvImportProblemErrors(
  result: Exclude<CsvImportResult, { status: 'parsed' }>,
): { path: string; message: string }[] {
  if (result.status === 'unknown') return [{ path: 'file', message: 'Unrecognized CSV format' }];
  if (result.status === 'needs_options') {
    return result.missing.map((option) => ({
      path: option.startsWith('columns.') ? `mapping.${option}` : option,
      message: 'Required',
    }));
  }
  return [
    {
      path: 'sourceUnits',
      message: `The file units (${formatUnits(result.source)}) differ from the vehicle units (${formatUnits(result.target)})`,
    },
  ];
}
