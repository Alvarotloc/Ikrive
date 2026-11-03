import { adminUserRoleUpdateSchema, adminUserSchema, idParamSchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import type { AdminUsersService } from './service';

/** Account management, admin only. */
export const adminUsersRoutes: FastifyPluginAsyncZod<{ service: AdminUsersService }> = async (
  app,
  { service },
) => {
  // `preValidation`, not `preHandler`: Fastify validates params and body before `preHandler`, and
  // requests without a session or from a regular user must get 401/403, never a 400.
  app.addHook('preValidation', app.requireAdmin);

  app.get('/admin/users', { schema: { response: { 200: z.array(adminUserSchema) } } }, async (request) =>
    service.list(currentUser(request).id),
  );

  app.put(
    '/admin/users/:id/role',
    {
      schema: { params: idParamSchema, body: adminUserRoleUpdateSchema, response: { 200: adminUserSchema } },
    },
    async (request) => service.setRole(currentUser(request).id, request.params.id, request.body.role),
  );

  app.post(
    '/admin/users/:id/disable',
    { schema: { params: idParamSchema, response: { 200: adminUserSchema } } },
    async (request) => service.disable(currentUser(request).id, request.params.id),
  );

  app.post(
    '/admin/users/:id/enable',
    { schema: { params: idParamSchema, response: { 200: adminUserSchema } } },
    async (request) => service.enable(currentUser(request).id, request.params.id),
  );

  app.delete('/admin/users/:id', { schema: { params: idParamSchema } }, async (request, reply) => {
    await service.remove(currentUser(request).id, request.params.id);
    return reply.status(204).send();
  });
};
