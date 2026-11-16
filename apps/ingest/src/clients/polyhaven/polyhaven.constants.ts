/** Required by the API terms (ADR 013). */
export const POLYHAVEN_USER_AGENT = 'meshdex-ingest/0.1';

export const POLYHAVEN_REQUEST_TIMEOUT_MS = 15_000;

/** Sharp on a HiDPI grid card and above CLIP's 224 px input; ~35 KB as WebP. */
export const POLYHAVEN_PREVIEW_SIZE_PX = 512;
export const POLYHAVEN_PREVIEW_CONTENT_TYPE = 'image/webp';

export const POLYHAVEN_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, 429, 500, 502, 503, 504,
]);
