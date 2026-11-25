import { describe, expect, it } from 'vitest';
import { createExpenseSchema, updateExpenseSchema } from './expenses';

const valid = { date: '2026-05-10', category: 'insurance', cost: 420.5 } as const;

describe('createExpenseSchema', () => {
  it('accepts an expense and turns empty text into null', () => {
    expect(createExpenseSchema.parse({ ...valid, title: '  Seguro anual ', description: '   ' })).toEqual({
      ...valid,
      title: 'Seguro anual',
      description: null,
    });
    expect(createExpenseSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown category, a zero or negative cost and long text', () => {
    const invalid = [
      { ...valid, category: 'car_wash' },
      { ...valid, cost: 0 },
      { ...valid, cost: -5 },
      { ...valid, cost: 1_000_000_001 },
      { date: valid.date, category: valid.category },
      { ...valid, date: '10/05/2026' },
      { ...valid, title: 'x'.repeat(121) },
      { ...valid, description: 'x'.repeat(2001) },
    ];
    for (const input of invalid) expect(createExpenseSchema.safeParse(input).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...valid, title: 'x'.repeat(120) }).success).toBe(true);
  });
});

describe('updateExpenseSchema', () => {
  it('keeps a partial update partial', () => {
    expect(updateExpenseSchema.parse({ cost: 12 })).toEqual({ cost: 12 });
    expect(updateExpenseSchema.parse({})).toEqual({});
    expect(updateExpenseSchema.safeParse({ cost: 0 }).success).toBe(false);
  });
});
