import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The workflow only runs on GitHub: these tests read its YAML as text and check its hardening.
const ci = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../.github/workflows/ci.yml'),
  'utf8',
);

/** Text before `jobs:`: the workflow-level keys (`name`, `on`, `permissions`...). */
const header = ci.slice(0, ci.indexOf('\njobs:\n'));

test('ci.yml limits the GITHUB_TOKEN to contents: read at workflow level', () => {
  const block = /\npermissions:\n((?: {2}.*\n)+)/.exec(`${header}\n`);
  assert.ok(block, 'ci.yml has a top-level permissions block');
  assert.deepEqual(block[1].trim().split('\n'), ['contents: read']);
});

test('the changes job declares the extra pull-requests: read it needs', () => {
  // Only the `changes` job: up to the next job key (same indentation) or the end of the file.
  const changes = /\n {2}changes:\n((?:(?: {3,}.*| *)\n)*)/.exec(ci);
  assert.ok(changes, 'ci.yml has a changes job');
  assert.match(changes[1], /^ {4}permissions:\n {6}contents: read\n {6}pull-requests: read\n/m);
});

test('dorny/paths-filter is pinned by full commit SHA with its version', () => {
  const uses = [...ci.matchAll(/uses: dorny\/paths-filter@(\S+)(.*)/g)];
  assert.ok(uses.length > 0, 'ci.yml uses dorny/paths-filter');
  for (const [, ref, comment] of uses) {
    assert.match(ref, /^[0-9a-f]{40}$/);
    assert.match(comment, /^ # v3\.\d+\.\d+$/);
  }
});
