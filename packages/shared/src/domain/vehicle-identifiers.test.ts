import { describe, expect, it } from 'vitest';
import {
  findMatchingVehicles,
  normalizeVehicleIdentifier,
  type VehicleIdentity,
} from './vehicle-identifiers';

const vehicle = (id: string, plate: string | null, vin: string | null): VehicleIdentity => ({
  id,
  name: null,
  make: 'Seat',
  model: id,
  plate,
  vin,
});
const ref = ({ id, name, make, model }: VehicleIdentity) => ({ id, name, make, model });

describe('normalizeVehicleIdentifier', () => {
  it('normalizes plates and VINs', () => {
    expect(normalizeVehicleIdentifier('1234-abc ')).toBe('1234ABC');
    expect(normalizeVehicleIdentifier('1234 ABC')).toBe('1234ABC');
    expect(normalizeVehicleIdentifier('m.1234.ñx')).toBe('M1234ÑX');
    expect(normalizeVehicleIdentifier('vf1 ab-c.d')).toBe('VF1ABCD');
    expect(normalizeVehicleIdentifier(' - . ')).toBeNull();
    expect(normalizeVehicleIdentifier('')).toBeNull();
    expect(normalizeVehicleIdentifier(null)).toBeNull();
  });
});

describe('findMatchingVehicles', () => {
  it('finds vehicles matching by plate or VIN', () => {
    const byPlate = vehicle('by-plate', '1234 abc', null);
    const byVin = vehicle('by-vin', null, 'vf1abcd');
    const both = vehicle('both', '9999-zzz', 'WVW-123');
    const none = vehicle('none', null, null);
    const twice = vehicle('twice', 'DUP 1', null);

    const plateOwner = vehicle('plate-owner', '1234-ABC', 'OTHER');
    const vinOwner = vehicle('vin-owner', 'X', 'VF1 ABCD');
    const bothOwner = vehicle('both-owner', '9999ZZZ', 'wvw123');
    const empty = vehicle('empty', null, ' ');
    const dupA = vehicle('dup-a', 'dup1', null);
    const dupB = vehicle('dup-b', 'DUP-1', null);

    expect(
      findMatchingVehicles(
        [byPlate, byVin, both, none, twice],
        [plateOwner, vinOwner, bothOwner, empty, dupA, dupB],
      ),
    ).toEqual([
      { imported: ref(byPlate), existing: ref(plateOwner), matchedBy: ['plate'] },
      { imported: ref(byVin), existing: ref(vinOwner), matchedBy: ['vin'] },
      { imported: ref(both), existing: ref(bothOwner), matchedBy: ['plate', 'vin'] },
      { imported: ref(twice), existing: ref(dupA), matchedBy: ['plate'] },
      { imported: ref(twice), existing: ref(dupB), matchedBy: ['plate'] },
    ]);
    expect(findMatchingVehicles([none], [empty])).toEqual([]);
    expect(findMatchingVehicles([], [plateOwner])).toEqual([]);
  });
});
