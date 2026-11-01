import { buffer } from 'node:stream/consumers';
import { PageSizes, PDFDocument } from 'pdf-lib';
import { type AnnexImage, toAnnexImage } from '../../../lib/images';
import type { FileStorage } from '../../../lib/storage';
import type { AttachmentRow } from '../../attachments/repository';

/** An attachment already read and validated, ready to be appended to the report. */
export type LoadedAnnex = { kind: 'pdf'; doc: PDFDocument } | ({ kind: 'image' } & AnnexImage);

const [A4_WIDTH, A4_HEIGHT] = PageSizes.A4;
const IMAGE_MARGIN = 36;

/**
 * Reads an attachment and prepares it for `appendAnnexes`. Throws when it cannot be appended: missing
 * file, corrupt or encrypted PDF, PDF without pages, or image that does not decode.
 */
export async function loadAnnex(
  row: Pick<AttachmentRow, 'mimeType' | 'storageKey'>,
  storage: FileStorage,
): Promise<LoadedAnnex> {
  const bytes = await buffer(storage.read(row.storageKey));
  if (row.mimeType !== 'application/pdf') return { kind: 'image', ...(await toAnnexImage(bytes)) };

  // Without `ignoreEncryption`, an encrypted PDF throws instead of producing unreadable pages.
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  if (source.getPageCount() === 0) throw new Error('The PDF has no pages');
  // Copied here, so a PDF that loads but cannot be copied is detected before the report is built.
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (const page of await doc.copyPages(source, source.getPageIndices())) doc.addPage(page);
  return { kind: 'pdf', doc };
}

/** Box of the image centred inside `box` (margins already removed), neither distorted nor enlarged. */
export function fitImage(
  image: { width: number; height: number },
  box: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(1, box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/**
 * Appends the annexes after the report pages, in the given order: every page of each PDF, and each
 * image on its own A4 page (landscape when the image is).
 */
export async function appendAnnexes(reportPdf: Buffer, annexes: readonly LoadedAnnex[]): Promise<Buffer> {
  const doc = await PDFDocument.load(reportPdf, { updateMetadata: false });
  for (const annex of annexes) {
    if (annex.kind === 'pdf') {
      for (const page of await doc.copyPages(annex.doc, annex.doc.getPageIndices())) doc.addPage(page);
      continue;
    }
    const image = annex.format === 'jpeg' ? await doc.embedJpg(annex.data) : await doc.embedPng(annex.data);
    const landscape = annex.width > annex.height;
    const page = doc.addPage(landscape ? [A4_HEIGHT, A4_WIDTH] : [A4_WIDTH, A4_HEIGHT]);
    const box = fitImage(annex, {
      width: page.getWidth() - 2 * IMAGE_MARGIN,
      height: page.getHeight() - 2 * IMAGE_MARGIN,
    });
    page.drawImage(image, {
      x: IMAGE_MARGIN + box.x,
      y: IMAGE_MARGIN + box.y,
      width: box.width,
      height: box.height,
    });
  }
  return Buffer.from(await doc.save());
}
