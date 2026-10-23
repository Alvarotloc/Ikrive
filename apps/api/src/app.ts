import { join } from 'node:path';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { createAuth } from './auth';
import type { Config } from './config';
import type { Db } from './db/client';
import { createFileStorage } from './lib/storage';
import { createAttachmentsRepository } from './modules/attachments/repository';
import { attachmentsRoutes } from './modules/attachments/routes';
import { createAttachmentsService } from './modules/attachments/service';
import { clientConfigRoutes } from './modules/client-config/routes';
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
import { createSchedulesRepository } from './modules/schedules/repository';
import { schedulesRoutes } from './modules/schedules/routes';
import { createSchedulesService } from './modules/schedules/service';
import { createSettingsRepository } from './modules/settings/repository';
import { settingsRoutes } from './modules/settings/routes';
import { createSettingsService } from './modules/settings/service';
import { createVehiclesRepository } from './modules/vehicles/repository';
import { vehiclesRoutes } from './modules/vehicles/routes';
import { createVehiclesService } from './modules/vehicles/service';
import authPlugin from './plugins/auth';
import errorsPlugin, { problem } from './plugins/errors';
import staticSpa from './plugins/static-spa';

export interface AppDeps {
  config: Config;
  db: Db;
  /** HTTP client for the notification channels; tests replace it so nothing reaches the network. */
  fetch?: typeof globalThis.fetch;
}

export async function buildApp({ config, db, fetch = globalThis.fetch }: AppDeps) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL },
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
  const schedulesService = createSchedulesService({
    repo: schedulesRepo,
    vehicles: vehiclesRepo,
    settings: settingsService,
  });
  const notificationsService = createNotificationsService(createNotificationsRepository(db));
  const notificationChannelsService = createNotificationChannelsService({
    repo: createNotificationChannelsRepository(db),
    dispatcher: createNotificationDispatcher({ db, fetch, baseUrl: config.BASE_URL }),
  });
  const attachmentsService = createAttachmentsService({
    repo: attachmentsRepo,
    maintenance: maintenanceRepo,
    vehicles: vehiclesRepo,
    storage,
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(clientConfigRoutes, { maxUploadMb: config.MAX_UPLOAD_MB });
      await api.register(meRoutes);
      await api.register(settingsRoutes, { service: settingsService });
      await api.register(vehiclesRoutes, { service: vehiclesService });
      await api.register(maintenanceRoutes, { service: maintenanceService });
      await api.register(schedulesRoutes, { service: schedulesService });
      await api.register(attachmentsRoutes, { service: attachmentsService });
      await api.register(notificationsRoutes, { service: notificationsService });
      await api.register(notificationChannelsRoutes, { service: notificationChannelsService });
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

const isApiRequest = (url: string) => url.startsWith('/api/');

export const databasePath = (config: Config) => join(config.DATA_DIR, 'ikrive.db');
export const uploadsPath = (config: Config) => join(config.DATA_DIR, 'uploads');
