import { describe, expect, it } from 'vitest';
import { reportShareStatus } from './report-shares';

const expiresAt = new Date('2026-12-01T10:00:00.000Z');

describe('reportShareStatus', () => {
  it('is active before expiresAt', () => {
    expect(reportShareStatus({ expiresAt, revokedAt: null }, new Date('2026-12-01T09:59:59.999Z'))).toBe(
      'active',
    );
    expect(
      reportShareStatus(
        { expiresAt: expiresAt.toISOString(), revokedAt: null },
        new Date('2026-11-01T00:00:00Z'),
      ),
    ).toBe('active');
  });

  it('is expired at and after expiresAt', () => {
    expect(reportShareStatus({ expiresAt, revokedAt: null }, expiresAt)).toBe('expired');
    expect(reportShareStatus({ expiresAt, revokedAt: null }, new Date('2027-01-01T00:00:00Z'))).toBe(
      'expired',
    );
  });

  it('revoked wins over expired', () => {
    const revokedAt = new Date('2026-11-15T00:00:00Z');
    expect(reportShareStatus({ expiresAt, revokedAt }, new Date('2026-11-20T00:00:00Z'))).toBe('revoked');
    expect(
      reportShareStatus({ expiresAt, revokedAt: revokedAt.toISOString() }, new Date('2027-01-01T00:00:00Z')),
    ).toBe('revoked');
  });
});
