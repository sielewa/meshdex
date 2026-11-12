/**
 * Poly Haven's API terms require a User-Agent that names the calling software (ADR 013).
 * Bump the version with releases that change how ingest calls the API.
 */
export const POLYHAVEN_USER_AGENT = 'meshdex-ingest/0.1';

/** Catalog calls (lists, file listings) are small JSON documents. */
export const POLYHAVEN_REQUEST_TIMEOUT_MS = 15_000;

/** HTTP statuses worth retrying: rate limiting and server-side failures. */
export const POLYHAVEN_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, 429, 500, 502, 503, 504,
]);
