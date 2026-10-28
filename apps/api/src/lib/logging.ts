import type { FastifyRequest } from 'fastify';

/** Where the logger writes (one JSON line per call). */
export interface LogStream {
  write(line: string): void;
}

/** Prefix of the public iCal feed: the rest of the path is the token, a secret. */
const CALENDAR_FEED_PREFIX = '/api/calendar/';
export const REDACTED_CALENDAR_FEED_URL = `${CALENDAR_FEED_PREFIX}***.ics`;

/** Any run this long of hex digits looks like a secret (the feed token has 80). UUIDs have hyphens. */
const LONG_HEX_RUN = /[0-9a-f]{32,}/gi;
const REDACTED_HEX = '***';

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Path normalized for the prefix check: decoded (so `%63alendar` cannot slip past), with repeated
 * slashes collapsed (`//api//calendar/`) and lowercased (`/API/Calendar/`).
 */
const normalizedPath = (url: string) =>
  safeDecode(url.split(/[?#]/, 1)[0] ?? '')
    .replace(/\/+/g, '/')
    .toLowerCase();

const redactHexRuns = (value: string) => value.replace(LONG_HEX_RUN, REDACTED_HEX);

/**
 * URL as it can be logged: any URL under the calendar feed (token, querystring, malformed path,
 * percent-encoded, repeated slashes or other casing) becomes `/api/calendar/***.ics`, so the feed
 * token never reaches the logs. As defense in depth, any run of 32+ hex digits elsewhere in the URL
 * (also once decoded) is replaced by `***`; other URLs are logged unchanged.
 */
export function redactUrl(url: string): string {
  if (normalizedPath(url).startsWith(CALENDAR_FEED_PREFIX)) return REDACTED_CALENDAR_FEED_URL;
  const redacted = redactHexRuns(url);
  const decoded = safeDecode(redacted);
  return redactHexRuns(decoded) === decoded ? redacted : redactHexRuns(decoded);
}

/** Fastify's default `req` serializer with the URL redacted. */
export function serializeRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: redactUrl(request.url),
    version:
      typeof request.headers['accept-version'] === 'string' ? request.headers['accept-version'] : undefined,
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}

/** Logger options of the server; `stream` lets tests capture the output. */
export function loggerOptions(level: string, stream?: LogStream) {
  return { level, serializers: { req: serializeRequest }, ...(stream ? { stream } : {}) };
}
