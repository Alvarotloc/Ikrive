#!/usr/bin/env node
// Harness check: validates the SDD state and, with --full, runs lint, typecheck and tests.
// Usage: pnpm harness [--full]
import { spawnSync } from 'node:child_process';
import { activeFeature, ROOT, validateState } from './lib.mjs';

const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = color('32');
const yellow = color('33');
const red = color('31');

const ok = (msg) => console.log(`${green('[OK]')}    ${msg}`);
const warn = (msg) => console.log(`${yellow('[WARN]')}  ${msg}`);
const fail = (msg) => console.log(`${red('[FAIL]')}  ${msg}`);

let failed = false;

console.log('── 1. Estado del arnés (feature_list.json + specs/) ─────');
const { errors, warnings, features } = validateState();
for (const w of warnings) warn(w);
for (const e of errors) fail(e);
if (errors.length > 0) {
  failed = true;
} else {
  const count = (status) => features.filter((f) => f.status === status).length;
  ok(
    `${features.length} features: ${count('done')} done, ${count('pending')} pending, ` +
      `${count('spec_ready')} spec_ready, ${count('blocked')} blocked`,
  );
  const active = activeFeature(features);
  ok(active ? `Feature activa: #${active.id} ${active.name} (${active.status})` : 'Ninguna feature activa');
}

console.log('\n── 2. Rama de git ───────────────────────────────────────');
const branch = spawnSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const active = activeFeature(features);
if (active && branch !== `feat/${active.name}`) {
  warn(`Rama actual "${branch}"; la feature activa debería trabajarse en "feat/${active.name}"`);
} else {
  ok(`Rama actual: ${branch}`);
}

if (process.argv.includes('--full')) {
  for (const script of ['lint', 'typecheck', 'test']) {
    console.log(`\n── pnpm ${script} ${'─'.repeat(44 - script.length)}`);
    const result = spawnSync('pnpm', [script], { cwd: ROOT, stdio: 'inherit' });
    if (result.status === 0) {
      ok(`pnpm ${script}`);
    } else {
      fail(`pnpm ${script}`);
      failed = true;
    }
  }
} else {
  console.log('\n(Sin --full: no se han ejecutado lint, typecheck ni tests)');
}

console.log('\n── Resumen ──────────────────────────────────────────────');
if (failed) {
  fail('El arnés NO está en verde. Resuelve los errores antes de avanzar.');
  process.exit(1);
}
ok('Arnés en verde.');
