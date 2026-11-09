import assert from 'node:assert/strict';
import { test } from 'node:test';
import { androidVersion } from '../scripts/android-version.mjs';

test('maps v1.2.3 to 1.2.3 and 10203', () => {
  assert.deepEqual(androidVersion('v1.2.3'), { name: '1.2.3', code: 10203 });
  assert.deepEqual(androidVersion('v2.10.99'), { name: '2.10.99', code: 21099 });
});

test('maps v0.1.0 to 100', () => {
  assert.deepEqual(androidVersion('v0.1.0'), { name: '0.1.0', code: 100 });
});

test('rejects tags that are not v<major>.<minor>.<patch>', () => {
  for (const tag of ['1.2.3', 'v1.2', 'v1.2.3-rc.1', 'v1.100.0', 'v1.2.100', '']) {
    assert.throws(() => androidVersion(tag), Error, tag);
  }
});
