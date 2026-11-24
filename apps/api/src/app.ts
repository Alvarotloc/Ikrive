import { join } from 'node:path';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { createAuth } from './auth';
import type { Config } from './config';
import type { Db } from './db/client';
import { isLocalBaseUrl } from './lib/base-url';
import { isApiRequest } from './lib/http';
import { type LogStream, loggerOptions } from './lib/logging';
import { createFileStorage } from './lib/storage';
import { adminRoutes } from './modules/admin/routes';
import { createAdminUsersRepository } from './modules/admin-users/repository';
import { adminUsersRoutes } from './modules/admin-users/routes';
import { createAdminUsersService } from './modules/admin-users/service';
import { createAttachmentsRepository } from './modules/attachments/repository';
import { attachmentsRoutes } from './modules/attachments/routes';
import { createAttachmentsService } from './modules/attachments/service';
import { createCalendarRepository } from './modules/calendar/repository';
import { calendarFeedRoutes, calendarFeedSettingsRoutes } from './modules/calendar/routes';
import { createCalendarService } from './modules/calendar/service';
import { clientConfigRoutes } from './modules/client-config/routes';
import { createCsvImportRepository } from './modules/csv-import/repository';
import { csvImportRoutes } from './modules/csv-import/routes';
import { createCsvImportService } from './modules/csv-import/service';
import { createDataExportRepository } from './modules/data-export/repository';
import { dataExportRoutes } from './modules/data-export/routes';
import { createDataExportService } from './modules/data-export/service';
import { createDataImportRepository } from './modules/data-import/repository';
import { dataImportRoutes } from './modules/data-import/routes';
import { createDataImportService } from './modules/data-import/service';
import { createFuelLogsRepository } from './modules/fuel-logs/repository';
import { fuelLogsRoutes } from './modules/fuel-logs/routes';
import { createFuelLogsService } from './modules/fuel-logs/service';
import { healthRoutes } from './modules/health/routes';
import { createMaintenanceRepository } from './modules/maintenance/repository';
import { maintenanceRoutes } from './modules/maintenance/routes';
import { createMaintenanceService } from './modules/maintenance/service';
import { meRoutes } from './modules/me/routes';
import { createNotificationDispatcher } from './modules/notification-channels/dispatcher';
import { createNotificationChannelsRepository } from './modules/notification-channels/repository';
import { notificationChannelsRoutes } from './modules/notification-channels/routes';
import { createNotificationChannelsService } from './modules/notification-channels/service';
import { createNotificationsRepository } from './modules/notifications/repository';
import { notificationsRoutes } from './modules/notifications/routes';
import { createNotificationsService } from './modules/notifications/service';
import { createReportSharesRepository } from './modules/report-shares/repository';
import { publicReportRoutes, reportSharesRoutes } from './modules/report-shares/routes';
import { createReportSharesService } from './modules/report-shares/service';
import { reportsRoutes } from './modules/reports/routes';
import { createReportsService } from './modules/reports/service';
import { createSchedulesRepository } from './modules/schedules/repository';
import { schedulesRoutes } from './modules/schedules/routes';
import { createSchedulesService } from './modules/schedules/service';
import { createSettingsRepository } from './modules/settings/repository';
import { settingsRoutes } from './modules/settings/routes';
import { createSettingsService } from './modules/settings/service';
import { statsRoutes } from './modules/stats/routes';
import { createStatsService } from './modules/stats/service';
import { createVehiclesRepository } from './modules/vehicles/repository';
import { vehiclesRoutes } from './modules/vehicles/routes';
import { createVehiclesService } from './modules/vehicles/service';
import authPlugin from './plugins/auth';
import corsPlugin from './plugins/cors';
import errorsPlugin, { problem } from './plugins/errors';
import staticSpa from './plugins/static-spa';

export interface AppDeps {
  config: Config;
  db: Db;
  /** HTTP client for the notification channels; tests replace it so nothing reaches the network. */
  fetch?: typeof globalThis.fetch;
  /** Log destination; tests pass one to inspect the logs (otherwise logging is off under `test`). */
  logStream?: LogStream;
}

