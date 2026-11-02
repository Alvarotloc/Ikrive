import type { ReportShareStatus } from '../enums';

/**
 * Status of a public link to the sale report at `now`: `revoked` wins over `expired` (what the user
 * did matters more than the clock), and a link is expired from its `expiresAt` instant on.
 */
export function reportShareStatus(
  share: { expiresAt: Date | string; revokedAt: Date | string | null },
  now: Date,
): ReportShareStatus {
  if (share.revokedAt !== null) return 'revoked';
  return now.getTime() >= new Date(share.expiresAt).getTime() ? 'expired' : 'active';
}
