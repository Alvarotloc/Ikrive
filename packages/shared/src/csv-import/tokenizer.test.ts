import { describe, expect, it } from 'vitest';
import { readCsvDocument } from './tokenizer';

const fieldsOf = (text: string) => readCsvDocument(text).records.map((record) => record.fields);

describe('readCsvDocument', () => {
  it('reads BOM, CRLF and semicolons alike', () => {
    const expected = [
      ['date', 'odo'],
      ['2025-01-01', '100'],
    ];
    expect(fieldsOf('date,odo\n2025-01-01,100\n')).toEqual(expected);
    expect(fieldsOf('﻿date,odo\r\n2025-01-01,100\r\n')).toEqual(expected);
    expect(fieldsOf('date;odo\r\n2025-01-01;100')).toEqual(expected);
    expect(readCsvDocument('a;b;c\n1,5;2,5;3\n').delimiter).toBe(';');
  });

  it('keeps text after a closing quote in the same field', () => {
    expect(fieldsOf('"Filled tank completely" 2,"Third fuel"\n')).toEqual([
      ['Filled tank completely 2', 'Third fuel'],
    ]);
    expect(fieldsOf('"say ""hi""",x\n')).toEqual([['say "hi"', 'x']]);
  });

  it('reports an unclosed quote and resumes on the next line', () => {
    const doc = readCsvDocument('a,b\n1,"broken\n2,ok\n');
    expect(doc.malformed).toEqual([2]);
    expect(doc.records.map((record) => record.line)).toEqual([1, 3]);
    const long = readCsvDocument(`a,b\n1,"${'x'.repeat(4100)}\n2,ok\n`);
    expect(long.malformed).toEqual([2]);
    expect(long.records.map((record) => [record.line, record.fields])).toEqual([
      [1, ['a', 'b']],
      [3, ['2', 'ok']],
    ]);
    const atEnd = readCsvDocument('a,b\n1,2\n3,"never closed');
    expect(atEnd.malformed).toEqual([3]);
    expect(atEnd.records).toHaveLength(2);
  });

  it('numbers records by the physical line where they start', () => {
    const doc = readCsvDocument('a,b\n\n"multi\nline",x\n3,y\n');
    expect(doc.records.map((record) => record.line)).toEqual([1, 3, 5]);
  });
});
