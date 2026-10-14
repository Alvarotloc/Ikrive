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
import { healthRoutes } from './modules/health/routes';
import { meRoutes } from './modules/me/routes';
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
}

export async function buildApp({ config, db }: AppDeps) {
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
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

  const auth = createAuth(db, config);
  await app.register(authPlugin, { auth });

  // Composition root: wire repositories -> services -> routes.
  const storage = createFileStorage(uploadsPath(config));
  const settingsService = createSettingsService(createSettingsRepository(db));
  const vehiclesService = createVehiclesService({
    repo: createVehiclesRepository(db),
    storage,
    settings: settingsService,
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(meRoutes);
      await api.register(settingsRoutes, { service: settingsService });
      await api.register(vehiclesRoutes, { service: vehiclesService });
    },
    { prefix: '/api' },
  );

  const spaEnabled = Boolean(config.WEB_DIST_DIR);
  if (config.WEB_DIST_DIR) await app.register(staticSpa, { root: config.WEB_DIST_DIR });

  app.setNotFoundHandler((request, reply) => {
    if (spaEnabled && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply
      .status(404)
      .type('application/problem+json')
      .send(problem(404, 'Not Found', { detail: `Route ${request.method} ${request.url} not found` }));
  });

  return app;
}

export const databasePath = (config: Config) => join(config.DATA_DIR, 'ikrive.db');
export const uploadsPath = (config: Config) => join(config.DATA_DIR, 'uploads');
