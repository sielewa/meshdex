/**
 * Downloads in flight at most. The API belongs to someone else and its terms forbid
 * degrading it, so this is a hard cap, not a tuning knob (ADR 013).
 */
export const FETCH_MAX_CONCURRENCY = 4;

/** Attempts per request or file, including the first one. */
export const FETCH_RETRY_ATTEMPTS = 3;

/** Exponential backoff with full jitter: wait random(0, min(cap, base × 2^attempt)). */
export const FETCH_RETRY_BASE_DELAY_MS = 500;
export const FETCH_RETRY_MAX_DELAY_MS = 5_000;
