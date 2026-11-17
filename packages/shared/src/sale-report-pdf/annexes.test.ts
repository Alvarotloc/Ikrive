import { PageSizes, PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { SaleReportAnnexSkip } from '../domain/sale-report';
import { type AnnexImage, type AnnexImageNormalizer, fitImage } from './annexes';
import {
  generateSaleReportPdf,
  type SaleReportAnnexFile,
  type SaleReportPdfDeps,
  type SaleReportPdfInput,
} from './generate';

/** A real 1×1 PNG, so pdf-lib embeds it. */
const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

/** The report pages render with a standard PDF font: these tests are about the annexes. */
const fonts = () => 'Helvetica';

const [A4_WIDTH, A4_HEIGHT] = PageSizes.A4;

/** A PDF of `pages` A5 pages, told apart from the report's A4 ones. */
async function pdfOf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage(PageSizes.A5);
  // Without `addDefaultPage: false`, pdf-lib saves an empty document with one blank page.
  return doc.save({ addDefaultPage: false });
}

const input = (records: SaleReportPdfInput['maintenance'], includeInvoices = true): SaleReportPdfInput => ({
  vehicle: {
    name: null,
    make: 'Seat',
    model: 'León',
    version: null,
    year: 2019,
    fuelType: 'gasoline',
    plate: '1234ABC',
    vin: null,
  },
  readings: [],
  maintenance: records,
  settings: { locale: 'es', currency: 'EUR', distanceUnit: 'km' },
  options: { hidePrices: false, hidePlate: false, hideVin: false, includeInvoices },
  issuedOn: '2026-11-17',
});

const record = (id: string, includeInReport = true) => ({
  id,
  date: '2026-01-10',
  odometer: 45_000,
  category: 'oil_change' as const,
  title: `Registro ${id}`,
  cost: 120,
  includeInReport,
});

const file = (id: string, mimeType: string, size = 1000): SaleReportAnnexFile => ({
  id,
  name: `${id}.${mimeType === 'application/pdf' ? 'pdf' : 'png'}`,
  mimeType,
  size,
  storageKey: `attachments/${id}`,
});

/** Image normalizer that sizes each image by its storage contents (`<width>x<height>`) or rejects `CORRUPT`. */
const fakeNormalizer: AnnexImageNormalizer = async (data) => {
  const text = new TextDecoder().decode(data);
  if (text === 'CORRUPT') throw new Error('The image cannot be decoded');
  const [width = 1, height = 1] = text.split('x').map(Number);
  return { data: PNG_1X1, format: 'png', width, height } satisfies AnnexImage;
};

interface Harness {
  deps: SaleReportPdfDeps;
  reads: string[];
  listed: string[];
  skipped: [string, SaleReportAnnexSkip][];
}

function harness(
  attachments: Record<string, SaleReportAnnexFile[]>,
  contents: Record<string, Uint8Array | Error>,
  maxAnnexBytes = 10_000,
): Harness {
  const reads: string[] = [];
  const listed: string[] = [];
  const skipped: [string, SaleReportAnnexSkip][] = [];
  return {
    reads,
    listed,
    skipped,
    deps: {
      fonts,
      maxAnnexBytes,
      attachmentsOf(recordId) {
        listed.push(recordId);
        return attachments[recordId] ?? [];
      },
      async readAnnex(annex) {
        reads.push(annex.id);
        const content = contents[annex.id];
        if (!content || content instanceof Error) throw content ?? new Error('File does not exist');
        return content;
      },
      toAnnexImage: fakeNormalizer,
      onAnnexSkipped(annex, reason) {
        skipped.push([annex.id, reason]);
      },
    },
  };
}

const text = (value: string) => new TextEncoder().encode(value);

/** Size of every page of a PDF, rounded to points. */
async function pageSizes(pdf: Uint8Array): Promise<[number, number][]> {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((page) => [Math.round(page.getWidth()), Math.round(page.getHeight())]);
}

const A4: [number, number] = [Math.round(A4_WIDTH), Math.round(A4_HEIGHT)];
const A4_LANDSCAPE: [number, number] = [Math.round(A4_HEIGHT), Math.round(A4_WIDTH)];
const A5: [number, number] = [Math.round(PageSizes.A5[0]), Math.round(PageSizes.A5[1])];

