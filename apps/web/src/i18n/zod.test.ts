import { createMaintenanceRecordSchema, userSettingsSchema } from '@ikrive/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import i18n from '@/i18n';

/** The message of the first issue raised by `schema` for `input`. */
function messageFor(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('expected the input to be invalid');
  return result.error.issues[0]?.message;
}

describe('zod messages', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it.each([
    ['an empty required text', z.string().trim().min(1), '   ', 'Este campo es obligatorio.'],
    ['a missing number', z.number(), null, 'Este campo es obligatorio.'],
    ['an empty date', z.iso.date(), '', 'Este campo es obligatorio.'],
    ['a short text', z.string().min(8), 'abc', 'Debe tener al menos 8 caracteres.'],
    ['a long text', z.string().max(60), 'x'.repeat(61), 'No puede superar los 60 caracteres.'],
    ['a text of fixed length', z.string().length(3), 'eu', 'Debe tener exactamente 3 caracteres.'],
    ['a number below the minimum', z.number().min(1886), 1500, 'El valor mínimo es 1886.'],
    ['a number above the maximum', z.number().max(9_999_999), 10_000_000, 'El valor máximo es 9.999.999.'],
    ['a non-number', z.number(), Number.NaN, 'Introduce un número válido.'],
    ['a decimal where an integer is expected', z.number().int(), 1.5, 'Introduce un número entero.'],
    ['an invalid email', z.email(), 'nope', 'Introduce un email válido.'],
    ['an invalid date', z.iso.date(), '2025-13-40', 'Introduce una fecha válida.'],
    ['an unknown option', z.enum(['a', 'b']), 'c', 'Elige una opción válida.'],
    ['any other issue', z.string().regex(/^a/), 'b', 'El valor no es válido.'],
  ])('translates %s into Spanish', (_case, schema, input, message) => {
    expect(messageFor(schema, input)).toBe(message);
  });

  it('follows the active language without reconfiguring zod', async () => {
    const schema = z.string().trim().min(1);
    expect(messageFor(schema, '')).toBe('Este campo es obligatorio.');

    await i18n.changeLanguage('en');
    expect(messageFor(schema, '')).toBe('This field is required.');
    expect(messageFor(z.number().max(9_999_999), 10_000_000)).toBe('The maximum value is 9,999,999.');
  });

  it('applies to the @ikrive/shared schemas too', () => {
    const title = createMaintenanceRecordSchema.shape.title;
    expect(messageFor(title, '')).toBe('Este campo es obligatorio.');
    expect(messageFor(userSettingsSchema.shape.odometerReminderWeekday, 7)).toBe('El valor máximo es 6.');
  });
});
