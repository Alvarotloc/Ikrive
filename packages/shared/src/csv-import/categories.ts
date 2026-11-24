import type { MaintenanceCategory } from '../enums';
import { normalizeText } from './values';

/** In priority order: the first category with a matching word wins. */
const CATEGORY_WORDS: readonly (readonly [MaintenanceCategory, readonly string[]])[] = [
  ['oil_change', ['oil', 'aceite']],
  ['tires', ['tire', 'tyre', 'neumatico', 'rueda']],
  ['brakes', ['brake', 'freno', 'pastilla']],
  ['inspection', ['inspection', 'itv', 'mot']],
  ['filters', ['filter', 'filtro']],
  ['battery', ['battery', 'bateria']],
  ['repair', ['repair', 'reparacion', 'averia']],
  ['other', ['service', 'maintenance', 'mantenimiento', 'revision', 'taller']],
];

const withPlurals = (word: string) => [
  word,
  `${word}s`,
  `${word}es`,
  ...(word.endsWith('y') ? [`${word.slice(0, -1)}ies`] : []),
];

/** Plurals come from the table: trimming the file's word would match unrelated words. */
const CATEGORY_FORMS = CATEGORY_WORDS.map(
  ([category, words]) => [category, words.flatMap(withPlurals)] as const,
);

/** Category of a free-text name, compared word by word without case or accents. */
export function matchMaintenanceCategory(name: string): MaintenanceCategory | null {
  const words = new Set(normalizeText(name).split(/[^a-z0-9]+/));
  for (const [category, candidates] of CATEGORY_FORMS) {
    if (candidates.some((candidate) => words.has(candidate))) return category;
  }
  return null;
}
