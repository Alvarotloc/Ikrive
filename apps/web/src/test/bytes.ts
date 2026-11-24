import { expect } from 'vitest';

/** Offset of the first byte where `a` and `b` differ (`-1` if they are identical). */
function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

/**
 * Asserts that `actual` holds exactly the bytes of `expected`.
 *
 * `expect(bytes).toEqual(expected)` walks a typed array as a generic object, element by element: ~1.6 s
 * per MB, enough to run a test past its 5 s timeout on a loaded CI. This compares in a plain loop
 * (milliseconds per MB) and, on failure, reports both lengths and the first differing offset instead of
 * a diff of millions of elements. Use it for any byte comparison beyond a few KB.
 */
export function expectSameBytes(actual: Uint8Array | undefined, expected: Uint8Array) {
  expect(actual).toBeInstanceOf(Uint8Array);
  const bytes = actual ?? new Uint8Array();
  expect({ length: bytes.length, firstDifference: firstDifference(bytes, expected) }).toEqual({
    length: expected.length,
    firstDifference: -1,
  });
}
