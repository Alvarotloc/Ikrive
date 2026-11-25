import {
  createExpenseSchema,
  expenseParamsSchema,
  expenseSchema,
  idParamSchema,
  updateExpenseSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import type { ExpensesService } from './service';

export const expensesRoutes: FastifyPluginAsyncZod<{ service: ExpensesService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/vehicles/:id/expenses',
    { schema: { params: idParamSchema, response: { 200: z.array(expenseSchema) } } },
    async (request) => service.list(currentUser(request).id, request.params.id),
  );

  app.post(
    '/vehicles/:id/expenses',
    { schema: { params: idParamSchema, body: createExpenseSchema, response: { 201: expenseSchema } } },
    async (request, reply) =>
      reply.status(201).send(service.create(currentUser(request).id, request.params.id, request.body)),
  );

  app.get(
    '/vehicles/:id/expenses/:expenseId',
    { schema: { params: expenseParamsSchema, response: { 200: expenseSchema } } },
    async (request) => {
      const { id, expenseId } = request.params;
      return service.get(currentUser(request).id, id, expenseId);
    },
  );

  app.patch(
    '/vehicles/:id/expenses/:expenseId',
    {
      schema: { params: expenseParamsSchema, body: updateExpenseSchema, response: { 200: expenseSchema } },
    },
    async (request) => {
      const { id, expenseId } = request.params;
      return service.update(currentUser(request).id, id, expenseId, request.body);
    },
  );

  app.delete(
    '/vehicles/:id/expenses/:expenseId',
    { schema: { params: expenseParamsSchema } },
    async (request, reply) => {
      const { id, expenseId } = request.params;
      service.remove(currentUser(request).id, id, expenseId);
      return reply.status(204).send();
    },
  );
};
