#!/usr/bin/env node
// PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit). Blocks edits to product code unless
// a feature is `in_progress`, and keeps spec-author/reviewer out of product code.
// Exit code 2 blocks the tool call and sends stderr back to Claude.
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { ROOT, readFeatureList } from './lib.mjs';

const PRODUCT_CODE = /^(apps|packages|docker)\//;
const READ_ONLY_AGENTS = ['spec-author', 'reviewer', 'leader'];

function block(message) {
  process.stderr.write(`[harness] ${message}\n`);
  process.exit(2);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (!target) process.exit(0);

const path = relative(ROOT, isAbsolute(target) ? target : resolve(input.cwd ?? ROOT, target));
if (path.startsWith('..') || !PRODUCT_CODE.test(path)) process.exit(0);

if (READ_ONLY_AGENTS.includes(input.agent_type)) {
  block(`El agente ${input.agent_type} no puede editar código de producto (${path}).`);
}

let features;
try {
  features = readFeatureList().features;
} catch {
  block('feature_list.json no se puede leer; arregla el arnés antes de editar código.');
}

const current = features.find((f) => f.status === 'in_progress');
if (!current) {
  block(
    `No hay ninguna feature en in_progress, así que no se puede editar ${path}. ` +
      'Sigue el flujo de docs/sdd.md: crea la feature (skill sdd-new), redacta su spec y espera la ' +
      'aprobación humana. Para un arreglo menor, añade una feature con "sdd": false y pásala a in_progress.',
  );
}
