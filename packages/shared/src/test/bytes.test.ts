import { describe, expect, it } from 'vitest';
import { expectSameBytes } from './bytes';

describe('expectSameBytes', () => {
  it('passes for the same bytes in different arrays', () => {
    expectSameBytes(new Uint8Array([1, 2, 3]), Uint8Array.from([1, 2, 3]));
    expectSameBytes(new Uint8Array(0), new Uint8Array(0));
  });

  it('reports the first differing offset', () => {
    expect(() => expectSameBytes(new Uint8Array([1, 2, 9, 4]), new Uint8Array([1, 2, 3, 4]))).toThrow(
      /\{ length: 4, firstDifference: 2 \}/,
    );
  });

  it('reports a different length, even when one array is a prefix of the other', () => {
    expect(() => expectSameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toThrow(
      /\{ length: 2, firstDifference: 2 \}/,
    );
  });

  it('fails without bytes', () => {
    expect(() => expectSameBytes(undefined, new Uint8Array(0))).toThrow();
  });

  it('compares a few MB in well under a second', () => {
    const a = new Uint8Array(4 * 1024 * 1024).fill(7);
    const started = performance.now();
    expectSameBytes(a, a.slice());
    expect(performance.now() - started).toBeLessThan(500);
  });
});
