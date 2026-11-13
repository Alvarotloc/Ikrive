import type { Problem } from '@ikrive/shared';
import type { z } from 'zod';
import { ApiError } from '@/lib/api-client';

type ProblemError = NonNullable<Problem['errors']>[number];

/**
 * The `ApiError` the local `DataSource` rejects with: the same RFC 7807 problem the API would answer, so
 * the UI branches on its `status` whatever the implementation.
 */
export function problem(status: number, title: string, detail?: string, errors?: ProblemError[]): ApiError {
  return new ApiError({
    type: 'about:blank',
    title,
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(errors ? { errors } : {}),
  });
}

export const badRequest = (detail: string) => problem(400, 'Bad Request', detail);
export const notFound = (detail: string) => problem(404, 'Not Found', detail);
export const conflict = (detail: string) => problem(409, 'Conflict', detail);

/** An operation that only exists with a server (or that comes in a later version of the local mode). */
export const unsupported = () => problem(501, 'Not Implemented', 'Not available on this device');

/**
 * `value` parsed with `schema` (its output: defaults, transforms), or a 400 `Validation failed` problem
 * with one `{ path, message }` per issue, the path joined with dots as the API reports it.
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw problem(
    400,
    'Validation failed',
    undefined,
    result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  );
}
