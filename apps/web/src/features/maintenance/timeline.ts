import { MAINTENANCE_CATEGORIES, type MaintenanceCategory, type MaintenanceRecord } from '@ikrive/shared';

export type CategoryFilter = MaintenanceCategory | 'all';

/** Newest first: by date and, on the same day, by creation time. */
export function sortRecords(records: MaintenanceRecord[]): MaintenanceRecord[] {
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Categories present in the records, in the canonical `MAINTENANCE_CATEGORIES` order. */
export function availableCategories(records: MaintenanceRecord[]): MaintenanceCategory[] {
  const present = new Set(records.map((record) => record.category));
  return MAINTENANCE_CATEGORIES.filter((category) => present.has(category));
}

/** Falls back to `all` when the selected category no longer has records. */
export function resolveFilter(selected: CategoryFilter, available: MaintenanceCategory[]): CategoryFilter {
  return selected === 'all' || available.includes(selected) ? selected : 'all';
}

export function filterRecords(records: MaintenanceRecord[], filter: CategoryFilter): MaintenanceRecord[] {
  return filter === 'all' ? records : records.filter((record) => record.category === filter);
}

/** Sorts the records and groups them by year, newest year first. */
export function groupByYear(records: MaintenanceRecord[]): { year: string; records: MaintenanceRecord[] }[] {
  const groups: { year: string; records: MaintenanceRecord[] }[] = [];
  for (const record of sortRecords(records)) {
    const year = record.date.slice(0, 4);
    const last = groups.at(-1);
    if (last?.year === year) last.records.push(record);
    else groups.push({ year, records: [record] });
  }
  return groups;
}

/** Secondary details of a record (mileage, workshop, cost), skipping the missing ones. */
export function recordDetails(
  record: MaintenanceRecord,
  fmt: { distance(n: number): string; money(n: number): string },
): string[] {
  return [
    record.odometer === null ? null : fmt.distance(record.odometer),
    record.workshop,
    record.cost === null ? null : fmt.money(record.cost),
  ].filter((detail): detail is string => Boolean(detail));
}
