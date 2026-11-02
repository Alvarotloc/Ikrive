import {
  type CreateReportShare,
  createReportShareSchema,
  type ReportShare,
  type ReportShareSecret,
  reportShareStatus,
} from '@ikrive/shared';
import type { FastifyBaseLogger } from 'fastify';
import { NotFoundError } from '../../lib/errors';
import { generateFeedToken, hashVerifier, parseFeedToken, verifierMatches } from '../../lib/tokens';
import type { ReportsService } from '../reports/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { ReportShareRow, ReportSharesRepository } from './repository';

interface ReportSharesServiceDeps {
  repo: ReportSharesRepository;
  vehicles: VehiclesRepository;
  reports: ReportsService;
  /** Public URL of the server: the link's URL is built on it. */
  baseUrl: string;
}

const DAY_MS = 86_400_000;

const optionsOf = (share: ReportShareRow) => ({
  hidePrices: share.hidePrices,
  hidePlate: share.hidePlate,
  hideVin: share.hideVin,
  includeInvoices: share.includeInvoices,
});

const toReportShare = (share: ReportShareRow, now: Date): ReportShare => ({
  id: share.id,
  ...optionsOf(share),
  expiresAt: share.expiresAt.toISOString(),
  revokedAt: share.revokedAt?.toISOString() ?? null,
  createdAt: share.createdAt.toISOString(),
  status: reportShareStatus(share, now),
});

export function createReportSharesService({ repo, vehicles, reports, baseUrl }: ReportSharesServiceDeps) {
  const requireVehicle = (userId: string, vehicleId: string) => {
    if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');
  };

  return {
    /** New public link; its token is only returned here, inside `url`. */
    create(userId: string, vehicleId: string, input: CreateReportShare, now = new Date()): ReportShareSecret {
      requireVehicle(userId, vehicleId);
      const { expiresInDays, ...options } = createReportShareSchema.parse(input);
      const { token, selector, verifier } = generateFeedToken();
      const row = repo.create({
        vehicleId,
        selector,
        verifierHash: hashVerifier(verifier),
        ...options,
        expiresAt: new Date(now.getTime() + expiresInDays * DAY_MS),
        createdAt: now,
      });
      return { ...toReportShare(row, now), url: new URL(`/api/public/reports/${token}`, baseUrl).href };
    },

    list(userId: string, vehicleId: string, now = new Date()): ReportShare[] {
      requireVehicle(userId, vehicleId);
      return repo.listByVehicle(vehicleId).map((share) => toReportShare(share, now));
    },

    /** Idempotent: an already revoked link keeps its first `revokedAt`. Expired links can be revoked. */
    revoke(userId: string, vehicleId: string, shareId: string, now = new Date()) {
      requireVehicle(userId, vehicleId);
      const share = repo.find(vehicleId, shareId);
      if (!share) throw new NotFoundError('Report share not found');
      if (share.revokedAt === null) repo.revoke(share.id, now);
    },

    /**
     * Sale report of a public link, rendered now with the link's options and the vehicle's current
     * data. Every failure (malformed, unknown selector, wrong verifier, expired, revoked) is the same
     * 404, so a caller cannot tell which part was wrong.
     */
    async render(token: string, log: FastifyBaseLogger, now = new Date()) {
      const parsed = parseFeedToken(token);
      const row = parsed && repo.findBySelector(parsed.selector);
      if (
        !parsed ||
        !row ||
        !verifierMatches(parsed.verifier, row.share.verifierHash) ||
        reportShareStatus(row.share, now) !== 'active'
      ) {
        throw new NotFoundError('Report not found');
      }
      return reports.generate(row.ownerId, row.share.vehicleId, optionsOf(row.share), log);
    },
  };
}

export type ReportSharesService = ReturnType<typeof createReportSharesService>;
