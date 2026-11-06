import { calendarFeedSchema, calendarFeedSecretSchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError } from '../../lib/errors';
import { currentUser } from '../../plugins/auth';
import type { CalendarService } from './service';

const SETTINGS_PATH = '/settings/calendar-feed';
const ICS_SUFFIX = '.ics';

/** Management of the user's own feed (session required). */
export const calendarFeedSettingsRoutes: FastifyPluginAsyncZod<{ service: CalendarService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(SETTINGS_PATH, { schema: { response: { 200: calendarFeedSchema } } }, async (request) =>
    service.status(currentUser(request).id),
  );

  app.post(SETTINGS_PATH, { schema: { response: { 200: calendarFeedSecretSchema } } }, async (request) =>
    service.enable(currentUser(request).id),
  );

  app.delete(SETTINGS_PATH, async (request, reply) => {
    service.disable(currentUser(request).id);
    return reply.status(204).send();
  });
};

/**
 * Public iCal feed: the token in the URL is the only credential. `:file` instead of `:token.ics`
 * so the route does not depend on how the router treats a dot after a parameter.
 */
export const calendarFeedRoutes: FastifyPluginAsyncZod<{ service: CalendarService }> = async (
  app,
  { service },
) => {
  // Every response, 404s included: a cached 404 would outlive a reactivation or a new token.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'private, no-store');
  });

  app.get(
    '/calendar/:file',
    { schema: { params: z.object({ file: z.string() }) } },
    async (request, reply) => {
      const { file } = request.params;
      if (!file.endsWith(ICS_SUFFIX)) throw new NotFoundError('Calendar feed not found');
      const ics = service.feed(file.slice(0, -ICS_SUFFIX.length));
      return reply.type('text/calendar; charset=utf-8').send(ics);
    },
  );
};
