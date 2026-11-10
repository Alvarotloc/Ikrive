import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Supply-chain hardening of the GitHub Actions: these tests read the YAML as text.
const github = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.github');
const workflowFiles = readdirSync(resolve(github, 'workflows')).filter((file) => /\.ya?ml$/.test(file));

test('every external action in the workflows is pinned by full SHA with its version', () => {
  assert.ok(workflowFiles.length > 0, '.github/workflows/ has workflows');
  let external = 0;
  for (const file of workflowFiles) {
    const text = readFileSync(resolve(github, 'workflows', file), 'utf8');
    for (const [line, ref] of text.matchAll(/^\s*(?:- )?uses:\s*(\S+).*$/gm)) {
      // Local actions and reusable workflows (`./...`) live in this repository.
      if (ref.startsWith('./')) continue;
      external++;
      assert.match(
        line.trim(),
        /^(?:- )?uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/,
        `${file}: ${line.trim()}`,
      );
    }
  }
  assert.ok(external > 0, 'the workflows use external actions');
});

test('dependabot keeps the github-actions up to date weekly', () => {
  const dependabot = readFileSync(resolve(github, 'dependabot.yml'), 'utf8');
  assert.match(dependabot, /^version: 2$/m);
  const ecosystems = [...dependabot.matchAll(/package-ecosystem: (\S+)/g)].map((match) => match[1]);
  assert.deepEqual(ecosystems, ['github-actions']);
  assert.match(dependabot, /^ {4}directory: \/$/m);
  assert.match(dependabot, /^ {4}schedule:\n {6}interval: weekly$/m);
});

test('dependabot groups minor and patch updates and leaves majors in their own PRs', () => {
  const dependabot = readFileSync(resolve(github, 'dependabot.yml'), 'utf8');
  // The `groups:` block: every line indented deeper than the key, up to the next key at its level.
  const block = /^ {4}groups:\n((?: {6,}.*\n?)+)/m.exec(dependabot);
  assert.ok(block, 'dependabot.yml has a groups block');
  const groups = [...block[1].matchAll(/^ {6}([\w-]+):$/gm)].map((match) => match[1]);
  // A single group: anything it does not take (the majors) gets one PR per action and version.
  assert.deepEqual(groups, ['github-actions']);
  assert.match(block[1], /^ {8}patterns:\n {10}- '\*'$/m);
  const types = /^ {8}update-types:\n((?: {10}- .*\n?)+)/m.exec(block[1]);
  assert.ok(types, 'the group limits its update-types');
  const updateTypes = types[1]
    .trim()
    .split('\n')
    .map((line) => line.replace(/^\s*- /, '').replace(/['"]/g, ''));
  assert.deepEqual(updateTypes.sort(), ['minor', 'patch']);
});
