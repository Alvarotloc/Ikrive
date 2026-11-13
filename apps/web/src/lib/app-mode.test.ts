import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalMode, MODE_KEY, setLocalMode } from './app-mode';

/** `localStorage` for Node, where the unit tests run. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe('app mode', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is local only in the native app with the stored flag', () => {
    vi.stubEnv('MODE', 'native');
    expect(isLocalMode()).toBe(false);

    setLocalMode(true);
    expect(localStorage.getItem(MODE_KEY)).toBe('local');
    expect(isLocalMode()).toBe(true);

    // The web never runs in local mode, whatever is stored.
    vi.stubEnv('MODE', 'production');
    expect(isLocalMode()).toBe(false);

    vi.stubEnv('MODE', 'native');
    setLocalMode(false);
    expect(localStorage.getItem(MODE_KEY)).toBeNull();
    expect(isLocalMode()).toBe(false);
  });
});
