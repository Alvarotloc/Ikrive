/** Parses a whole number typed with any thousands separator ("132.480", "132,480", "132 480"). */
export function parseInteger(text: string): number | null {
  const digits = text.replace(/[\s.,'’]/g, '');
  if (digits === '') return null;
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

/**
 * Parses an amount typed in either Spanish ("1.234,56") or English ("1,234.56") notation.
 * The last separator followed by one or two digits is taken as the decimal one.
 */
export function parseDecimal(text: string): number | null {
  const compact = text.replace(/[\s'’]/g, '');
  if (compact === '') return null;
  const match = /^(.*?)[.,](\d{1,2})$/.exec(compact);
  const [whole, fraction] = match ? [match[1] ?? '', match[2] ?? ''] : [compact, ''];
  const integer = whole.replace(/[.,]/g, '');
  if (!/^\d*$/.test(integer) || (integer === '' && fraction === '')) return Number.NaN;
  return Number(`${integer || '0'}.${fraction || '0'}`);
}
