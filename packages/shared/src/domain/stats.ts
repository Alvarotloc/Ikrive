import type { MaintenanceCategory } from '../enums';
import type { VehicleStats } from '../schemas/stats';
import {
  averageDistancePerMonth,
  averageDistancePerYear,
  byDateThenValue,
  type OdometerPoint,
} from './odometer';

export interface StatsFuelLog {
  date: string;
  odometer: number;
  quantity: number;
  totalPrice: number;
  fullTank: boolean;
  missedPrevious: boolean;
}

export interface StatsMaintenanceRecord {
  date: string;
  category: MaintenanceCategory;
  cost: number | null;
}

export interface VehicleStatsInput {
  purchasePrice: number | null;
  readings: readonly OdometerPoint[];
  fuelLogs: readonly StatsFuelLog[];
  maintenance: readonly StatsMaintenanceRecord[];
}

export type ConsumptionSegment = VehicleStats['series']['consumptionBySegment'][number];
export type DistanceByMonth = VehicleStats['series']['distanceByMonth'][number];
export type SpendingByMonth = VehicleStats['series']['spendingByMonth'][number];
export type SpendingByCategory = VehicleStats['spending']['byCategory'][number];

const DAY_MS = 86_400_000;

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Rounds an amount to cents, so float sums (10.1 + 20.2) do not leak into the results. */
export const roundMoney = (value: number) => round(value, 2);

/** The only division of the module: null when the denominator is not positive or the result is not finite. */
const ratio = (numerator: number, denominator: number): number | null => {
  if (!(denominator > 0)) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
};

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

const sortReadings = (readings: readonly OdometerPoint[]) => [...readings].sort(byDateThenValue);

/** By date and odometer; `sort` is stable, so the input order breaks the remaining ties. */
const sortFuelLogs = (logs: readonly StatsFuelLog[]) =>
  [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer);

const withCost = (records: readonly StatsMaintenanceRecord[]) =>
  records.filter((record): record is StatsMaintenanceRecord & { cost: number } => record.cost !== null);

const monthOf = (date: string) => date.slice(0, 7);

/** Months from `first` to `last` (`YYYY-MM`, both included), without gaps. */
function monthRange(first: string, last: string): string[] {
  const months: string[] = [];
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  for (let current = first; current <= last; ) {
    months.push(current);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    current = `${year}-${String(month).padStart(2, '0')}`;
  }
  return months;
}

/** Last reading minus the first one, or null with fewer than two readings. */
export function distanceDriven(readings: readonly OdometerPoint[]): number | null {
  if (readings.length < 2) return null;
  const sorted = sortReadings(readings);
  return (sorted[sorted.length - 1] as OdometerPoint).value - (sorted[0] as OdometerPoint).value;
}

/**
 * Distance per month from the month of the first reading to the month of the last one. The odometer
 * is interpolated linearly by days on the 1st of each month and rounded there, so every month is the
 * difference between two boundaries and the series adds up to the distance driven.
 */
export function distanceByMonth(readings: readonly OdometerPoint[]): DistanceByMonth[] {
  if (readings.length < 2) return [];
  const sorted = sortReadings(readings);
  const first = sorted[0] as OdometerPoint;
  const last = sorted[sorted.length - 1] as OdometerPoint;
  const months = monthRange(monthOf(first.date), monthOf(last.date));

  /** Odometer on a date strictly after the first reading and not after the last one. */
  const odometerOn = (date: string) => {
    const index = sorted.findIndex((reading) => reading.date >= date);
    const after = sorted[index] as OdometerPoint;
    const before = sorted[index - 1] as OdometerPoint;
    const span = Date.parse(after.date) - Date.parse(before.date);
    const elapsed = Date.parse(date) - Date.parse(before.date);
    return Math.round(before.value + ((after.value - before.value) * elapsed) / span);
  };

  const boundaries = [first.value, ...months.slice(1).map((month) => odometerOn(`${month}-01`)), last.value];
  return months.map((month, index) => ({
    month,
    distance: (boundaries[index + 1] as number) - (boundaries[index] as number),
  }));
}

interface RawSegment {
  startDate: string;
  endDate: string;
  distance: number;
  quantity: number;
}

/**
 * Segments between consecutive full tanks. The quantity adds the refuels after the opening full tank
 * up to the closing one; segments with a missed refuel or without distance are left out.
 */
