#!/usr/bin/env node
// Stop hook: Claude cannot end its turn while feature_list.json/specs/ are incoherent.
// Runs the fast state validation only; the full check (lint, typecheck, test) is `pnpm harness --full`.
import { readFileSync } from 'node:fs';
import { validateState } from './lib.mjs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {}

// Avoid loops: if Claude is already continuing because of this hook, let it stop.
if (input.stop_hook_active) process.exit(0);

const { errors } = validateState();
if (errors.length > 0) {
  process.stderr.write(
    `[harness] El estado del arnés es incoherente. Corrígelo (o explícale al usuario por qué no puedes) antes de terminar:\n${errors.map((e) => `- ${e}`).join('\n')}\n`,
  );
  process.exit(2);
}
