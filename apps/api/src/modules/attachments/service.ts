import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import {
  type Attachment,
  type AttachmentEntityType,
  detectAttachmentType,
  sanitizeFileName,
} from '@ikrive/shared';
import { NotFoundError, UnsupportedMediaTypeError } from '../../lib/errors';
import { assertDecodableImage, toWebpThumbnail } from '../../lib/images';
import type { FileStorage } from '../../lib/storage';
import type { DocumentsRepository } from '../documents/repository';
import type { MaintenanceRepository } from '../maintenance/repository';
import type { VehiclesRepository } from '../vehicles/repository';
import type { AttachmentRow, AttachmentsRepository } from './repository';

interface AttachmentsServiceDeps {
  repo: AttachmentsRepository;
  maintenance: MaintenanceRepository;
  documents: DocumentsRepository;
  vehicles: VehiclesRepository;
  storage: FileStorage;
}

/** The entity that owns some attachments: a maintenance record or a document of a vehicle. */
export interface AttachmentParent {
  entityType: AttachmentEntityType;
  vehicleId: string;
  entityId: string;
}

/** Path segment of each parent in the attachment URLs. */
const SEGMENTS: Record<AttachmentEntityType, string> = { maintenance: 'maintenance', document: 'documents' };

export interface UploadedFile {
  /** Name declared by the client. */
  filename: string;
  data: Buffer;
}

const FOLDER = 'attachments';
const UNSUPPORTED = 'Only PDF, JPEG, PNG and WebP files are allowed';

const isImage = (row: Pick<AttachmentRow, 'mimeType'>) => row.mimeType.startsWith('image/');

export function createAttachmentsService({
  repo,
  maintenance,
  documents,
  vehicles,
  storage,
}: AttachmentsServiceDeps) {
  const toDto = (parent: AttachmentParent, row: AttachmentRow): Attachment => {
    const url = `/api/vehicles/${parent.vehicleId}/${SEGMENTS[parent.entityType]}/${row.entityId}/attachments/${row.id}`;
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

  /** Ownership chain: vehicle -> record or document -> attachment. Anything not owned is reported as missing. */
  const requireParent = (userId: string, { entityType, vehicleId, entityId }: AttachmentParent) => {
    if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');
    if (entityType === 'maintenance') {
      if (!maintenance.find(vehicleId, entityId)) throw new NotFoundError('Maintenance record not found');
    } else if (!documents.find(vehicleId, entityId)) {
      throw new NotFoundError('Document not found');
    }
  };

  const requireAttachment = (userId: string, parent: AttachmentParent, attachmentId: string) => {
    requireParent(userId, parent);
    const row = repo.find(parent.entityType, parent.entityId, attachmentId);
    if (!row || row.ownerId !== userId) throw new NotFoundError('Attachment not found');
    return row;
  };

  return {
    list(userId: string, parent: AttachmentParent): Attachment[] {
      requireParent(userId, parent);
      return repo.listByEntity(parent.entityType, parent.entityId).map((row) => toDto(parent, row));
    },

    async upload(userId: string, parent: AttachmentParent, file: UploadedFile): Promise<Attachment> {
      requireParent(userId, parent);
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
          entityType: parent.entityType,
          entityId: parent.entityId,
          originalName: sanitizeFileName(file.filename, type.extension),
          mimeType: type.mimeType,
          size: file.data.length,
          sha256,
          storageKey,
        });
        return toDto(parent, row);
      } catch (error) {
        await storage.remove(storageKey);
        throw error;
      }
    },

    open(userId: string, parent: AttachmentParent, attachmentId: string) {
      const row = requireAttachment(userId, parent, attachmentId);
      return { row, stream: storage.read(row.storageKey) };
    },

    async thumbnail(userId: string, parent: AttachmentParent, attachmentId: string): Promise<Buffer> {
      const row = requireAttachment(userId, parent, attachmentId);
      if (!isImage(row)) throw new NotFoundError('Only images have a thumbnail');
      return toWebpThumbnail(await buffer(storage.read(row.storageKey)));
    },

    async remove(userId: string, parent: AttachmentParent, attachmentId: string) {
      const row = requireAttachment(userId, parent, attachmentId);
      repo.delete(row.id);
      await storage.remove(row.storageKey);
    },
  };
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>;
