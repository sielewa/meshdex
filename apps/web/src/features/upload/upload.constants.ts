/** One TCP stream rarely fills an uplink; more would trip per-host connection limits. */
export const PART_UPLOAD_CONCURRENCY = 4;
export const PART_MAX_ATTEMPTS = 3;
/** First retry waits about this long, doubling per attempt, with full jitter. */
export const PART_RETRY_BASE_DELAY_MS = 500;
/** Renewed before a part starts instead of failing with 403. */
export const PART_URL_RENEW_MARGIN_MS = 60_000;
export const UPLOAD_SESSION_KEY_PREFIX = 'meshdex.upload.';
/** The server may have cleaned up older uploads. */
export const UPLOAD_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
