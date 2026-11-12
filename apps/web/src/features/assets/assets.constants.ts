/** Assets per page: four rows of the widest grid (6 columns). */
export const ASSETS_PAGE_SIZE = 24;
/**
 * A cached asset counts as stale this long before its download URL expires, so a page that
 * reuses cached data never hands the viewer a URL about to stop working.
 */
export const DOWNLOAD_URL_EXPIRY_MARGIN_MS = 60_000;