export async function buildApp({ config, db, fetch = globalThis.fetch, logStream }: AppDeps) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' && !logStream ? false : loggerOptions(config.LOG_LEVEL, logStream),
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorsPlugin);
  await app.register(helmet, {
    // The SPA is served from the same origin; keep CSP strict but allow inline styles used by UI libs.
    contentSecurityPolicy: {
      directives: { 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:', 'blob:'] },
    },
  });
  // Before the rate limit, so a 429 for an allowed origin also carries CORS and the app can read it.
  await app.register(corsPlugin, { origins: config.TRUSTED_ORIGINS });
  // Only the API is rate limited: SPA static files and the client-route fallback are free,
  // otherwise a few full page loads would exhaust the budget and the app would get 429s.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    allowList: (request) => !isApiRequest(request.url),
  });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

  const auth = createAuth(db, config);
  await app.register(authPlugin, { auth });

  // Composition root: wire repositories -> services -> routes.
  const storage = createFileStorage(uploadsPath(config));
  const settingsService = createSettingsService(createSettingsRepository(db));
  const attachmentsRepo = createAttachmentsRepository(db);
  const vehiclesRepo = createVehiclesRepository(db);
  const maintenanceRepo = createMaintenanceRepository(db);
  const schedulesRepo = createSchedulesRepository(db);
  const fuelLogsRepo = createFuelLogsRepository(db);
  const vehiclesService = createVehiclesService({
    repo: vehiclesRepo,
    storage,
    settings: settingsService,
    attachments: attachmentsRepo,
  });
  const maintenanceService = createMaintenanceService({
    repo: maintenanceRepo,
    vehicles: vehiclesRepo,
    settings: settingsService,
    attachments: attachmentsRepo,
    storage,
    schedules: schedulesRepo,
  });
  const fuelLogsService = createFuelLogsService({
    repo: fuelLogsRepo,
    vehicles: vehiclesRepo,
    settings: settingsService,
  });
  const csvImportService = createCsvImportService({
    repo: createCsvImportRepository(db),
    vehicles: vehiclesRepo,
    fuelLogs: fuelLogsRepo,
    maintenance: maintenanceRepo,
    settings: settingsService,
  });
  const statsService = createStatsService({
    vehicles: vehiclesRepo,
    fuelLogs: fuelLogsRepo,
    maintenance: maintenanceRepo,
  });
  const reportsService = createReportsService({
    vehicles: vehiclesRepo,
    maintenance: maintenanceRepo,
    settings: settingsService,
    attachments: attachmentsRepo,
    storage,
    maxAnnexBytes: config.REPORT_MAX_ANNEX_MB * 1024 * 1024,
  });
  const reportSharesService = createReportSharesService({
    repo: createReportSharesRepository(db),
    vehicles: vehiclesRepo,
    reports: reportsService,
    baseUrl: config.BASE_URL,
  });
  const schedulesService = createSchedulesService({
    repo: schedulesRepo,
    vehicles: vehiclesRepo,
    settings: settingsService,
  });
  const calendarService = createCalendarService({
    repo: createCalendarRepository(db),
    schedules: schedulesRepo,
    vehicles: vehiclesRepo,
    settings: settingsService,
    baseUrl: config.BASE_URL,
  });
  const notificationsService = createNotificationsService(createNotificationsRepository(db));
  // Shared by the channels' test send and the admin job runs, so tests can replace `fetch` once.
  const dispatcher = createNotificationDispatcher({ db, fetch, baseUrl: config.BASE_URL });
  const notificationChannelsService = createNotificationChannelsService({
    repo: createNotificationChannelsRepository(db),
    dispatcher,
  });
  const dataExportService = createDataExportService({
    repo: createDataExportRepository(db),
    settings: settingsService,
    storage,
    log: app.log,
  });
  const importMaxBytes = config.IMPORT_MAX_MB * MIB;
  const dataImportService = createDataImportService({
    repo: createDataImportRepository(db),
    settings: settingsService,
    storage,
    tmpDir: tmpPath(config),
    limits: {
      zipBytes: importMaxBytes,
      totalBytes: importMaxBytes,
      fileBytes: config.MAX_UPLOAD_MB * MIB,
      dataJsonBytes: 32 * MIB,
      entries: 50_000,
    },
    log: app.log,
  });
  const attachmentsService = createAttachmentsService({
    repo: attachmentsRepo,
    maintenance: maintenanceRepo,
    vehicles: vehiclesRepo,
    storage,
  });
  const adminUsersService = createAdminUsersService({
    repo: createAdminUsersRepository(db),
    storage,
    log: app.log,
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(clientConfigRoutes, {
        maxUploadMb: config.MAX_UPLOAD_MB,
        localBaseUrl: isLocalBaseUrl(config.BASE_URL),
      });
      await api.register(meRoutes);
      await api.register(dataExportRoutes, { service: dataExportService });
      await api.register(dataImportRoutes, { service: dataImportService });
      await api.register(settingsRoutes, { service: settingsService });
      await api.register(calendarFeedSettingsRoutes, { service: calendarService });
      await api.register(calendarFeedRoutes, { service: calendarService });
      await api.register(vehiclesRoutes, { service: vehiclesService });
      await api.register(maintenanceRoutes, { service: maintenanceService });
      await api.register(fuelLogsRoutes, { service: fuelLogsService });
      await api.register(csvImportRoutes, { service: csvImportService });
      await api.register(statsRoutes, { service: statsService });
      await api.register(reportsRoutes, { service: reportsService });
      await api.register(reportSharesRoutes, { service: reportSharesService });
      await api.register(publicReportRoutes, { service: reportSharesService });
      await api.register(schedulesRoutes, { service: schedulesService });
      await api.register(attachmentsRoutes, { service: attachmentsService });
      await api.register(notificationsRoutes, { service: notificationsService });
      await api.register(notificationChannelsRoutes, { service: notificationChannelsService });
      await api.register(adminRoutes, { db, dispatcher });
      await api.register(adminUsersRoutes, { service: adminUsersService });
    },
    { prefix: '/api' },
  );

  const spaEnabled = Boolean(config.WEB_DIST_DIR);
  if (config.WEB_DIST_DIR) await app.register(staticSpa, { root: config.WEB_DIST_DIR });

  app.setNotFoundHandler((request, reply) => {
    if (spaEnabled && request.method === 'GET' && !isApiRequest(request.url)) {
      return reply.sendFile('index.html');
    }
    return reply
      .status(404)
      .type('application/problem+json')
      .send(problem(404, 'Not Found', { detail: `Route ${request.method} ${request.url} not found` }));
  });

  return app;
}

const MIB = 1024 * 1024;

export const databasePath = (config: Config) => join(config.DATA_DIR, 'ikrive.db');
export const uploadsPath = (config: Config) => join(config.DATA_DIR, 'uploads');
/** Temporary files of a request (an uploaded import zip), on the same volume as the uploads. */
export const tmpPath = (config: Config) => join(config.DATA_DIR, 'tmp');
