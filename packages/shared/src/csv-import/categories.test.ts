import { describe, expect, it } from 'vitest';
import { matchMaintenanceCategory } from './categories';

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
