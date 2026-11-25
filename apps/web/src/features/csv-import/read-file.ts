import { CSV_IMPORT_MAX_BYTES } from '@ikrive/shared';

/** The file picker offers CSV files; the extension stays for file managers that do not know `text/csv`. */
export const CSV_ACCEPT = '.csv,text/csv';

/** The parser module, loaded only on the import screen. */
export type CsvImportModule = typeof import('@ikrive/shared/csv-import');

export type CsvFileRead =
  | { status: 'too_large'; name: string }
  | { status: 'read'; name: string; text: string; encodingReplaced: boolean; csv: CsvImportModule };

/** Checks the size before touching the bytes; only then loads the parser chunk and decodes. */
export async function readCsvFile(file: File): Promise<CsvFileRead> {
  if (file.size > CSV_IMPORT_MAX_BYTES) return { status: 'too_large', name: file.name };
  const [csv, buffer] = await Promise.all([import('@ikrive/shared/csv-import'), file.arrayBuffer()]);
  const { text, replaced } = csv.decodeCsv(new Uint8Array(buffer));
  return { status: 'read', name: file.name, text, encodingReplaced: replaced, csv };
}
