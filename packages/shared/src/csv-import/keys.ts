import type { CreateExpense } from '../schemas/expenses';
import type { CreateFuelLog } from '../schemas/fuel-logs';
import type { CreateMaintenanceRecord } from '../schemas/maintenance';
import type { CreateOdometerReading } from '../schemas/vehicles';
import type { CsvRow } from './types';

/**
 * Deterministic key built only from normalized fields, so the same record matches across files,
 * formats and rows already stored. Price per unit and category are left out on purpose (a category
 * corrected after importing must not duplicate the row on the next import). A maintenance cost of 0
 * counts as no cost: Fuelio exports 0 for an absent amount, so the formats can only match so.
 */
export function csvRowKey(row: Pick<CsvRow, 'kind' | 'data'>): string {
  if (row.kind === 'odometer') {
    const { date, value } = row.data as CreateOdometerReading;
    return `odometer|${date}|${value}`;
  }
  if (row.kind === 'fuel') {
    const { date, odometer, quantity, totalPrice } = row.data as CreateFuelLog;
    return `fuel|${date}|${odometer}|${quantity.toFixed(3)}|${totalPrice.toFixed(2)}`;
  }
  if (row.kind === 'expense') {
    const { date, title, cost } = row.data as CreateExpense;
    return `expense|${date}|${(title ?? '').trim().toLowerCase()}|${cost.toFixed(2)}`;
  }
  const { date, odometer, title, cost } = row.data as CreateMaintenanceRecord;
  return `maintenance|${date}|${odometer ?? ''}|${title.trim().toLowerCase()}|${cost ? cost.toFixed(2) : ''}`;
}
