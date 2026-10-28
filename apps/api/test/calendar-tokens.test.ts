import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFeedToken, hashVerifier, parseFeedToken, verifierMatches } from '../src/lib/tokens';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('calendar feed tokens', () => {
  it('generates 80-char hex tokens', () => {
    const first = generateFeedToken();
    const second = generateFeedToken();
    expect(first.token).toMatch(/^[0-9a-f]{80}$/);
    expect(first.selector).toMatch(/^[0-9a-f]{16}$/);
    expect(first.verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(first.token).toBe(first.selector + first.verifier);
    expect(second.token).not.toBe(first.token);
    expect(parseFeedToken(first.token)).toEqual({ selector: first.selector, verifier: first.verifier });
  });

  it('rejects malformed tokens', () => {
    const { token } = generateFeedToken();
    expect(parseFeedToken('')).toBeNull();
    expect(parseFeedToken(token.slice(1))).toBeNull();
    expect(parseFeedToken(`${token}0`)).toBeNull();
    expect(parseFeedToken(token.toUpperCase())).toBeNull();
    expect(parseFeedToken(`${token.slice(0, 79)}g`)).toBeNull();
    expect(parseFeedToken(`${token.slice(0, 16)}.${token.slice(17)}`)).toBeNull();
  });

  it('matches only the right verifier', () => {
    const { verifier } = generateFeedToken();
    const hash = hashVerifier(verifier);
    expect(hash).toBe(crypto.createHash('sha256').update(verifier).digest('hex'));
    expect(verifierMatches(verifier, hash)).toBe(true);
    expect(verifierMatches(generateFeedToken().verifier, hash)).toBe(false);
  });

  it('returns false for a hash of another length', () => {
    const { verifier } = generateFeedToken();
    const hash = hashVerifier(verifier);
    expect(() => verifierMatches(verifier, hash.slice(0, 32))).not.toThrow();
    expect(verifierMatches(verifier, hash.slice(0, 32))).toBe(false);
    expect(verifierMatches(verifier, '')).toBe(false);
    expect(verifierMatches(verifier, 'not hex at all')).toBe(false);
  });

  it('compares in constant time', () => {
    const spy = vi.spyOn(crypto, 'timingSafeEqual');
    const { verifier } = generateFeedToken();
    const hash = hashVerifier(verifier);

    expect(verifierMatches(verifier, hash)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(verifierMatches(generateFeedToken().verifier, hash)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
