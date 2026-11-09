import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const load = (env: Record<string, string> = {}) => loadConfig({ NODE_ENV: 'test', ...env });

describe('TRUSTED_ORIGINS', () => {
  it('parses TRUSTED_ORIGINS with the Capacitor defaults', () => {
    expect(load().TRUSTED_ORIGINS).toEqual(['capacitor://localhost', 'https://localhost']);
  });

  it('trims and drops empty TRUSTED_ORIGINS items', () => {
    const config = load({ TRUSTED_ORIGINS: ' myapp://ikrive , ,https://app.example.com:8443,' });
    expect(config.TRUSTED_ORIGINS).toEqual(['myapp://ikrive', 'https://app.example.com:8443']);
  });

  it('allows an empty TRUSTED_ORIGINS list', () => {
    expect(load({ TRUSTED_ORIGINS: '' }).TRUSTED_ORIGINS).toEqual([]);
    expect(load({ TRUSTED_ORIGINS: ' , ' }).TRUSTED_ORIGINS).toEqual([]);
  });

  it('rejects TRUSTED_ORIGINS entries that are not origins', () => {
    const invalid = [
      'https://app.example.com/path',
      'https://app.example.com?x=1',
      'https://app.example.com#top',
      '*',
      'https://*.example.com',
      'localhost:3000',
    ];
    for (const entry of invalid) {
      expect(() => load({ TRUSTED_ORIGINS: `capacitor://localhost,${entry}` }), entry).toThrow(
        /Invalid configuration[\s\S]*TRUSTED_ORIGINS/,
      );
    }
  });
});
