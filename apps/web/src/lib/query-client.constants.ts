/**
 * How long fetched data counts as fresh by default. Long enough that data rendered on the
 * server isn't refetched right after hydration; short enough that statuses stay current.
 */
export const DEFAULT_STALE_TIME_MS = 30_000;
