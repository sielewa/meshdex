/** Four rows of the widest grid. */
export const ASSETS_PAGE_SIZE = 24;
/** Cached data goes stale this long before its download URL expires. */
export const DOWNLOAD_URL_EXPIRY_MARGIN_MS = 60_000;
/** Reserves layout space; ingest requests 512 px renders. */
export const PREVIEW_IMAGE_SIZE_PX = 512;
export const SEARCH_RESULTS_STEP = 24;
/** The gateway allows 100 (ADR 020). */
export const MAX_SEARCH_RESULTS = 96;
/** Same as the gateway and ml-service (ADR 019). */
export const MAX_SEARCH_QUERY_LENGTH = 500;
