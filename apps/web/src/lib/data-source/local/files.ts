import { detectAttachmentType } from '@ikrive/shared';
import type { AnnexImage } from '@ikrive/shared/sale-report-pdf';
import type { OpenExportSink } from './export-sink';
import { problem } from './problems';
import type { LoadSaleReportPdf } from './sale-report';

/** Where the local `DataSource` keeps its files: the app's private storage on the device, a map in the tests. */
export interface LocalFileStore {
  /** Writes `data` under a new random key `<folder>/<uuid>.<extension>` and returns the key. */
  save(folder: 'attachments' | 'vehicles', data: Uint8Array, extension: string): Promise<string>;
  /** Rejects with `MissingFileError` when there is no file under `key`, with the store's error otherwise. */
  read(key: string, mimeType: string): Promise<Blob>;
  /** No-op when the file does not exist. */
  remove(key: string): Promise<void>;
}

/**
 * What `LocalFileStore.read` rejects with when the file of `key` is not in the store (its row survived a
 * partial wipe of the app's data, for instance), so it can be told apart from any other failure.
 */
export class MissingFileError extends Error {
  constructor(readonly key: string) {
    super(`File does not exist: ${key}`);
    this.name = 'MissingFileError';
  }
}

/** Image processing of the local `DataSource` (canvas on the device instead of the API's `sharp`). */
export interface LocalImages {
  /** Rejects when `data` does not decode as an image. */
  assertDecodable(data: Uint8Array): Promise<void>;
  /** Oriented, ≤ 1600 px, WebP q 0.8. Rejects when it does not decode. */
  toWebpPhoto(data: Uint8Array): Promise<Uint8Array>;
  /** Oriented, ≤ 320 px, WebP q 0.7. */
  toWebpThumbnail(data: Uint8Array): Promise<Uint8Array>;
  /**
   * Invoice image of the sale report: oriented, ≤ 2000 px, JPEG q 0.85 from a JPEG and PNG otherwise.
   * Rejects when it does not decode.
   */
  toAnnexImage(data: Uint8Array, mimeType: string): Promise<AnnexImage>;
}

/** What the local `DataSource` needs from the device besides its database. */
export interface LocalDeps {
  files: LocalFileStore;
  images: LocalImages;
  /** Loads the sale report PDF chunk; `import('./sale-report-pdf')` by default, the Node kit in the tests. */
  saleReportPdf?: LoadSaleReportPdf;
  /**
   * Where the data export writes its zip: a file of the device in the native app
   * (`openDeviceExportSink`), a `Blob` in memory by default (`openMemoryExportSink`).
   */
  exportSink?: OpenExportSink;
}

/** Upload limit of the local mode, the API's default (`maxUploadMb` of its client config). */
export const LOCAL_MAX_UPLOAD_MB = 20;

const LOCAL_SCHEME = 'local://';

/**
 * URL of a vehicle photo. Its version is the same part of the random key the API uses, so it changes
 * with every photo and the cached file of the previous one is never shown.
 */
export const localPhotoUrl = (vehicle: { id: string; photo: string }): string =>
  `${LOCAL_SCHEME}vehicles/${vehicle.id}/photo?v=${vehicle.photo.slice(-13, -5)}`;

/** URL of an attachment of a maintenance record (its thumbnail adds `/thumbnail`). */
export const localAttachmentUrl = (vehicleId: string, recordId: string, attachmentId: string): string =>
  `${LOCAL_SCHEME}vehicles/${vehicleId}/maintenance/${recordId}/attachments/${attachmentId}`;

/** The file a local URL points to. */
export type LocalUrl =
  | { kind: 'photo'; vehicleId: string }
  | { kind: 'attachment' | 'thumbnail'; vehicleId: string; recordId: string; attachmentId: string };

const PHOTO = /^vehicles\/([^/]+)\/photo$/;
const ATTACHMENT = /^vehicles\/([^/]+)\/maintenance\/([^/]+)\/attachments\/([^/]+)(\/thumbnail)?$/;

/** What a local URL points to, ignoring its query (`?v=`, `?inline=1`); `null` for any other URL. */
export function parseLocalUrl(url: string): LocalUrl | null {
  if (!url.startsWith(LOCAL_SCHEME)) return null;
  const path = url.slice(LOCAL_SCHEME.length).split(/[?#]/)[0] ?? '';
  const photo = PHOTO.exec(path);
  if (photo?.[1]) return { kind: 'photo', vehicleId: photo[1] };
  const attachment = ATTACHMENT.exec(path);
  if (attachment?.[1] && attachment[2] && attachment[3]) {
    return {
      kind: attachment[4] ? 'thumbnail' : 'attachment',
      vehicleId: attachment[1],
      recordId: attachment[2],
      attachmentId: attachment[3],
    };
  }
  return null;
}

/**
 * Rejects (500) when a recoded image is not a WebP: an old WebView may fall back to PNG without an error,
 * and a «WebP photo» that is not one would break the export.
 */
export function assertWebp(data: Uint8Array): void {
  if (detectAttachmentType(data)?.mimeType !== 'image/webp') {
    throw problem(500, 'Internal Server Error', 'This device cannot encode WebP images');
  }
}

/** Rejects with the API's 413 (the title `@fastify/multipart` gives) a file over `LOCAL_MAX_UPLOAD_MB`. */
export function assertUploadSize(file: Blob): void {
  if (file.size > LOCAL_MAX_UPLOAD_MB * 1024 * 1024) throw problem(413, 'request file too large');
}

/** The bytes of an uploaded file. */
export async function fileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Removes files whose rows are already gone, one by one. A failure is not reported: the operation has
 * been committed and the UI must show it, so the file is left orphaned.
 */
export async function removeFiles(files: LocalFileStore, keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    await files.remove(key).catch(() => undefined);
  }
}
