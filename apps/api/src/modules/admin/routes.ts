import { jobRunSummarySchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { isJobName, runJob } from '../../jobs/registry';
import { NotFoundError } from '../../lib/errors';
import type { NotificationDispatcher } from '../notification-channels/dispatcher';

/**
 * Admin-only endpoints. Running a job applies the scheduler's rules (day, user hour, deduplication)
 * and ignores `REMINDERS_ENABLED`, which only controls the scheduler.
 */
export const adminRoutes: FastifyPluginAsyncZod<{ db: Db; dispatcher: NotificationDispatcher }> = async (
  app,
  { db, dispatcher },
) => {
  // Authorization runs before the name check: non-admins cannot probe which jobs exist.
  app.addHook('preHandler', app.requireAdmin);

  app.post(
    '/admin/jobs/:name/run',
    { schema: { params: z.object({ name: z.string() }), response: { 200: jobRunSummarySchema } } },
    async (request) => {
      const { name } = request.params;
      if (!isJobName(name)) throw new NotFoundError(`Unknown job: ${name}`);
      const summary = await runJob(name, { db, dispatcher });
      request.log.info(summary, 'job run by admin');
      return summary;
    },
  );
};
