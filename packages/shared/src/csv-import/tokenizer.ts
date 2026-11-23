/** A quote left open stops here, so it cannot swallow the rest of the file. */
const MAX_QUOTED_LENGTH = 4096;
const DELIMITER_SAMPLE_LINES = 10;

type CsvDelimiter = ',' | ';';

export interface CsvRecord {
  /** Physical line (from 1) where the record starts. */
  line: number;
  fields: string[];
}

export interface CsvSection {
  /** Marker without `#`, trimmed and in lower case. */
  name: string;
  line: number;
  /** Records after the marker: the first one is the section header. */
  records: CsvRecord[];
}

export interface CsvDocument {
  delimiter: CsvDelimiter;
  /** Every non-blank record, markers included. */
  records: CsvRecord[];
  /** Records before the first marker; all of them when the file has no sections. */
  preamble: CsvRecord[];
  sections: CsvSection[];
  /** Lines where a quote was never closed. */
  malformed: number[];
}

function detectDelimiter(text: string): CsvDelimiter {
  let commas = 0;
  let semicolons = 0;
  let sampled = 0;
  let start = 0;
  while (start < text.length && sampled < DELIMITER_SAMPLE_LINES) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(start, end);
    start = end + 1;
    if (line.trim() === '') continue;
    sampled += 1;
    let inQuotes = false;
    let atFieldStart = true;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (inQuotes) {
        if (char === '"' && line[index + 1] === '"') index += 1;
        else if (char === '"') inQuotes = false;
      } else if (char === '"' && atFieldStart) {
        inQuotes = true;
        atFieldStart = false;
      } else if (char === ',' || char === ';') {
        if (char === ',') commas += 1;
        else semicolons += 1;
        atFieldStart = true;
      } else {
        atFieldStart = false;
      }
    }
  }
  return semicolons > commas ? ';' : ',';
}

/** Reads a quoted value from its opening quote; `null` if it is not closed within the limit. */
function readQuoted(text: string, open: number): { value: string; end: number; newlines: number } | null {
  let value = '';
  let newlines = 0;
  let index = open + 1;
  while (index < text.length && index - open <= MAX_QUOTED_LENGTH) {
    const char = text[index];
    if (char === '"') {
      if (text[index + 1] !== '"') return { value, end: index + 1, newlines };
      value += '"';
      index += 2;
    } else {
      if (char === '\n') newlines += 1;
      value += char;
      index += 1;
    }
  }
  return null;
}

type RecordRead = { fields: string[] | null; next: number; nextLine: number };

function readRecord(text: string, start: number, startLine: number, delimiter: CsvDelimiter): RecordRead {
  const fields: string[] = [];
  let field = '';
  let position = start;
  let line = startLine;
  let atFieldStart = true;
  while (position < text.length) {
    const char = text[position];
    if (atFieldStart && char === '"') {
      const quoted = readQuoted(text, position);
      if (!quoted) {
        const newline = text.indexOf('\n', position);
        return { fields: null, next: newline === -1 ? text.length : newline + 1, nextLine: line + 1 };
      }
      field += quoted.value;
      line += quoted.newlines;
      position = quoted.end;
      atFieldStart = false;
    } else if (char === delimiter) {
      fields.push(field);
      field = '';
      atFieldStart = true;
      position += 1;
    } else if (char === '\n' || (char === '\r' && text[position + 1] === '\n')) {
      fields.push(field);
      return { fields, next: position + (char === '\n' ? 1 : 2), nextLine: line + 1 };
    } else {
      field += char;
      atFieldStart = false;
      position += 1;
    }
  }
  fields.push(field);
  return { fields, next: position, nextLine: line };
}

const markerName = (fields: string[]): string | null => {
  const first = fields[0]?.trim() ?? '';
  if (!first.startsWith('#') || fields.slice(1).some((field) => field.trim() !== '')) return null;
  return first.replace(/^#+/, '').trim().toLowerCase();
};

/** Tolerant reader: BOM, LF/CRLF, `,` or `;`, text after a closing quote and unclosed quotes. */
export function readCsvDocument(input: string): CsvDocument {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records: CsvRecord[] = [];
  const preamble: CsvRecord[] = [];
  const sections: CsvSection[] = [];
  const malformed: number[] = [];
  let position = 0;
  let line = 1;
  while (position < text.length) {
    const read = readRecord(text, position, line, delimiter);
    if (read.fields === null) {
      malformed.push(line);
    } else if (read.fields.some((field) => field.trim() !== '')) {
      const record = { line, fields: read.fields };
      records.push(record);
      const name = markerName(read.fields);
      const current = sections.at(-1);
      if (name !== null) sections.push({ name, line, records: [] });
      else if (current) current.records.push(record);
      else preamble.push(record);
    }
    position = read.next;
    line = read.nextLine;
  }
  return { delimiter, records, preamble, sections, malformed };
}
