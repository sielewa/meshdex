/** Assets per page: four rows of the widest grid (6 columns). */
export const ASSETS_PAGE_SIZE = 24;
/**
 * A cached asset counts as stale this long before its download URL expires, so a page that
 * reuses cached data never hands the viewer a URL about to stop working.
 */
export const DOWNLOAD_URL_EXPIRY_MARGIN_MS = 60_000;
/** Edge of the square preview images (ingest requests 512 px renders); used to reserve layout space. */
export const PREVIEW_IMAGE_SIZE_PX = 512;
/** Search results per step: the same four rows as a page of the asset list. */
export const SEARCH_RESULTS_STEP = 24;
/** Most results "show more" goes up to; the gateway allows 100 (ADR 020). */
export const MAX_SEARCH_RESULTS = 96;
/** Same limit as the gateway and ml-service (ADR 019): longer queries are rejected. */
export const MAX_SEARCH_QUERY_LENGTH = 500;
