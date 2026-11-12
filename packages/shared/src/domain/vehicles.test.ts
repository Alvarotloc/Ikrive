import { describe, expect, it } from 'vitest';
import { archivedAtAfterUpdate, vehicleStatus } from './vehicles';

describe('vehicleStatus', () => {
  it('sold wins over archived', () => {
    expect(vehicleStatus({ soldAt: '2026-01-01', archivedAt: new Date() })).toBe('sold');
    expect(vehicleStatus({ soldAt: '2026-01-01', archivedAt: null })).toBe('sold');
  });

  it('archived wins over active', () => {
    expect(vehicleStatus({ soldAt: null, archivedAt: new Date() })).toBe('archived');
    expect(vehicleStatus({ soldAt: null, archivedAt: null })).toBe('active');
  });
});

describe('archivedAtAfterUpdate', () => {
  const before = new Date('2026-01-01T00:00:00.000Z');
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('keeps the archive date on re-archive', () => {
    expect(archivedAtAfterUpdate(before, true, now)).toBe(before);
  });

  it('archives now', () => {
    expect(archivedAtAfterUpdate(null, true, now)).toBe(now);
    expect(archivedAtAfterUpdate<string>(null, true, '2026-06-01T00:00:00.000Z')).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('unarchives', () => {
    expect(archivedAtAfterUpdate(before, false, now)).toBeNull();
  });

  it('leaves archivedAt untouched without archived', () => {
    expect(archivedAtAfterUpdate(before, undefined, now)).toBeUndefined();
  });
});
