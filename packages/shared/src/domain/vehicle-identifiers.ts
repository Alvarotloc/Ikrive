import type { ImportedVehicleMatch } from '../schemas/data-import';

/** What identifies a vehicle when looking for the same one in two lists. */
export interface VehicleIdentity {
  id: string;
  name: string | null;
  make: string;
  model: string;
  plate: string | null;
  vin: string | null;
}

/**
 * Plate or VIN in a comparable form: upper case and only Unicode letters and digits (no
 * transliteration, `Ñ` ≠ `N`). `null` when nothing is left.
 */
export function normalizeVehicleIdentifier(value: string | null): string | null {
  if (value === null) return null;
  return value.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '') || null;
}

const ref = ({ id, name, make, model }: VehicleIdentity) => ({ id, name, make, model });

/**
 * One entry per (imported, existing) pair whose normalized plate or VIN match, with the fields that
 * match. In the order of `imported`, then of `existing`. A missing value never matches.
 */
export function findMatchingVehicles(
  imported: VehicleIdentity[],
  existing: VehicleIdentity[],
): ImportedVehicleMatch[] {
  const keyed = existing.map((vehicle) => ({
    vehicle,
    plate: normalizeVehicleIdentifier(vehicle.plate),
    vin: normalizeVehicleIdentifier(vehicle.vin),
  }));
  const matches: ImportedVehicleMatch[] = [];
  for (const vehicle of imported) {
    const plate = normalizeVehicleIdentifier(vehicle.plate);
    const vin = normalizeVehicleIdentifier(vehicle.vin);
    for (const other of keyed) {
      const matchedBy: ImportedVehicleMatch['matchedBy'] = [];
      if (plate !== null && plate === other.plate) matchedBy.push('plate');
      if (vin !== null && vin === other.vin) matchedBy.push('vin');
      if (matchedBy.length > 0)
        matches.push({ imported: ref(vehicle), existing: ref(other.vehicle), matchedBy });
    }
  }
  return matches;
}
