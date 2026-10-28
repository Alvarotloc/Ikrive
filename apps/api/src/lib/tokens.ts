// Default import on purpose: `crypto.timingSafeEqual` is looked up at call time so tests can spy on it.
import crypto from 'node:crypto';

const SELECTOR_BYTES = 8;
const VERIFIER_BYTES = 32;
const SELECTOR_LENGTH = SELECTOR_BYTES * 2;
const TOKEN_PATTERN = new RegExp(`^[0-9a-f]{${(SELECTOR_BYTES + VERIFIER_BYTES) * 2}}$`);

export interface FeedToken {
  /** Whole secret: selector + verifier, 80 lowercase hex characters without separators. */
  token: string;
  /** Not secret on its own: used to find the row. */
  selector: string;
  /** Secret part: only its SHA-256 is stored. */
  verifier: string;
}

/** New random selector/verifier token. */
export function generateFeedToken(): FeedToken {
  const selector = crypto.randomBytes(SELECTOR_BYTES).toString('hex');
  const verifier = crypto.randomBytes(VERIFIER_BYTES).toString('hex');
  return { token: selector + verifier, selector, verifier };
}

/** Splits a token into selector and verifier, or null when it is not 80 lowercase hex characters. */
export function parseFeedToken(token: string): Omit<FeedToken, 'token'> | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  return { selector: token.slice(0, SELECTOR_LENGTH), verifier: token.slice(SELECTOR_LENGTH) };
}

/** Hex SHA-256 of a verifier. */
export function hashVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('hex');
}

/** Constant-time check of a verifier against its stored hash; false (never throws) on a malformed hash. */
export function verifierMatches(verifier: string, hash: string): boolean {
  const actual = crypto.createHash('sha256').update(verifier).digest();
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
