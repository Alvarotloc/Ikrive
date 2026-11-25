import type { ExpenseCategory, MaintenanceCategory } from '../enums';
import { normalizeText } from './values';

type CategoryWords<C extends string> = readonly (readonly [C, readonly string[]])[];

/** In priority order: the first category with a matching word wins. */
const CATEGORY_WORDS: CategoryWords<MaintenanceCategory> = [
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

/** Expenses that are not refuels nor maintenance; `other` is the fallback, so it has no words. */
const EXPENSE_CATEGORY_WORDS: CategoryWords<ExpenseCategory> = [
  ['insurance', ['insurance', 'seguro', 'poliza', 'policy']],
  ['tax', ['tax', 'impuesto', 'ivtm']],
  ['tolls', ['toll', 'peaje', 'autopista', 'motorway']],
  ['parking', ['parking', 'aparcamiento', 'estacionamiento']],
  ['fines', ['fine', 'multa', 'sancion']],
];

/** Plurals come from the table: trimming the file's word would match unrelated words. */
const formsOf = <C extends string>(table: CategoryWords<C>) =>
  table.map(([category, words]) => [category, words.flatMap(withPlurals)] as const);

const CATEGORY_FORMS = formsOf(CATEGORY_WORDS);
const EXPENSE_CATEGORY_FORMS = formsOf(EXPENSE_CATEGORY_WORDS);

function matchCategory<C extends string>(forms: ReturnType<typeof formsOf<C>>, name: string): C | null {
  const words = new Set(normalizeText(name).split(/[^a-z0-9]+/));
  for (const [category, candidates] of forms) {
    if (candidates.some((candidate) => words.has(candidate))) return category;
  }
  return null;
}

/** Category of a free-text name, compared word by word without case or accents. */
export function matchMaintenanceCategory(name: string): MaintenanceCategory | null {
  return matchCategory(CATEGORY_FORMS, name);
}

/** Expense category of a free-text name, like `matchMaintenanceCategory`; `null` when none matches. */
export function matchExpenseCategory(name: string): ExpenseCategory | null {
  return matchCategory(EXPENSE_CATEGORY_FORMS, name);
}
