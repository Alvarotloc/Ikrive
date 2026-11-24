import {
  CSV_IMPORT_MAX_BYTES,
  csvImportRequestSchema,
  csvImportSummarySchema,
  idParamSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError, BadRequestError } from '../../lib/errors';
import { receiveToBuffer } from '../../lib/uploads';
import { currentUser } from '../../plugins/auth';
import type { CsvImportService } from './service';

const EXPECTED_FILE = 'Expected a CSV in the "file" field';

/** `options` field of the multipart body: JSON text validated against `csvImportRequestSchema`. */
function parseOptions(field: unknown) {
  let value: unknown = {};
  if (field !== undefined) {
    const text = typeof field === 'object' && field !== null && 'value' in field ? field.value : undefined;
    if (typeof text !== 'string') throw new BadRequestError('The "options" field must be JSON text');
    try {
      value = JSON.parse(text);
    } catch {
      throw new BadRequestError('The "options" field is not valid JSON');
    }
  }
  const result = csvImportRequestSchema.safeParse(value);
  if (result.success) return result.data;
  throw new AppError(
    400,
    'Validation failed',
    'Invalid import options',
    result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  );
}

/** CSV import into one of the user's vehicles (session required): 201 when applied, 200 for a dry run. */
export const csvImportRoutes: FastifyPluginAsyncZod<{ service: CsvImportService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.post(
    '/vehicles/:id/csv-import',
    {
      schema: {
        params: idParamSchema,
        response: { 200: csvImportSummarySchema, 201: csvImportSummarySchema },
      },
    },
    async (request, reply) => {
      // `request.file()` answers 406 to a body that is not multipart; a 400 says what is missing.
      if (!request.isMultipart()) throw new BadRequestError(EXPECTED_FILE);
      // A limit of its own: a CSV is small, whatever `MAX_UPLOAD_MB` allows for attachments.
      const file = await request.file({ limits: { fileSize: CSV_IMPORT_MAX_BYTES, files: 1 } });
      if (file?.fieldname !== 'file') {
        file?.file.resume();
        throw new BadRequestError(EXPECTED_FILE);
      }
      // Over the limit, `toBuffer` throws the 413 of `@fastify/multipart` before the parser runs.
      const bytes = await receiveToBuffer(file);
      // Only the fields sent before the file are known here, hence `options` goes first.
      const options = parseOptions(file.fields.options);
      const summary = service.import(currentUser(request).id, request.params.id, bytes, options);
      return reply.status(summary.dryRun ? 200 : 201).send(summary);
    },
  );
};
