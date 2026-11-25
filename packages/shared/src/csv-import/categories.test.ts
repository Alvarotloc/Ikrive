import { describe, expect, it } from 'vitest';
import { matchExpenseCategory, matchMaintenanceCategory } from './categories';

describe('matchMaintenanceCategory', () => {
  it('maps category names without case or accents', () => {
    expect(matchMaintenanceCategory('Cambio de ACEITE')).toBe('oil_change');
    expect(matchMaintenanceCategory('Neumático delantero')).toBe('tires');
    expect(matchMaintenanceCategory('Batería')).toBe('battery');
    expect(matchMaintenanceCategory('Reparación')).toBe('repair');
    expect(matchMaintenanceCategory('Revisión')).toBe('other');
    expect(matchMaintenanceCategory('Oil filter')).toBe('oil_change');
    expect(matchMaintenanceCategory('Seguro')).toBeNull();
    expect(matchMaintenanceCategory('Motor')).toBeNull();
  });

  it('matches plural category names', () => {
    expect(matchMaintenanceCategory('Frenos')).toBe('brakes');
    expect(matchMaintenanceCategory('Tires')).toBe('tires');
    expect(matchMaintenanceCategory('Filtros')).toBe('filters');
    expect(matchMaintenanceCategory('Neumáticos')).toBe('tires');
    expect(matchMaintenanceCategory('Reparaciones')).toBe('repair');
    expect(matchMaintenanceCategory('Batteries')).toBe('battery');
    expect(matchMaintenanceCategory('Seguro')).toBeNull();
    expect(matchMaintenanceCategory('Seguros')).toBeNull();
  });
});

describe('matchExpenseCategory', () => {
  it('matches expense categories by word', () => {
    expect(matchExpenseCategory('Seguro')).toBe('insurance');
    expect(matchExpenseCategory('Car insurance')).toBe('insurance');
    expect(matchExpenseCategory('Póliza')).toBe('insurance');
    expect(matchExpenseCategory('Impuesto de circulación')).toBe('tax');
    expect(matchExpenseCategory('IVTM')).toBe('tax');
    expect(matchExpenseCategory('Road TAX')).toBe('tax');
    expect(matchExpenseCategory('Peaje AP-7')).toBe('tolls');
    expect(matchExpenseCategory('Motorway')).toBe('tolls');
    expect(matchExpenseCategory('Parking')).toBe('parking');
    expect(matchExpenseCategory('Aparcamiento')).toBe('parking');
    expect(matchExpenseCategory('Multa')).toBe('fines');
    expect(matchExpenseCategory('Sanción')).toBe('fines');
    // Plurals.
    expect(matchExpenseCategory('Seguros')).toBe('insurance');
    expect(matchExpenseCategory('Taxes')).toBe('tax');
    expect(matchExpenseCategory('Peajes')).toBe('tolls');
    expect(matchExpenseCategory('Tolls')).toBe('tolls');
    expect(matchExpenseCategory('Multas')).toBe('fines');
    expect(matchExpenseCategory('Fines')).toBe('fines');
    expect(matchExpenseCategory('Sanciones')).toBe('fines');
    expect(matchExpenseCategory('Policies')).toBe('insurance');
    // No match: the caller falls back to `other`.
    expect(matchExpenseCategory('Lavado')).toBeNull();
    expect(matchExpenseCategory('Taxi')).toBeNull();
    expect(matchExpenseCategory('')).toBeNull();
  });
});
