import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The workflows only run on GitHub: these tests read their YAML as text and check the steps that matter.
const workflows = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.github/workflows');

/** Jobs of a workflow by name: the text of each `jobs.<name>` block (two-space indented keys). */
function jobs(file) {
  const text = readFileSync(resolve(workflows, file), 'utf8');
  const body = text.slice(text.indexOf('\njobs:\n'));
  const result = {};
  for (const block of body.split(/\n(?= {2}[\w-]+:\n)/).slice(1)) {
    result[/^ {2}([\w-]+):/.exec(block)[1]] = block;
  }
  return { text, jobs: result };
}

const release = jobs('release.yml');
const android = release.jobs.android;
const ci = jobs('ci.yml');

const SECRETS = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

test('release job checks the signing secrets before building', () => {
  assert.ok(android, 'release.yml has an android job');
  assert.match(release.text, /tags: \['v\*\.\*\.\*'\]/);
  const check = android.indexOf('name: Check the signing secrets');
  assert.ok(check > 0);
  const checkStep = android.slice(check, android.indexOf('\n      - ', check));
  for (const secret of SECRETS) assert.ok(checkStep.includes(`secrets.${secret}`), secret);
  assert.match(checkStep, /exit 1/);
  for (const later of ['pnpm install', 'build:web', 'assembleRelease', 'gh release']) {
    assert.ok(android.indexOf(later) > check, `${later} runs after the check`);
  }
});

test('signs the APK with apksigner', () => {
  assert.match(android, /zipalign" -p -f 4/);
  assert.match(android, /apksigner" sign --ks "\$keystore" --ks-key-alias "\$ANDROID_KEY_ALIAS"/);
  assert.match(android, /--ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD/);
  assert.match(android, /apksigner" verify/);
  // The keystore never stays on the runner, and no signing config goes through Gradle.
  assert.match(android, /trap 'rm -f "\$keystore"' EXIT/);
  assert.doesNotMatch(android, /signingConfig/);
});

test('uploads the APK and its sha256 to the tag release', () => {
  assert.match(android, /permissions:\n {6}contents: write/);
  assert.match(android, /sha256sum "ikrive-\$TAG\.apk" > "ikrive-\$TAG\.apk\.sha256"/);
  assert.match(android, /gh release view "\$TAG"[\s\S]*\|\| gh release create "\$TAG" --verify-tag/);
  assert.match(
    android,
    /gh release upload "\$TAG" "ikrive-\$TAG\.apk" "ikrive-\$TAG\.apk\.sha256" --clobber/,
  );
  assert.match(android, /TAG: \$\{\{ github\.ref_name \}\}/);
});

test('passes the version from the tag to Gradle', () => {
  assert.match(android, /node \.\.\/scripts\/android-version\.mjs "\$GITHUB_REF_NAME"/);
  assert.match(
    android,
    /\.\/gradlew assembleRelease -PikriveVersionName="\$name" -PikriveVersionCode="\$code"/,
  );
});

test('ci android job only runs when mobile, web, the lockfile or the workflow change', () => {
  const { changes, android: ciAndroid, check, e2e, docker } = ci.jobs;
  for (const path of ['apps/mobile/**', 'apps/web/**', 'pnpm-lock.yaml', '.github/workflows/ci.yml']) {
    assert.ok(changes.includes(`- '${path}'`), path);
  }
  assert.match(changes, /uses: dorny\/paths-filter@[0-9a-f]{40} # v3\.\d+\.\d+\n/);
  assert.match(changes, /android: \$\{\{ steps\.filter\.outputs\.android \}\}/);
  assert.match(ciAndroid, /\n {4}needs: changes\n/);
  assert.match(ciAndroid, /\n {4}if: needs\.changes\.outputs\.android == 'true'\n/);
  assert.match(ciAndroid, /\.\/gradlew assembleDebug/);
  assert.match(ciAndroid, /name: ikrive-debug-apk/);
  for (const [name, job] of Object.entries({ check, e2e, docker })) {
    assert.ok(job, name);
    assert.doesNotMatch(job, /\n {4}if:/, `${name} always runs`);
  }
  assert.match(check, /pnpm --filter @ikrive\/mobile build:web/);
});