function rawSegments(logs: readonly StatsFuelLog[]): RawSegment[] {
  const segments: RawSegment[] = [];
  let start: StatsFuelLog | null = null;
  let quantity = 0;
  let missed = false;
  for (const log of sortFuelLogs(logs)) {
    if (start === null) {
      // Partial refuels before the first full tank cannot be measured.
      if (log.fullTank) start = log;
      continue;
    }
    quantity += log.quantity;
    missed ||= log.missedPrevious;
    if (!log.fullTank) continue;
    const distance = log.odometer - start.odometer;
    if (!missed && distance > 0) {
      segments.push({ startDate: start.date, endDate: log.date, distance, quantity });
    }
    start = log;
    quantity = 0;
    missed = false;
  }
  return segments;
}

/** Consumption per 100 units of distance of each valid segment between full tanks. */
export function consumptionSegments(logs: readonly StatsFuelLog[]): ConsumptionSegment[] {
  return rawSegments(logs).flatMap((segment) => {
    const consumption = ratio(segment.quantity * 100, segment.distance);
    return consumption === null
      ? []
      : [{ ...segment, quantity: round(segment.quantity, 3), consumption: round(consumption, 2) }];
  });
}

/** Average consumption weighted by distance (Σ quantity / Σ distance × 100), or null without segments. */
export function averageConsumption(logs: readonly StatsFuelLog[]): number | null {
  const segments = rawSegments(logs);
  const average = ratio(
    sum(segments.map((segment) => segment.quantity)) * 100,
    sum(segments.map((segment) => segment.distance)),
  );
  return average === null ? null : round(average, 2);
}

/** Amount per unit of distance, rounded to 3 decimals, or null without distance. */
export function costPerDistance(total: number, distance: number | null): number | null {
  const cost = distance === null ? null : ratio(total, distance);
  return cost === null ? null : round(cost, 3);
}

/** Maintenance cost per category (records without a cost are skipped), highest total first. */
export function spendingByCategory(records: readonly StatsMaintenanceRecord[]): SpendingByCategory[] {
  const totals = new Map<MaintenanceCategory, number>();
  for (const record of withCost(records)) {
    totals.set(record.category, (totals.get(record.category) ?? 0) + record.cost);
  }
  return [...totals]
    .map(([category, total]) => ({ category, total: roundMoney(total) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Fuel and maintenance spending per month, from the first to the last month with a refuel or a
 * maintenance with a cost, with 0 in the months in between without spending.
 */
export function spendingByMonth(
  logs: readonly StatsFuelLog[],
  records: readonly StatsMaintenanceRecord[],
): SpendingByMonth[] {
  const costs = withCost(records);
  const months = [...logs, ...costs].map((entry) => monthOf(entry.date)).sort();
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) return [];
  const totals = new Map(monthRange(first, last).map((month) => [month, { fuel: 0, maintenance: 0 }]));
  for (const log of logs) {
    const month = totals.get(monthOf(log.date));
    if (month) month.fuel += log.totalPrice;
  }
  for (const record of costs) {
    const month = totals.get(monthOf(record.date));
    if (month) month.maintenance += record.cost;
  }
  return [...totals].map(([month, { fuel, maintenance }]) => ({
    month,
    fuel: roundMoney(fuel),
    maintenance: roundMoney(maintenance),
  }));
}

/** Every statistic of a vehicle, in the units and currency the data was stored in. */
export function computeVehicleStats({
  purchasePrice,
  readings,
  fuelLogs,
  maintenance,
}: VehicleStatsInput): VehicleStats {
  const driven = distanceDriven(readings);
  const fuel = sum(fuelLogs.map((log) => log.totalPrice));
  const maintenanceCost = sum(withCost(maintenance).map((record) => record.cost));
  return {
    distance: {
      driven,
      perYear: averageDistancePerYear(readings),
      perMonth: averageDistancePerMonth(readings),
    },
    consumption: { average: averageConsumption(fuelLogs) },
    costPerDistance: {
      fuel: costPerDistance(fuel, driven),
      maintenance: costPerDistance(maintenanceCost, driven),
    },
    spending: {
      purchase: purchasePrice === null ? null : roundMoney(purchasePrice),
      fuel: roundMoney(fuel),
      maintenance: roundMoney(maintenanceCost),
      total: roundMoney((purchasePrice ?? 0) + fuel + maintenanceCost),
      byCategory: spendingByCategory(maintenance),
    },
    series: {
      distanceByMonth: distanceByMonth(readings),
      consumptionBySegment: consumptionSegments(fuelLogs),
      spendingByMonth: spendingByMonth(fuelLogs, maintenance),
    },
  };
}
