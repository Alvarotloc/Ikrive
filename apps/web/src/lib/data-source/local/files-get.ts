import type { DataSource, DownloadedFile } from '../types';
import { isImage, requireAttachment } from './attachments';
import type { LocalDb } from './database';
import { assertWebp, type LocalDeps, parseLocalUrl } from './files';
import { notFound } from './problems';
import type { SerialQueue } from './serial';
import { requireVehicle } from './vehicles';

/** A file to read from the local store: its key, its type and the name to save it with. */
interface StoredFile {
  key: string;
  mimeType: string;
  fileName: string | null;
  thumbnail: boolean;
}

/**
 * `files` of the local `DataSource`: the files behind the local URLs of its DTOs (photo, attachment and
 * thumbnail), following the same vehicle -> record -> attachment chain as the API. Only the lookup of the
 * row goes through `queue`; reading the file and making the thumbnail do not hold the database.
 */
export function localFiles(
  db: LocalDb,
  { files, images }: LocalDeps,
  queue: SerialQueue,
): DataSource['files'] {
  const find = async (url: string): Promise<StoredFile> => {
    const target = parseLocalUrl(url);
    if (!target) throw notFound('Not Found');
    if (target.kind === 'photo') {
      const { photo } = await requireVehicle(db, target.vehicleId);
      if (!photo) throw notFound('This vehicle has no photo');
      return { key: photo, mimeType: 'image/webp', fileName: null, thumbnail: false };
    }
    const row = await requireAttachment(db, target.vehicleId, target.recordId, target.attachmentId);
    if (target.kind === 'attachment') {
      return { key: row.storageKey, mimeType: row.mimeType, fileName: row.originalName, thumbnail: false };
    }
    if (!isImage(row)) throw notFound('Only images have a thumbnail');
    return { key: row.storageKey, mimeType: row.mimeType, fileName: null, thumbnail: true };
  };

  return {
    async get(url): Promise<DownloadedFile> {
      const file = await queue.run(() => find(url));
      const blob = await files.read(file.key, file.mimeType);
      if (!file.thumbnail) return { blob, fileName: file.fileName };
      const thumbnail = await images.toWebpThumbnail(new Uint8Array(await blob.arrayBuffer()));
      assertWebp(thumbnail);
      return { blob: new Blob([thumbnail.slice()], { type: 'image/webp' }), fileName: null };
    },
  };
}
