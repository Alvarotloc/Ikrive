import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const STATUSES = ['pending', 'spec_ready', 'in_progress', 'ready_to_merge', 'done', 'blocked'];
/** At most one feature may be in one of these states at a time. */
export const ACTIVE_STATUSES = ['in_progress', 'ready_to_merge'];
/** Statuses where an `sdd` feature must already have its three spec files. */
export const SPEC_STATUSES = ['spec_ready', 'in_progress', 'ready_to_merge', 'done'];
export const SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md'];

export const BASE_FILES = [
  'AGENTS.md',
  'CHECKPOINTS.md',
  'feature_list.json',
  'progress/current.md',
  'progress/history.md',
  'docs/sdd.md',
  'docs/verification.md',
];

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function readFeatureList() {
  return JSON.parse(readFileSync(join(ROOT, 'feature_list.json'), 'utf8'));
}

export function activeFeature(features) {
  return features.find((f) => ACTIVE_STATUSES.includes(f.status));
}

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function validateSpec(feature, errors) {
  const dir = join(ROOT, 'specs', feature.name);
  const label = `#${feature.id} ${feature.name} (${feature.status})`;
  const missing = SPEC_FILES.filter((file) => !existsSync(join(dir, file)));
  if (missing.length > 0) {
    errors.push(`${label}: faltan ${missing.map((f) => `specs/${feature.name}/${f}`).join(', ')}`);
    return;
  }

  const requirements = read(join(dir, 'requirements.md'));
  const tasks = read(join(dir, 'tasks.md'));
  const requirementIds = [...requirements.matchAll(/^##\s+(R\d+)\b/gm)].map((m) => m[1]);
  if (requirementIds.length === 0) {
    errors.push(`${label}: requirements.md no tiene requirements (\`## R1\`, \`## R2\`…)`);
  }
  const referenced = new Set(tasks.match(/\bR\d+\b/g) ?? []);
  const uncovered = requirementIds.filter((id) => !referenced.has(id));
  if (uncovered.length > 0) {
    errors.push(`${label}: ninguna task de tasks.md cubre ${uncovered.join(', ')}`);
  }

  if (feature.status === 'ready_to_merge' || feature.status === 'done') {
    const open = tasks.match(/^\s*- \[ \] T\d+/gm) ?? [];
    if (open.length > 0) {
      errors.push(`${label}: quedan ${open.length} tasks sin marcar en tasks.md`);
    }
    const review = read(join(ROOT, 'progress', `review_${feature.name}.md`));
    if (!review || !/\*\*Veredicto:\*\*\s*APPROVED/.test(review)) {
      errors.push(`${label}: falta progress/review_${feature.name}.md con veredicto APPROVED`);
    }
  }
}

/** Checks that the harness files exist and that feature_list.json and specs/ are coherent. */
export function validateState() {
  const errors = [];
  const warnings = [];

  for (const file of BASE_FILES) {
    if (!existsSync(join(ROOT, file))) errors.push(`Falta el archivo base ${file}`);
  }

  let features;
  try {
    features = readFeatureList().features;
  } catch (error) {
    errors.push(`feature_list.json no es válido: ${error.message}`);
    return { errors, warnings, features: [] };
  }

  const ids = new Set();
  const names = new Set();
  for (const f of features) {
    const label = `#${f.id} ${f.name}`;
    if (!Number.isInteger(f.id)) errors.push(`${label}: \`id\` debe ser un entero`);
    if (ids.has(f.id)) errors.push(`${label}: id duplicado`);
    if (names.has(f.name)) errors.push(`${label}: name duplicado`);
    ids.add(f.id);
    names.add(f.name);
    if (!NAME_PATTERN.test(f.name ?? '')) errors.push(`${label}: \`name\` debe ir en kebab-case`);
    if (!STATUSES.includes(f.status)) errors.push(`${label}: estado inválido "${f.status}"`);
    if (f.sdd && !(Array.isArray(f.acceptance) && f.acceptance.length > 0)) {
      errors.push(`${label}: una feature sdd necesita criterios en \`acceptance\``);
    }
    if (f.sdd && SPEC_STATUSES.includes(f.status)) validateSpec(f, errors);
    if (f.status === 'blocked' && !f.blockedReason) {
      warnings.push(`${label}: está blocked sin \`blockedReason\``);
    }
  }

  const active = features.filter((f) => ACTIVE_STATUSES.includes(f.status));
  if (active.length > 1) {
    errors.push(
      `Hay ${active.length} features activas (${active.map((f) => f.name).join(', ')}); el máximo es 1`,
    );
  }

  return { errors, warnings, features };
}
