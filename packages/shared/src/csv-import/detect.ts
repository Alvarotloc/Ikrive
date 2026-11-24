import { isDrivvoRefuelSection } from './drivvo';
import { isFuelioLogHeader } from './fuelio';
import { lubeLoggerRecordType } from './lubelogger';
import { type CsvDocument, readCsvDocument } from './tokenizer';
import type { CsvFormat } from './types';

export type CsvDetection = { format: Exclude<CsvFormat, 'generic'> | 'unknown'; headers: string[] };

const trimmed = (fields: string[] | undefined) => (fields ?? []).map((field) => field.trim());

export function detectDocument(doc: CsvDocument): CsvDetection {
  if (doc.sections.length > 0) {
    const log = doc.sections.find((section) => section.name === 'log')?.records[0]?.fields;
    if (log && isFuelioLogHeader(trimmed(log))) return { format: 'fuelio', headers: trimmed(log) };
    const refuel = doc.sections.find(isDrivvoRefuelSection);
    if (refuel) return { format: 'drivvo', headers: trimmed(refuel.records[0]?.fields) };
    const firstHeader = doc.preamble[0] ?? doc.sections.find((section) => section.records[0])?.records[0];
    return { format: 'unknown', headers: trimmed(firstHeader?.fields) };
  }
  const headers = trimmed(doc.preamble[0]?.fields);
  return { format: lubeLoggerRecordType(headers) ? 'lubelogger' : 'unknown', headers };
}

export const detectCsvFormat = (text: string): CsvDetection => detectDocument(readCsvDocument(text));