describe('sale report annexes', () => {
  it('fits annex images without distortion', () => {
    const box = { width: 500, height: 800 };
    expect(fitImage({ width: 1000, height: 2000 }, box)).toEqual({ x: 50, y: 0, width: 400, height: 800 });
    expect(fitImage({ width: 2000, height: 1000 }, box)).toEqual({ x: 0, y: 275, width: 500, height: 250 });
    expect(fitImage({ width: 100, height: 50 }, box)).toEqual({ x: 200, y: 375, width: 100, height: 50 });
  });

  it('appends every pdf page and each image on its own A4 page in annex order', async () => {
    const { deps } = harness(
      {
        r1: [file('a1', 'application/pdf'), file('a2', 'image/png')],
        r2: [file('a3', 'application/pdf')],
      },
      { a1: await pdfOf(2), a2: text('100x200'), a3: await pdfOf(1) },
    );

    const { fileName, pdf } = await generateSaleReportPdf(input([record('r1'), record('r2')]), deps);

    expect(fileName).toBe('ikrive-seat-leon-2026-11-17.pdf');
    const sizes = await pageSizes(pdf);
    // The report itself fits on one A4 page; then A1 (2 pages), A2 (image) and A3 (1 page).
    expect(sizes).toEqual([A4, A5, A5, A4, A5]);
  });

  it('turns the page landscape for wide images', async () => {
    const { deps } = harness({ r1: [file('a1', 'image/jpeg')] }, { a1: text('3000x1000') });

    const { pdf } = await generateSaleReportPdf(input([record('r1')]), deps);

    expect((await pageSizes(pdf)).slice(1)).toEqual([A4_LANDSCAPE]);
  });

  it('skips unreadable annexes without using the budget', async () => {
    const { deps, skipped } = harness(
      {
        r1: [
          file('missing', 'application/pdf', 600),
          file('corrupt', 'application/pdf', 600),
          file('empty', 'application/pdf', 600),
          file('bad-image', 'image/png', 600),
          file('ok', 'application/pdf', 1000),
        ],
      },
      { corrupt: text('not a pdf'), empty: await pdfOf(0), 'bad-image': text('CORRUPT'), ok: await pdfOf(1) },
      1000,
    );

    const { pdf } = await generateSaleReportPdf(input([record('r1')]), deps);

    expect(skipped).toEqual([
      ['missing', 'unreadable'],
      ['corrupt', 'unreadable'],
      ['empty', 'unreadable'],
      ['bad-image', 'unreadable'],
    ]);
    // 2400 bytes of unreadable files did not use up the 1000-byte budget of the last one.
    expect(await pageSizes(pdf)).toEqual([A4, A5]);
  });

  it('skips annexes over the remaining budget without reading them', async () => {
    const { deps, reads, skipped } = harness(
      {
        r1: [
          file('a1', 'application/pdf', 600),
          file('a2', 'application/pdf', 600),
          file('a3', 'image/png', 400),
        ],
      },
      { a1: await pdfOf(1), a2: await pdfOf(1), a3: text('10x10') },
      1000,
    );

    const { pdf } = await generateSaleReportPdf(input([record('r1')]), deps);

    expect(skipped).toEqual([['a2', 'size_limit']]);
    expect(reads).toEqual(['a1', 'a3']);
    expect(await pageSizes(pdf)).toEqual([A4, A5, A4]);
  });

  it('never reads attachments of excluded records or without includeInvoices', async () => {
    const attachments = { r1: [file('a1', 'application/pdf')], r2: [file('a2', 'application/pdf')] };
    const contents = { a1: await pdfOf(1), a2: await pdfOf(1) };
    const included = harness(attachments, contents);

    const withInvoices = await generateSaleReportPdf(
      input([record('r1'), record('r2', false)]),
      included.deps,
    );

    expect(included.listed).toEqual(['r1']);
    expect(included.reads).toEqual(['a1']);
    expect(await pageSizes(withInvoices.pdf)).toEqual([A4, A5]);

    const without = harness(attachments, contents);
    const noInvoices = await generateSaleReportPdf(input([record('r1'), record('r2')], false), without.deps);

    expect(without.listed).toEqual([]);
    expect(without.reads).toEqual([]);
    expect(await pageSizes(noInvoices.pdf)).toEqual([A4]);
  });
});
