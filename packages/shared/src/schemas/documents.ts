import { z } from 'zod';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from '../enums';
import { optionalText } from './common';
import { warnDaysSchema } from './schedules';
import { isoDateSchema } from './vehicles';

const documentFieldsSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  /** Also the title of its reminders, which are not translated. */
  title: z.string().trim().min(1).max(120),
  /** Last valid day; `null` for documents that do not expire (they never remind). */
  expiryDate: isoDateSchema.nullable().default(null),
  /** Days before `expiryDate` from which the document is `expiring`. */
  warnDays: warnDaysSchema.default(30),
  notes: optionalText(2000),
});

export const createVehicleDocumentSchema = documentFieldsSchema;
export type CreateVehicleDocument = z.infer<typeof createVehicleDocumentSchema>;
export type CreateVehicleDocumentInput = z.input<typeof createVehicleDocumentSchema>;

export const updateVehicleDocumentSchema = documentFieldsSchema
  // No defaults here: a partial PATCH must not reset `warnDays` nor clear `expiryDate`.
  .extend({ expiryDate: isoDateSchema.nullable(), warnDays: warnDaysSchema })
  .partial();
export type UpdateVehicleDocument = z.infer<typeof updateVehicleDocumentSchema>;
export type UpdateVehicleDocumentInput = z.input<typeof updateVehicleDocumentSchema>;

export const vehicleDocumentSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  title: z.string(),
  expiryDate: isoDateSchema.nullable(),
  warnDays: z.number().int(),
  notes: z.string().nullable(),
  /** Computed on read from `expiryDate` and `warnDays` in the user's time zone. */
  status: z.enum(DOCUMENT_STATUSES),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type VehicleDocument = z.infer<typeof vehicleDocumentSchema>;

export const vehicleDocumentParamsSchema = z.object({ id: z.string().min(1), documentId: z.string().min(1) });
