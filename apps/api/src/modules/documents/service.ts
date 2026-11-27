import {
  type CreateVehicleDocument,
  documentStatus,
  todayIn,
  type UpdateVehicleDocument,
  type VehicleDocument,
} from '@ikrive/shared';
import { NotFoundError } from '../../lib/errors';
import type { FileStorage } from '../../lib/storage';
import type { AttachmentsRepository } from '../attachments/repository';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { DocumentsRepository, VehicleDocumentRow } from './repository';

interface DocumentsServiceDeps {
  repo: DocumentsRepository;
  vehicles: VehiclesRepository;
  settings: SettingsService;
  attachments: AttachmentsRepository;
  storage: FileStorage;
}

const toDto = ({ createdAt, updatedAt, ...fields }: VehicleDocumentRow, today: string): VehicleDocument => ({
  ...fields,
  status: documentStatus(fields, today),
  createdAt: createdAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
});

export function createDocumentsService({
  repo,
  vehicles,
  settings,
  attachments,
  storage,
}: DocumentsServiceDeps) {
  /** Ownership check: other users' vehicles are reported as missing so their ids are not disclosed. */
  const requireVehicle = (userId: string, vehicleId: string) => {
    if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');
  };

  const requireDocument = (userId: string, vehicleId: string, documentId: string) => {
    requireVehicle(userId, vehicleId);
    const document = repo.find(vehicleId, documentId);
    if (!document) throw new NotFoundError('Document not found');
    return document;
  };

  /** The status is computed for the user's today, in their time zone. */
  const today = (userId: string) => todayIn(settings.get(userId).timezone);

  return {
    list(userId: string, vehicleId: string): VehicleDocument[] {
      requireVehicle(userId, vehicleId);
      const now = today(userId);
      return repo.listByVehicle(vehicleId).map((row) => toDto(row, now));
    },

    get(userId: string, vehicleId: string, documentId: string): VehicleDocument {
      return toDto(requireDocument(userId, vehicleId, documentId), today(userId));
    },

    create(userId: string, vehicleId: string, input: CreateVehicleDocument): VehicleDocument {
      requireVehicle(userId, vehicleId);
      return toDto(repo.create({ ...input, vehicleId }), today(userId));
    },

    update(
      userId: string,
      vehicleId: string,
      documentId: string,
      input: UpdateVehicleDocument,
    ): VehicleDocument {
      const document = requireDocument(userId, vehicleId, documentId);
      return toDto(repo.update(document.id, input), today(userId));
    },

    /** Deletes the document and its attachments: rows in the same transaction, files afterwards. */
    async remove(userId: string, vehicleId: string, documentId: string) {
      const document = requireDocument(userId, vehicleId, documentId);
      const files = attachments.listByEntity('document', document.id).map((row) => row.storageKey);
      repo.delete(document.id);
      for (const key of files) await storage.remove(key);
    },
  };
}

export type DocumentsService = ReturnType<typeof createDocumentsService>;
