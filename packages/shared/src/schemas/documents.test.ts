import { describe, expect, it } from 'vitest';
import { createVehicleDocumentSchema, updateVehicleDocumentSchema } from './documents';

const valid = { type: 'insurance', title: 'Póliza', expiryDate: '2027-03-01', warnDays: 15 } as const;

describe('createVehicleDocumentSchema', () => {
  it('defaults warnDays to 30 and expiryDate to null', () => {
    expect(createVehicleDocumentSchema.parse({ type: 'registration', title: '  Permiso ' })).toEqual({
      type: 'registration',
      title: 'Permiso',
      expiryDate: null,
      warnDays: 30,
    });
    expect(createVehicleDocumentSchema.parse({ ...valid, notes: '   ' })).toEqual({ ...valid, notes: null });
  });

  it('rejects an unknown type, an empty or long title, a bad date, out of range warnDays and long notes', () => {
    const invalid = [
      { ...valid, type: 'passport' },
      { ...valid, title: '   ' },
      { ...valid, title: 'x'.repeat(121) },
      { type: valid.type },
      { ...valid, expiryDate: '01/03/2027' },
      { ...valid, warnDays: 1.5 },
      { ...valid, warnDays: -1 },
      { ...valid, warnDays: 366 },
      { ...valid, notes: 'x'.repeat(2001) },
    ];
    for (const input of invalid) expect(createVehicleDocumentSchema.safeParse(input).success).toBe(false);
    expect(
      createVehicleDocumentSchema.safeParse({ ...valid, title: 'x'.repeat(120), warnDays: 365 }).success,
    ).toBe(true);
    expect(createVehicleDocumentSchema.safeParse({ ...valid, warnDays: 0 }).success).toBe(true);
  });
});

describe('updateVehicleDocumentSchema', () => {
  it('keeps a partial update partial', () => {
    expect(updateVehicleDocumentSchema.parse({ title: 'ITV' })).toEqual({ title: 'ITV' });
    expect(updateVehicleDocumentSchema.parse({})).toEqual({});
    expect(updateVehicleDocumentSchema.parse({ expiryDate: null })).toEqual({ expiryDate: null });
    expect(updateVehicleDocumentSchema.safeParse({ warnDays: 400 }).success).toBe(false);
  });
});
