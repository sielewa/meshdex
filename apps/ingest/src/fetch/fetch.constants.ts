/** A hard cap, not a tuning knob: the API's terms forbid degrading it (ADR 013). */
export const FETCH_MAX_CONCURRENCY = 4;

/** Attempts per request or file, including the first one. */
export const FETCH_RETRY_ATTEMPTS = 3;

/** Exponential backoff with full jitter: wait random(0, min(cap, base × 2^attempt)). */
export const FETCH_RETRY_BASE_DELAY_MS = 500;
export const FETCH_RETRY_MAX_DELAY_MS = 5_000;
