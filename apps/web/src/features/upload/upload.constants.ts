/**
 * Parts in flight at once. Enough to fill a typical uplink (one TCP stream rarely does),
 * few enough not to starve the page or trip per-host connection limits. Memory stays flat
 * whatever the file size: parts are `Blob` slices streamed from disk by the browser.
 */
export const PART_UPLOAD_CONCURRENCY = 4;
/** Attempts per part, including the first. */
export const PART_MAX_ATTEMPTS = 3;
/** First retry waits about this long, doubling per attempt, with full jitter. */
export const PART_RETRY_BASE_DELAY_MS = 500;
/** URLs closer to expiry than this are renewed before a part starts, instead of failing with 403. */
export const PART_URL_RENEW_MARGIN_MS = 60_000;
/** localStorage key prefix of resumable upload sessions. */
export const UPLOAD_SESSION_KEY_PREFIX = 'meshdex.upload.';
/** Older sessions are dropped: the server may have cleaned the upload up in the meantime. */
export const UPLOAD_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
