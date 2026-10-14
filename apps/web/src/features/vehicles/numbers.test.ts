import { describe, expect, it } from 'vitest';
import { parseDecimal, parseInteger } from './numbers';

describe('parseInteger', () => {
  it.each([
    ['', null],
    ['132480', 132_480],
    ['132.480', 132_480],
    ['132,480', 132_480],
    ['132 480', 132_480],
    ['12a', Number.NaN],
    ['-5', Number.NaN],
  ])('%j -> %s', (input, expected) => {
    expect(parseInteger(input)).toBe(expected);
  });
});

describe('parseDecimal', () => {
  it.each([
    ['', null],
    ['15000', 15_000],
    ['15.000', 15_000],
    ['1.234,56', 1_234.56],
    ['1,234.56', 1_234.56],
    ['99,9', 99.9],
    ['0.5', 0.5],
    ['abc', Number.NaN],
  ])('%j -> %s', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });
});
