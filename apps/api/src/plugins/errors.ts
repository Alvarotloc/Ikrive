import type { Problem } from '@ikrive/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors';

export function problem(status: number, title: string, extra: Partial<Problem> = {}): Problem {
  return { type: 'about:blank', title, status, ...extra };
}

/** Serializes every error as RFC 7807 problem details. */
export default fp(async (app: FastifyInstance) => {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .status(400)
        .type('application/problem+json')
        .send(
          problem(400, 'Validation failed', {
            errors: error.validation.map((issue) => ({
              path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
              message: issue.message ?? 'Invalid value',
            })),
          }),
        );
    }
    if (error instanceof AppError) {
      return reply
        .status(error.status)
        .type('application/problem+json')
        .send(
          problem(error.status, error.title, {
            type: error.type,
            detail: error.message,
            ...(error.errors ? { errors: error.errors } : {}),
          }),
        );
    }
    const status = typeof error.statusCode === 'number' && error.statusCode < 500 ? error.statusCode : 500;
    if (status >= 500) request.log.error(error);
    return reply
      .status(status)
      .type('application/problem+json')
      .send(problem(status, status >= 500 ? 'Internal Server Error' : error.message));
  });
});
