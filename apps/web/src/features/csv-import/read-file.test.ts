import { CSV_IMPORT_MAX_BYTES } from '@ikrive/shared';
import { describe, expect, it, vi } from 'vitest';
import { readCsvFile } from './read-file';

describe('readCsvFile', () => {
  it('rejects a file over the limit without reading its bytes', async () => {
    const file = new File([new Uint8Array(CSV_IMPORT_MAX_BYTES + 1)], 'big.csv', { type: 'text/csv' });
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');
    const text = vi.spyOn(file, 'text');

    expect(await readCsvFile(file)).toEqual({ status: 'too_large', name: 'big.csv' });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it('decodes a file within the limit and flags invalid UTF-8', async () => {
    const utf8 = await readCsvFile(new File(['﻿Fecha,Km\n2026-01-01,100'], 'ok.csv'));
    expect(utf8).toMatchObject({
      status: 'read',
      name: 'ok.csv',
      text: 'Fecha,Km\n2026-01-01,100',
      encodingReplaced: false,
    });
    expect(utf8.status === 'read' && typeof utf8.csv.parseCsvImport).toBe('function');

    const latin1 = await readCsvFile(new File([new Uint8Array([0x4d, 0xe1, 0x73])], 'latin1.csv'));
    expect(latin1).toMatchObject({ status: 'read', text: 'M�s', encodingReplaced: true });
  });
});
