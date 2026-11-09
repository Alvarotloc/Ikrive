import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNativeApp } from './platform';

describe('isNativeApp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is native only in the native build mode', () => {
    expect(isNativeApp()).toBe(false);

    vi.stubEnv('MODE', 'production');
    expect(isNativeApp()).toBe(false);

    vi.stubEnv('MODE', 'native');
    expect(isNativeApp()).toBe(true);
  });
});
