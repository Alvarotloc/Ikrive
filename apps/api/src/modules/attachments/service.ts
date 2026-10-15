import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import type { Attachment } from '@ikrive/shared';
import { NotFoundError, UnsupportedMediaTypeError } from '../../lib/errors';
import { detectAttachmentType } from '../../lib/file-type';
import { assertDecodableImage, toWebpThumbnail } from '../../lib/images';
import type { FileStorage } from '../../lib/storage';
import type { MaintenanceRepository } from '../maintenance/repository';
import type { VehiclesRepository } from '../vehicles/repository';
import type { AttachmentRow, AttachmentsRepository } from './repository';

interface AttachmentsServiceDeps {
  repo: AttachmentsRepository;
  maintenance: MaintenanceRepository;
  vehicles: VehiclesRepository;
  storage: FileStorage;
}

export interface UploadedFile {
  /** Name declared by the client. */
  filename: string;
  data: Buffer;
}

const FOLDER = 'attachments';
const MAX_NAME_LENGTH = 255;
const UNSUPPORTED = 'Only PDF, JPEG, PNG and WebP files are allowed';

const isImage = (row: Pick<AttachmentRow, 'mimeType'>) => row.mimeType.startsWith('image/');

/** Keeps the base name of the declared file name (no directories), capped to 255 characters. */
export function sanitizeFileName(filename: string, extension: string): string {
  const base = Array.from(filename.split(/[/\\]/).pop()?.trim() ?? '')
    .slice(0, MAX_NAME_LENGTH)
    .join('');
  return base || `file.${extension}`;
}

export function createAttachmentsService({ repo, maintenance, vehicles, storage }: AttachmentsServiceDeps) {
  const toDto = (vehicleId: string, row: AttachmentRow): Attachment => {
    const url = `/api/vehicles/${vehicleId}/maintenance/${row.entityId}/attachments/${row.id}`;
    return {
      id: row.id,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      sha256: row.sha256,
      url,
      thumbnailUrl: isImage(row) ? `${url}/thumbnail` : null,
      createdAt: row.createdAt.toISOString(),
    };
  };

  /** Ownership chain: vehicle -> record -> attachment. Anything not owned is reported as missing. */
  const requireRecord = (userId: string, vehicleId: string, recordId: string) => {
    if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');
    const record = maintenance.find(vehicleId, recordId);
    if (!record) throw new NotFoundError('Maintenance record not found');
    return record;
  };

  const requireAttachment = (userId: string, vehicleId: string, recordId: string, attachmentId: string) => {
    requireRecord(userId, vehicleId, recordId);
    const row = repo.find('maintenance', recordId, attachmentId);
    if (!row || row.ownerId !== userId) throw new NotFoundError('Attachment not found');
    return row;
  };

  return {
    list(userId: string, vehicleId: string, recordId: string): Attachment[] {
      requireRecord(userId, vehicleId, recordId);
      return repo.listByEntity('maintenance', recordId).map((row) => toDto(vehicleId, row));
    },

    async upload(
      userId: string,
      vehicleId: string,
      recordId: string,
      file: UploadedFile,
    ): Promise<Attachment> {
      requireRecord(userId, vehicleId, recordId);
      const type = detectAttachmentType(file.data);
      if (!type) throw new UnsupportedMediaTypeError(UNSUPPORTED);
      if (type.mimeType.startsWith('image/')) {
        await assertDecodableImage(file.data).catch(() => {
          throw new UnsupportedMediaTypeError(UNSUPPORTED);
        });
      }

      const sha256 = createHash('sha256').update(file.data).digest('hex');
      const storageKey = await storage.save(FOLDER, file.data, type.extension);
      try {
        const row = repo.create({
          ownerId: userId,
          entityType: 'maintenance',
          entityId: recordId,
          originalName: sanitizeFileName(file.filename, type.extension),
          mimeType: type.mimeType,
          size: file.data.length,
          sha256,
          storageKey,
        });
        return toDto(vehicleId, row);
      } catch (error) {
        await storage.remove(storageKey);
        throw error;
      }
    },

    open(userId: string, vehicleId: string, recordId: string, attachmentId: string) {
      const row = requireAttachment(userId, vehicleId, recordId, attachmentId);
      return { row, stream: storage.read(row.storageKey) };
    },

    async thumbnail(
      userId: string,
      vehicleId: string,
      recordId: string,
      attachmentId: string,
    ): Promise<Buffer> {
      const row = requireAttachment(userId, vehicleId, recordId, attachmentId);
      if (!isImage(row)) throw new NotFoundError('Only images have a thumbnail');
      return toWebpThumbnail(await buffer(storage.read(row.storageKey)));
    },

    async remove(userId: string, vehicleId: string, recordId: string, attachmentId: string) {
      const row = requireAttachment(userId, vehicleId, recordId, attachmentId);
      repo.delete(row.id);
      await storage.remove(row.storageKey);
    },
  };
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>;
